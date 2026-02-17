const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { validateOrExit } = require('../shared/config/validateEnv');
const logger = require('../shared/utils/logger');
const metrics = require('../shared/utils/metrics');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/ratelimit');
const { authMiddleware } = require('./middleware/auth');

// Validate environment before starting
validateOrExit();

const app = express();

// Trust proxy (for Kubernetes/Load Balancer)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
    });
    
    metrics.histogram('http_request_duration_ms', duration, {
      method: req.method,
      path: req.route?.path || req.path,
      status: res.statusCode,
    });
  });
  
  next();
});

// Rate limiting
app.use('/api', rateLimiter);

// Health checks (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/ready', async (req, res) => {
  try {
    // Check database
    const prisma = require('../infrastructure/database/prisma.client');
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

// API routes
app.use('/api/v1', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  logger.info(`API server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = app;
