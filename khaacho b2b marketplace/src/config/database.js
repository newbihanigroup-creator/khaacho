const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

// Validate DATABASE_URL before creating Prisma client
if (!process.env.DATABASE_URL) {
  console.error('\n❌ FATAL ERROR: DATABASE_URL environment variable is not set');
  console.error('Please set DATABASE_URL in your .env file');
  console.error('Example: DATABASE_URL="postgresql://user:password@localhost:5432/khaacho?connection_limit=10"\n');
  process.exit(1);
}

// Validate DATABASE_URL format
if (!process.env.DATABASE_URL.startsWith('postgresql://') && !process.env.DATABASE_URL.startsWith('postgres://')) {
  console.error('\n❌ FATAL ERROR: DATABASE_URL must be a PostgreSQL connection string');
  console.error('Current value does not start with postgresql:// or postgres://');
  console.error('Example: DATABASE_URL="postgresql://user:password@localhost:5432/khaacho?connection_limit=10"\n');
  process.exit(1);
}

/**
 * Production-Optimized Prisma Configuration
 * 
 * Connection Pooling:
 * - connection_limit: Maximum connections per Prisma Client instance
 * - pool_timeout: Time to wait for available connection (default: 10s)
 * - connect_timeout: Time to wait for initial connection (default: 5s)
 * 
 * For production with multiple workers:
 * - Set connection_limit=10 per worker
 * - Total connections = workers * connection_limit
 * - Ensure PostgreSQL max_connections > total connections
 * 
 * Query Performance:
 * - Logs slow queries (>500ms) for optimization
 * - Tracks query duration and parameters
 * - Monitors connection pool health
 */
const prismaConfig = {
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'warn',
    },
    {
      emit: 'event',
      level: 'info',
    },
  ],
};

// Singleton pattern for connection reuse across workers
let prismaInstance = null;

/**
 * Get or create Prisma client instance
 * Ensures single instance per process for connection reuse
 */
function getPrismaClient() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient(prismaConfig);
    setupPrismaEventHandlers(prismaInstance);
    logger.info('Prisma client initialized', {
      nodeEnv: process.env.NODE_ENV,
      pid: process.pid,
    });
  }
  return prismaInstance;
}

/**
 * Setup event handlers for Prisma client
 */
function setupPrismaEventHandlers(client) {
  // Log slow queries (> 500ms) for optimization
  client.$on('query', (e) => {
    const duration = e.duration;
    
    if (duration > 500) {
      logger.warn('Slow query detected', {
        query: e.query.substring(0, 200), // Truncate long queries
        duration: `${duration}ms`,
        params: e.params,
        timestamp: e.timestamp,
      });
    }
    
    // Log all queries in development
    if (process.env.NODE_ENV === 'development' && duration > 100) {
      logger.debug('Query executed', {
        query: e.query.substring(0, 100),
        duration: `${duration}ms`,
      });
    }
  });

  // Log database errors
  client.$on('error', (e) => {
    logger.error('Database error', {
      message: e.message,
      target: e.target,
      timestamp: e.timestamp,
    });
  });

  // Log warnings
  client.$on('warn', (e) => {
    logger.warn('Database warning', {
      message: e.message,
      timestamp: e.timestamp,
    });
  });

  // Log info messages
  client.$on('info', (e) => {
    logger.info('Database info', {
      message: e.message,
      timestamp: e.timestamp,
    });
  });
}

// Create singleton instance
const prisma = getPrismaClient();

/**
 * Retry logic for transient database errors
 * Handles connection timeouts, deadlocks, and temporary failures
 * 
 * @param {Function} operation - Database operation to retry
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @param {number} delayMs - Delay between retries in ms (default: 1000)
 * @returns {Promise} Operation result
 */
