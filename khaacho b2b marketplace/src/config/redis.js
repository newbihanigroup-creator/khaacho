/**
 * Redis Client Configuration
 * Production-safe Redis connection with retry strategy and health checks
 * 
 * Features:
 * - Exponential backoff retry strategy
 * - Connection health monitoring
 * - Graceful error handling
 * - Structured logging
 * - No process crash on Redis failure
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');
const config = require('./index');

// Redis connection state
let redisClient = null;
let isConnected = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 10;

/**
 * Create Redis client with production-safe configuration
 * 
 * @returns {Redis} Redis client instance
 */
function createRedisClient() {
  // Check if Redis URL is configured
  if (!config.redis.url && !config.redis.host) {
    logger.warn('[REDIS] No Redis configuration found - running without Redis');
    logger.warn('[REDIS] Background jobs and caching will be disabled');
    return null;
  }

  const redisConfig = {
    // Connection settings
    ...(config.redis.url 
      ? { url: config.redis.url }
      : {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
        }
    ),

    // Connection behavior
    lazyConnect: true, // Don't connect immediately
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    
    // Retry strategy with exponential backoff
    retryStrategy: (times) => {
      connectionAttempts = times;
      
      if (times > MAX_CONNECTION_ATTEMPTS) {
        logger.error('[REDIS] Max connection attempts reached, giving up', {
          attempts: times,
          maxAttempts: MAX_CONNECTION_ATTEMPTS,
        });
        return null; // Stop retrying
      }

      // Exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms, 1600ms, 2000ms (max)
      const delay = Math.min(times * 50, 2000);
      
      logger.warn('[REDIS] Retrying connection...', {
        attempt: times,
        maxAttempts: MAX_CONNECTION_ATTEMPTS,
        nextRetryIn: `${delay}ms`,
      });

      return delay;
    },

    // Reconnect on specific errors
    reconnectOnError: (err) => {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      
      if (targetErrors.some(targetError => err.message.includes(targetError))) {
        logger.warn('[REDIS] Reconnecting due to error', {
          error: err.message,
          code: err.code,
        });
        return true; // Reconnect
      }
      
      return false; // Don't reconnect for other errors
    },

    // Connection timeout
    connectTimeout: 10000, // 10 seconds
    
    // Keep-alive
    keepAlive: 30000, // 30 seconds
    
    // Command timeout
    commandTimeout: 5000, // 5 seconds
  };

  logger.info('[REDIS] Creating Redis client...', {
    host: config.redis.url ? 'from REDIS_URL' : config.redis.host,
    port: config.redis.url ? 'from REDIS_URL' : config.redis.port,
    db: config.redis.db,
  });

  const client = new Redis(redisConfig);

  // Setup event handlers
  setupEventHandlers(client);

  return client;
}

/**
 * Setup Redis event handlers for monitoring and logging
 * 
 * @param {Redis} client - Redis client instance
 */
function setupEventHandlers(client) {
  // Connection successful
  client.on('connect', () => {
    logger.info('[REDIS] Connecting to Redis server...');
  });

  // Ready to accept commands
  client.on('ready', () => {
    isConnected = true;
    connectionAttempts = 0;
    logger.info('[REDIS] Connected - Ready to accept commands', {
      host: client.options.host || 'from URL',
      port: client.options.port || 'from URL',
      db: client.options.db,
    });
  });

  // Connection error
  client.on('error', (err) => {
    isConnected = false;
    
    // Log error but don't crash
    logger.error('[REDIS] Connection error', {
      error: err.message,
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
    });

    // Don't throw - let retry strategy handle it
  });

  // Connection closed
  client.on('close', () => {
    isConnected = false;
    logger.warn('[REDIS] Connection closed');
  });

  // Reconnecting
  client.on('reconnecting', (delay) => {
    logger.info('[REDIS] Reconnecting...', {
      delay: `${delay}ms`,
      attempt: connectionAttempts,
    });
  });

  // Connection ended (no more retries)
  client.on('end', () => {
    isConnected = false;
    logger.warn('[REDIS] Connection ended - no more retry attempts');
  });
}

