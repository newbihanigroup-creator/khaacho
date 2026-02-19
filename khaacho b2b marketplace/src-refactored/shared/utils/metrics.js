const client = require('prom-client');
const logger = require('./logger');

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'path', 'status'],
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

const queueJobDuration = new client.Histogram({
  name: 'queue_job_duration_ms',
  help: 'Duration of queue job processing in ms',
  labelNames: ['queue', 'job_type', 'status'],
  buckets: [100, 500, 1000, 5000, 10000, 30000, 60000],
});

const queueJobsTotal = new client.Counter({
  name: 'queue_jobs_total',
  help: 'Total number of queue jobs processed',
  labelNames: ['queue', 'job_type', 'status'],
});

const queueDepth = new client.Gauge({
  name: 'queue_depth',
  help: 'Current depth of queue',
  labelNames: ['queue'],
});

const databaseQueryDuration = new client.Histogram({
  name: 'database_query_duration_ms',
  help: 'Duration of database queries in ms',
  labelNames: ['operation', 'table'],
  buckets: [1, 5, 10, 50, 100, 500, 1000, 5000],
});

const databaseConnectionsActive = new client.Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections',
});

const aiRequestDuration = new client.Histogram({
  name: 'ai_request_duration_ms',
  help: 'Duration of AI requests in ms',
  labelNames: ['provider', 'method'],
  buckets: [100, 500, 1000, 5000, 10000, 30000],
});

const aiRequestsTotal = new client.Counter({
  name: 'ai_requests_total',
  help: 'Total number of AI requests',
  labelNames: ['provider', 'method', 'status'],
});

const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['service', 'method'],
});

const businessMetricsOrdersTotal = new client.Counter({
  name: 'business_orders_total',
  help: 'Total number of orders',
  labelNames: ['status'],
});

const businessMetricsRevenue = new client.Counter({
  name: 'business_revenue_total',
  help: 'Total revenue',
  labelNames: ['currency'],
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(queueJobDuration);
register.registerMetric(queueJobsTotal);
register.registerMetric(queueDepth);
register.registerMetric(databaseQueryDuration);
register.registerMetric(databaseConnectionsActive);
register.registerMetric(aiRequestDuration);
register.registerMetric(aiRequestsTotal);
register.registerMetric(circuitBreakerState);
register.registerMetric(businessMetricsOrdersTotal);
register.registerMetric(businessMetricsRevenue);

// Helper functions
const metrics = {
  register,
  
  // HTTP metrics
  recordHttpRequest(method, path, status, duration) {
    httpRequestDuration.labels(method, path, status).observe(duration);
    httpRequestsTotal.labels(method, path, status).inc();
  },
  
  // Queue metrics
  recordQueueJob(queue, jobType, status, duration) {
    queueJobDuration.labels(queue, jobType, status).observe(duration);
    queueJobsTotal.labels(queue, jobType, status).inc();
  },
  
  setQueueDepth(queue, depth) {
    queueDepth.labels(queue).set(depth);
  },
  
  // Database metrics
  recordDatabaseQuery(operation, table, duration) {
    databaseQueryDuration.labels(operation, table).observe(duration);
  },
  
  setDatabaseConnections(count) {
    databaseConnectionsActive.set(count);
  },
  
  // AI metrics
  recordAIRequest(provider, method, status, duration) {
    aiRequestDuration.labels(provider, method).observe(duration);
    aiRequestsTotal.labels(provider, method, status).inc();
  },
  
  // Circuit breaker metrics
  setCircuitBreakerState(service, method, state) {
    const stateValue = state === 'open' ? 2 : state === 'half-open' ? 1 : 0;
    circuitBreakerState.labels(service, method).set(stateValue);
  },
  
  // Business metrics
  recordOrder(status) {
    businessMetricsOrdersTotal.labels(status).inc();
  },
  
  recordRevenue(amount, currency = 'NPR') {
    businessMetricsRevenue.labels(currency).inc(amount);
  },
  
  // Generic helpers
  histogram(name, value, labels = {}) {
    try {
      const metric = register.getSingleMetric(name);
      if (metric) {
        metric.observe(labels, value);
      }
    } catch (error) {
      logger.error('Failed to record histogram metric', { name, error: error.message });
    }
  },
  
  increment(name, labels = {}, value = 1) {
    try {
      const metric = register.getSingleMetric(name);
      if (metric) {
        metric.inc(labels, value);
      }
    } catch (error) {
      logger.error('Failed to increment metric', { name, error: error.message });
    }
  },
  
  gauge(name, value, labels = {}) {
    try {
      const metric = register.getSingleMetric(name);
      if (metric) {
        metric.set(labels, value);
      }
    } catch (error) {
      logger.error('Failed to set gauge metric', { name, error: error.message });
    }
  },
};

module.exports = metrics;
