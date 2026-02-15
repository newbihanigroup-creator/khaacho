const express = require('express');

// Fatal Error Handler for Startup
process.on('uncaughtException', (err) => {
  console.error('>>> [FATAL] Uncaught Exception in server.js:', err);
  process.exit(1);
});

// ============================================================================
// STARTUP VALIDATION (CRITICAL - Run before anything else)
// ============================================================================

// Validate environment variables before loading any other modules
const { validateOrExit } = require('./config/validateEnv');
validateOrExit();

const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { securityHeaders, sanitizeRequest, corsOptions, apiLimiter } = require('./middleware/security');
const { trackAPIRequests, trackDatabaseQueries, startSystemMetricsCollection } = require('./middleware/monitoring');
const createRouter = require('./routes');
const { initializeQueues, shutdownQueues } = require('./queues/initializeQueues');

// Health system imports
const HealthService = require('./core/services/health.service');
const HealthController = require('./api/controllers/health.controller');
const createHealthRoutes = require('./api/routes/health.routes');

// ============================================================================
// DATABASE CONNECTION TEST (CRITICAL - Verify before starting)
// ============================================================================

const prisma = require('./config/database');

async function testDatabaseConnection() {
  try {
    logger.info('Testing database connection...');
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ Database connection successful');
    return true;
  } catch (error) {
    logger.error('❌ Database connection failed', { error: error.message });
    console.error('\n❌ STARTUP FAILED: Cannot connect to database');
    console.error('Error:', error.message);
    console.error('\nPlease check:');
    console.error('1. DATABASE_URL is correct:', process.env.DATABASE_URL ? 'SET' : 'MISSING');
    console.error('2. Database server is running');
    console.error('3. Database credentials are valid');
    console.error('4. Network connectivity to database');
    console.error('\nDATABASE_URL format: postgresql://user:password@host:5432/database\n');
    process.exit(1);
  }
}

// Test database connection before proceeding
testDatabaseConnection().then(() => {
  logger.info('Startup checks passed, initializing application...');
  startServer();
}).catch((error) => {
  logger.error('Startup checks failed', { error: error.message });
  process.exit(1);
});

// ============================================================================
// SERVER INITIALIZATION
// ============================================================================

function startServer() {
const app = express();

// ============================================================================
// PROXY CONFIGURATION (CRITICAL - Must be set before any middleware)
// ============================================================================

/**
 * Trust proxy configuration for Render and reverse proxies
 * 
 * When deployed behind a reverse proxy (like Render, Nginx, CloudFlare):
 * - The proxy adds X-Forwarded-* headers with the real client IP
 * - Express needs to trust these headers to get the correct client IP
 * - Without this, req.ip will be the proxy's IP, not the client's IP
 * 
 * Setting 'trust proxy' to 1 means:
 * - Trust the first proxy in front of the app
 * - Read X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host headers
 * - Use the rightmost IP in X-Forwarded-For as the client IP
 * 
 * Security:
 * - Only trust 1 proxy level (Render's proxy)
 * - Don't trust X-Forwarded-* headers from clients directly
 * - Rate limiting will work correctly with real client IPs
 */
app.set('trust proxy', 1);

logger.info('Proxy trust configured', {
  trustProxy: app.get('trust proxy'),
  environment: process.env.NODE_ENV,
});

// ============================================================================
// HEALTH SERVICE INITIALIZATION (Before middleware)
// ============================================================================

let healthService;
let redisClient = null;

try {
  // Try to get Redis client from queue initialization
  const queueManager = require('./queues/queueManager');
  if (queueManager && queueManager.redis) {
    redisClient = queueManager.redis;
    logger.info('Health service will monitor Redis connection');
  }
} catch (error) {
  logger.warn('Redis not available for health checks', { error: error.message });
}

// Initialize health service with Prisma and optional Redis
healthService = new HealthService(prisma, redisClient);
logger.info('Health service initialized');

// Create health controller and routes
const healthController = new HealthController(healthService);
const healthRoutes = createHealthRoutes(healthController);

// Mount health routes at root level (before API versioning)
app.use('/', healthRoutes);
logger.info('Health endpoints mounted: GET /health, GET /ready');

// ============================================================================
// SECURITY MIDDLEWARE (Applied first)
// ============================================================================

// Helmet - Security headers
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  } : false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS with production configuration
app.use(cors(corsOptions));