/**
 * Initialize Redis connection
 * Attempts to connect but doesn't crash on failure
 * 
 * @returns {Promise<Redis|null>} Redis client or null if connection fails
 */
async function initializeRedis() {
  try {
    redisClient = createRedisClient();

    if (!redisClient) {
      logger.warn('[REDIS] Redis not configured - continuing without Redis');
      return null;
    }

    // Attempt to connect
    await redisClient.connect();

    // Verify connection with ping
    await pingRedis();

    logger.info('[REDIS] Initialization successful');
    return redisClient;

  } catch (error) {
    logger.error('[REDIS] Initialization failed', {
      error: error.message,
      code: error.code,
    });

    // Don't crash - continue without Redis
    logger.warn('[REDIS] Continuing without Redis - background jobs disabled');
    
    // Clean up failed client
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch (quitError) {
        // Ignore quit errors
      }
      redisClient = null;
    }

    return null;
  }
}

/**
 * Ping Redis to check connection health
 * 
 * @returns {Promise<boolean>} True if ping successful
 */
async function pingRedis() {
  if (!redisClient) {
    logger.warn('[REDIS] Cannot ping - client not initialized');
    return false;
  }

  try {
    const result = await redisClient.ping();
    
    if (result === 'PONG') {
      logger.info('[REDIS] Health check passed (PING -> PONG)');
      return true;
    } else {
      logger.warn('[REDIS] Health check unexpected response', { result });
      return false;
    }
  } catch (error) {
    logger.error('[REDIS] Health check failed', {
      error: error.message,
      code: error.code,
    });
    return false;
  }
}

/**
 * Get Redis client instance
 * 
 * @returns {Redis|null} Redis client or null if not connected
 */
function getRedisClient() {
  if (!redisClient) {
    logger.warn('[REDIS] Client requested but not initialized');
    return null;
  }

  if (!isConnected) {
    logger.warn('[REDIS] Client requested but not connected');
    return null;
  }

  return redisClient;
}

/**
 * Check if Redis is connected
 * 
 * @returns {boolean} True if connected
 */
function isRedisConnected() {
  return isConnected && redisClient !== null;
}

/**
 * Get Redis connection info
 * 
 * @returns {Object} Connection information
 */
function getConnectionInfo() {
  return {
    connected: isConnected,
    client: redisClient !== null,
    attempts: connectionAttempts,
    host: redisClient?.options?.host || 'unknown',
    port: redisClient?.options?.port || 'unknown',
    db: redisClient?.options?.db || 0,
  };
}

/**
 * Gracefully close Redis connection
 * 
 * @returns {Promise<void>}
 */
async function closeRedis() {
  if (!redisClient) {
    logger.info('[REDIS] No client to close');
    return;
  }

  try {
    logger.info('[REDIS] Closing connection...');
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
    logger.info('[REDIS] Connection closed gracefully');
  } catch (error) {
    logger.error('[REDIS] Error closing connection', {
      error: error.message,
    });
    
    // Force disconnect
    if (redisClient) {
      redisClient.disconnect();
      redisClient = null;
      isConnected = false;
    }
  }
}

/**
 * Execute Redis command with error handling
 * Returns null on error instead of throwing
 * 
 * @param {Function} command - Redis command to execute
 * @param {string} commandName - Command name for logging
 * @returns {Promise<any|null>} Command result or null on error
 */
async function safeExecute(command, commandName = 'command') {
  if (!isRedisConnected()) {
    logger.warn(`[REDIS] Cannot execute ${commandName} - not connected`);
    return null;
  }

  try {
    return await command();
  } catch (error) {
    logger.error(`[REDIS] Error executing ${commandName}`, {
      error: error.message,
      code: error.code,
    });
    return null;
  }
}

module.exports = {
  initializeRedis,
  getRedisClient,
  isRedisConnected,
  getConnectionInfo,
  pingRedis,
  closeRedis,
  safeExecute,
};
