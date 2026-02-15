require('dotenv').config();

// Clean REDIS_URL if it contains command prefixes (common mistake on Render)
if (process.env.REDIS_URL && process.env.REDIS_URL.includes('redis-cli')) {
  console.log('>>> [STARTUP] Cleaning malformed REDIS_URL...');
  const match = process.env.REDIS_URL.match(/rediss?:\/\/[^\s]+/);
  if (match) {
    process.env.REDIS_URL = match[0];
  }
}

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  const errorMsg = `
╔════════════════════════════════════════════════════════════════╗
║                  CONFIGURATION ERROR                           ║
╚════════════════════════════════════════════════════════════════╝

Missing required environment variables: ${missingEnvVars.join(', ')}

Required variables:
  - DATABASE_URL: PostgreSQL connection string
  - JWT_SECRET: Secret key for JWT tokens (min 32 characters)

Please check:
  1. .env file exists in project root
  2. All required variables are set
  3. No typos in variable names

Example .env file:
  DATABASE_URL="postgresql://user:password@localhost:5432/khaacho"
  JWT_SECRET="your-super-secret-jwt-key-change-in-production"

See .env.example for complete reference.
`;
  console.error(errorMsg);
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiVersion: process.env.API_VERSION || 'v1',

  database: {
    url: process.env.DATABASE_URL,
    poolMin: parseInt(process.env.DB_POOL_MIN, 10) || 10,
    poolMax: parseInt(process.env.DB_POOL_MAX, 10) || 50,
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 10000,
  },

  redis: {
    // Support both REDIS_URL (Render format) and individual settings
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    async: process.env.WHATSAPP_ASYNC === 'true',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    maxFiles: process.env.LOG_MAX_FILES || '30d',
    maxSize: process.env.LOG_MAX_SIZE || '50m',
  },

  performance: {
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    metricsInterval: parseInt(process.env.METRICS_INTERVAL, 10) || 60000,
  },

  features: {
    backgroundJobs: process.env.ENABLE_BACKGROUND_JOBS !== 'false',
    asyncNotifications: process.env.ASYNC_NOTIFICATIONS !== 'false',
  },
};