async function withRetry(operation, maxRetries = 3, delayMs = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      const isRetryable = isRetryableError(error);
      
      if (!isRetryable || attempt === maxRetries) {
        logger.error('Database operation failed', {
          attempt,
          maxRetries,
          error: error.message,
          code: error.code,
          isRetryable,
        });
        throw error;
      }
      
      // Log retry attempt
      logger.warn('Retrying database operation', {
        attempt,
        maxRetries,
        error: error.message,
        code: error.code,
        delayMs,
      });
      
      // Exponential backoff
      const backoffDelay = delayMs * Math.pow(2, attempt - 1);
      await sleep(backoffDelay);
    }
  }
  
  throw lastError;
}

/**
 * Check if database error is retryable
 * 
 * Retryable errors:
 * - P1001: Can't reach database server
 * - P1002: Database server timeout
 * - P1008: Operations timed out
 * - P1017: Server closed connection
 * - P2024: Connection pool timeout
 * - P2034: Transaction failed (deadlock)
 * - 40001: Serialization failure (PostgreSQL)
 * - 40P01: Deadlock detected (PostgreSQL)
 * - 53300: Too many connections (PostgreSQL)
 * - 57P03: Cannot connect now (PostgreSQL)
 * - ECONNREFUSED: Connection refused
 * - ETIMEDOUT: Connection timeout
 * 
 * @param {Error} error - Database error
 * @returns {boolean} True if error is retryable
 */
function isRetryableError(error) {
  const retryableCodes = [
    'P1001', // Can't reach database server
    'P1002', // Database server timeout
    'P1008', // Operations timed out
    'P1017', // Server closed connection
    'P2024', // Connection pool timeout
    'P2034', // Transaction failed
    '40001', // Serialization failure
    '40P01', // Deadlock detected
    '53300', // Too many connections
    '57P03', // Cannot connect now
    'ECONNREFUSED', // Connection refused
    'ETIMEDOUT', // Connection timeout
    'ENOTFOUND', // DNS lookup failed
  ];
  
  // Check Prisma error code
  if (error.code && retryableCodes.includes(error.code)) {
    return true;
  }
  
  // Check PostgreSQL error code
  if (error.meta?.code && retryableCodes.includes(error.meta.code)) {
    return true;
  }
  
  // Check error message for connection issues
  const errorMessage = error.message?.toLowerCase() || '';
  const connectionErrors = [
    'connection',
    'timeout',
    'deadlock',
    'pool',
    'econnrefused',
    'etimedout',
  ];
  
  return connectionErrors.some(keyword => errorMessage.includes(keyword));
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Connection pool health check
async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connection healthy');
    return true;
  } catch (error) {
    logger.error('Database connection failed', {
      error: error.message,
    });
    return false;
  }
}

// Graceful shutdown
async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected successfully');
  } catch (error) {
    logger.error('Error disconnecting database', {
      error: error.message,
    });
  }
}

// Connection pool statistics
async function getConnectionPoolStats() {
  try {
    const result = await prisma.$queryRaw`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections,
        max(state_change) as last_activity
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    
    return result[0];
  } catch (error) {
    logger.error('Error getting connection pool stats', {
      error: error.message,
    });
    return null;
  }
}

// Database size and statistics
async function getDatabaseStats() {
  try {
    const sizeResult = await prisma.$queryRaw`
      SELECT pg_size_pretty(pg_database_size(current_database())) as database_size
    `;
    
    const tableStats = await prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
        n_live_tup as row_count
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `;
    
    return {
      databaseSize: sizeResult[0].database_size,
      largestTables: tableStats,
    };
  } catch (error) {
    logger.error('Error getting database stats', {
      error: error.message,
    });
    return null;
  }
}

module.exports = prisma;
module.exports.withRetry = withRetry;
module.exports.checkDatabaseConnection = checkDatabaseConnection;
module.exports.disconnectDatabase = disconnectDatabase;
module.exports.getConnectionPoolStats = getConnectionPoolStats;
module.exports.getDatabaseStats = getDatabaseStats;
module.exports.getPrismaClient = getPrismaClient;
