const { validateOrExit } = require('../shared/config/validateEnv');
const logger = require('../shared/utils/logger');
const { queueManager } = require('../infrastructure/queue/queue.manager');
const orderProcessor = require('./processors/order.processor');
const aiProcessor = require('./processors/ai.processor');
const riskProcessor = require('./processors/risk.processor');
const routingProcessor = require('./processors/routing.processor');
const notificationProcessor = require('./processors/notification.processor');

// Validate environment
validateOrExit();

logger.info('Starting worker service...');

// Initialize queue manager
queueManager.initialize();

// Register processors
logger.info('Registering processors...');

queueManager.registerProcessor('ORDER_PROCESSING', async (job) => {
  return await orderProcessor.process(job);
}, 10); // 10 concurrent jobs

queueManager.registerProcessor('AI_PROCESSING', async (job) => {
  return await aiProcessor.process(job);
}, 5); // 5 concurrent AI calls

queueManager.registerProcessor('RISK_ASSESSMENT', async (job) => {
  return await riskProcessor.process(job);
}, 10);

queueManager.registerProcessor('ORDER_ROUTING', async (job) => {
  return await routingProcessor.process(job);
}, 20);

queueManager.registerProcessor('NOTIFICATION', async (job) => {
  return await notificationProcessor.process(job);
}, 10);

logger.info('All processors registered');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down workers...');
  await queueManager.closeAll();
  logger.info('Workers shut down');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down workers...');
  await queueManager.closeAll();
  logger.info('Workers shut down');
  process.exit(0);
});

// Keep process alive
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

logger.info('Worker service started successfully');