// Compression
app.use(compression());

// Custom security headers
app.use(securityHeaders);

// Request sanitization (prevent injection attacks)
app.use(sanitizeRequest);

// Rate limiting (applied to all API routes)
app.use('/api', apiLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' })); // Limit payload size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (admin panel)
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

// ============================================================================
// MONITORING MIDDLEWARE
// ============================================================================

// Track API requests (response time, status codes, error rates)
app.use(trackAPIRequests);

// Track database queries (latency monitoring)
trackDatabaseQueries();

// Request logging (after body parsing)
app.use((req, res, next) => {
  const startTime = Date.now();

  // Log request
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
  });

  // Log response time
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.path} completed`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id,
    });
  });

  next();
});

// Create main router with health routes
const routes = createRouter({ healthRoutes });

// API routes
app.use(`/api/${config.apiVersion}`, routes);

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/admin/login.html');
});

// 404 handler
app.use(errorHandler.notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`Khaacho platform running on port ${PORT}`);
  logger.info(`Environment: ${config.env}`);
  logger.info(`Admin panel: http://localhost:${PORT}/admin`);

  // Initialize job queues
  try {
    initializeQueues();
    logger.info('Job queue system initialized');
  } catch (error) {
    logger.error('Failed to initialize job queues', { error: error.message });
  }

  // Start credit score worker
  const creditScoreWorker = require('./workers/creditScore.worker');
  creditScoreWorker.start();
  logger.info('Credit score worker initialized');

  // Start risk control worker
  const riskControlWorker = require('./workers/riskControl.worker');
  riskControlWorker.start();
  logger.info('Risk control worker initialized');

  // Start order routing worker
  const orderRoutingWorker = require('./workers/orderRouting.worker');
  orderRoutingWorker.start();
  logger.info('Order routing worker initialized');

  // Start vendor performance worker
  const vendorPerformanceWorker = require('./workers/vendorPerformance.worker');
  vendorPerformanceWorker.start();
  logger.info('Vendor performance worker initialized');

  // Start price intelligence worker
  const priceIntelligenceWorker = require('./workers/priceIntelligence.worker');
  priceIntelligenceWorker.start();
  logger.info('Price intelligence worker initialized');

  // Start recovery worker (CRITICAL for crash recovery)
  const recoveryWorker = require('./workers/recovery.worker');
  recoveryWorker.initializeRecoveryWorker();
  logger.info('Recovery worker initialized - crash recovery enabled');

  // Start order timeout worker
  const orderTimeoutWorker = require('./workers/orderTimeout.worker');
  orderTimeoutWorker.start();
  logger.info('Order timeout worker initialized');

  // Start safe mode queue worker
  const safeModeQueueWorker = require('./workers/safeModeQueue.worker');
  safeModeQueueWorker.start();
  logger.info('Safe mode queue worker initialized');

  // Start vendor scoring worker
  const vendorScoringWorker = require('./workers/vendorScoring.worker');
  vendorScoringWorker.start();
  logger.info('Vendor scoring worker initialized');

  // Start order batching worker
  const orderBatchingWorker = require('./workers/orderBatching.worker');
  orderBatchingWorker.start();
  logger.info('Order batching worker initialized');

  // Start customer intelligence worker
  const customerIntelligenceWorker = require('./workers/customerIntelligence.worker');
  customerIntelligenceWorker.start();
  logger.info('Customer intelligence worker initialized');

  // Start self-healing worker
  const selfHealingWorker = require('./workers/selfHealing.worker');
  selfHealingWorker.start();
  logger.info('Self-healing worker initialized');

  // Start system metrics collection (CPU, memory, disk)
  startSystemMetricsCollection();
  logger.info('System metrics collection started');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');

  try {
    await shutdownQueues();
    logger.info('Job queues shut down successfully');
  } catch (error) {
    logger.error('Error shutting down job queues', { error: error.message });
  }

  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');

  try {
    await shutdownQueues();
    logger.info('Job queues shut down successfully');
  } catch (error) {
    logger.error('Error shutting down job queues', { error: error.message });
  }

  process.exit(0);
});

} // End of startServer function

module.exports = app;
