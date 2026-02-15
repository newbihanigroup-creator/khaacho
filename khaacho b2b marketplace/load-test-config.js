/**
 * Load Test Configuration
 * 
 * Customize load test parameters
 */

module.exports = {
  // Test scenarios
  scenarios: {
    // Light load - Development testing
    light: {
      concurrentUsers: 10,
      requestsPerUser: 3,
      delayBetweenRequests: 500,
      description: 'Light load for development testing',
    },

    // Medium load - Staging testing
    medium: {
      concurrentUsers: 100,
      requestsPerUser: 3,
      delayBetweenRequests: 200,
      description: 'Medium load for staging environment',
    },

    // Heavy load - Production capacity testing
    heavy: {
      concurrentUsers: 500,
      requestsPerUser: 3,
      delayBetweenRequests: 100,
      description: 'Heavy load for production capacity testing',
    },

    // Stress test - Breaking point testing
    stress: {
      concurrentUsers: 1000,
      requestsPerUser: 3,
      delayBetweenRequests: 50,
      description: 'Stress test to find breaking point',
    },

    // Spike test - Sudden traffic spike
    spike: {
      concurrentUsers: 2000,
      requestsPerUser: 2,
      delayBetweenRequests: 10,
      description: 'Spike test for sudden traffic surge',
    },
  },

  // Server configurations
  servers: {
    local: {
      baseUrl: 'http://localhost:3000',
      description: 'Local development server',
    },
    staging: {
      baseUrl: 'https://staging.khaacho.com',
      description: 'Staging environment',
    },
    production: {
      baseUrl: 'https://api.khaacho.com',
      description: 'Production environment',
    },
  },

  // Default configuration
  defaults: {
    timeout: 30000, // 30 seconds
    webhookPath: '/api/whatsapp/webhook',
  },

  // Performance thresholds
  thresholds: {
    excellent: {
      successRate: 99,
      avgResponseTime: 100,
      p95ResponseTime: 200,
      grade: 'A+',
    },
    good: {
      successRate: 95,
      avgResponseTime: 200,
      p95ResponseTime: 500,
      grade: 'A',
    },
    acceptable: {
      successRate: 90,
      avgResponseTime: 500,
      p95ResponseTime: 1000,
      grade: 'B',
    },
    poor: {
      successRate: 80,
      avgResponseTime: 1000,
      p95ResponseTime: 2000,
      grade: 'C',
    },
    failing: {
      successRate: 70,
      avgResponseTime: 2000,
      p95ResponseTime: 5000,
      grade: 'D',
    },
  },
};
