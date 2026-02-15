/**
 * WhatsApp Webhook Load Test
 * 
 * Simulates 500 concurrent users sending messages to WhatsApp webhook
 * 
 * Requirements:
 * - npm install axios
 * 
 * Usage: node load-test-whatsapp.js
 */

require('dotenv').config();
const axios = require('axios');

// Configuration
const CONFIG = {
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  webhookPath: '/api/whatsapp/webhook',
  concurrentUsers: 500,
  requestsPerUser: 3, // greeting, order, follow-up
  timeout: 30000, // 30 seconds
  delayBetweenRequests: 100, // 100ms between requests per user
};

// Test data
const TEST_MESSAGES = {
  greetings: [
    'Hi',
    'Hello',
    'Namaste',
    'Good morning',
    'Hey there',
  ],
  orders: [
    'RICE-1KG x 10',
    'I need 10 bags of rice',
    'Rice 10 kg\nDal 5 kg',
    '10 x RICE-1KG\n5 x DAL-1KG',
    'Please send 20 kg chamal',
    '15 bags rice\n10 bags dal\n5 bottles oil',
  ],
  followUps: [
    'Order #ORD260100001',
    'Status of my order',
    'Where is my delivery?',
    'Thanks',
    'When will it arrive?',
  ],
};

// Metrics tracking
class MetricsCollector {
  constructor() {
    this.requests = [];
    this.errors = [];
    this.startTime = null;
    this.endTime = null;
  }

  recordRequest(userId, messageType, duration, success, error = null) {
    const record = {
      userId,
      messageType,
      duration,
      success,
      error,
      timestamp: Date.now(),
    };

    if (success) {
      this.requests.push(record);
    } else {
      this.errors.push(record);
    }
  }

  start() {
    this.startTime = Date.now();
  }

  end() {
    this.endTime = Date.now();
  }

  getTotalDuration() {
    return this.endTime - this.startTime;
  }

  getSuccessCount() {
    return this.requests.length;
  }

  getFailureCount() {
    return this.errors.length;
  }

  getTotalRequests() {
    return this.requests.length + this.errors.length;
  }

  getAverageResponseTime() {
    if (this.requests.length === 0) return 0;
    const total = this.requests.reduce((sum, r) => sum + r.duration, 0);
    return Math.round(total / this.requests.length);
  }

  getMedianResponseTime() {
    if (this.requests.length === 0) return 0;
    const sorted = this.requests.map(r => r.duration).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  }

  getPercentile(percentile) {
    if (this.requests.length === 0) return 0;
    const sorted = this.requests.map(r => r.duration).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  getMinResponseTime() {
    if (this.requests.length === 0) return 0;
    return Math.min(...this.requests.map(r => r.duration));
  }

  getMaxResponseTime() {
    if (this.requests.length === 0) return 0;
    return Math.max(...this.requests.map(r => r.duration));
  }

  getRequestsPerSecond() {
    const durationSeconds = this.getTotalDuration() / 1000;
    return Math.round(this.getTotalRequests() / durationSeconds);
  }

  getSuccessRate() {
    const total = this.getTotalRequests();
    if (total === 0) return 0;
    return Math.round((this.getSuccessCount() / total) * 100);
  }

  getMetricsByType() {
    const types = ['greeting', 'order', 'followUp'];
    const metrics = {};

    types.forEach(type => {
      const typeRequests = this.requests.filter(r => r.messageType === type);
      const typeErrors = this.errors.filter(r => r.messageType === type);

      if (typeRequests.length > 0) {
        const durations = typeRequests.map(r => r.duration);
        metrics[type] = {
          total: typeRequests.length + typeErrors.length,
          success: typeRequests.length,
          failed: typeErrors.length,
          avgTime: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
          minTime: Math.min(...durations),
          maxTime: Math.max(...durations),
        };
      }
    });

    return metrics;
  }

  getErrorSummary() {
    const errorTypes = {};

    this.errors.forEach(error => {
      const errorMsg = error.error?.message || 'Unknown error';
      errorTypes[errorMsg] = (errorTypes[errorMsg] || 0) + 1;
    });

    return errorTypes;
  }
}

// Simulate single user
class UserSimulator {
  constructor(userId, metrics) {
    this.userId = userId;
    this.metrics = metrics;
    this.phoneNumber = `+977980000${String(userId).padStart(4, '0')}`;
  }

  getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  async sendMessage(messageType, messageText) {
    const startTime = Date.now();

    try {
      // Simulate WhatsApp webhook payload
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: this.phoneNumber,
                      id: `msg-${this.userId}-${Date.now()}-${Math.random()}`,
                      timestamp: Math.floor(Date.now() / 1000),
                      text: {
                        body: messageText,
                      },
                      type: 'text',
                    },
                  ],
                  metadata: {
                    display_phone_number: '15550000000',
                    phone_number_id: 'test-phone-id',
                  },
                },
                field: 'messages',
              },
            ],
            id: 'test-entry-id',
          },
        ],
        object: 'whatsapp_business_account',
      };

      const response = await axios.post(
        `${CONFIG.baseUrl}${CONFIG.webhookPath}`,
        payload,
        {
          timeout: CONFIG.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const duration = Date.now() - startTime;

      this.metrics.recordRequest(
        this.userId,
        messageType,
        duration,
        true
      );

      return { success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.metrics.recordRequest(
        this.userId,
        messageType,
        duration,
        false,
        {
          message: error.message,
          code: error.code,
          status: error.response?.status,
        }
      );

      return { success: false, duration, error };
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async run() {
    try {
      // Step 1: Send greeting
      const greeting = this.getRandomItem(TEST_MESSAGES.greetings);
      await this.sendMessage('greeting', greeting);
      await this.delay(CONFIG.delayBetweenRequests);

      // Step 2: Send order
      const order = this.getRandomItem(TEST_MESSAGES.orders);
      await this.sendMessage('order', order);
      await this.delay(CONFIG.delayBetweenRequests);

      // Step 3: Send follow-up
      const followUp = this.getRandomItem(TEST_MESSAGES.followUps);
      await this.sendMessage('followUp', followUp);

      return { success: true };
    } catch (error) {
      console.error(`User ${this.userId} failed:`, error.message);
      return { success: false, error };
    }
  }
}

// Progress bar
class ProgressBar {
  constructor(total) {
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
  }

  update(increment = 1) {
    this.current += increment;
    this.render();
  }

  render() {
    const percentage = Math.round((this.current / this.total) * 100);
    const filled = Math.round(percentage / 2);
    const empty = 50 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const eta = this.current > 0
      ? Math.round((elapsed / this.current) * (this.total - this.current))
      : 0;

    process.stdout.write(
      `\r[${bar}] ${percentage}% | ${this.current}/${this.total} users | ` +
      `Elapsed: ${elapsed}s | ETA: ${eta}s`
    );

    if (this.current === this.total) {
      process.stdout.write('\n');
    }
  }
}

// Main load test function
async function runLoadTest() {
  console.log('🚀 WhatsApp Webhook Load Test\n');
  console.log('='.repeat(80));
  console.log(`Configuration:`);
  console.log(`  Base URL: ${CONFIG.baseUrl}`);
  console.log(`  Webhook: ${CONFIG.webhookPath}`);
  console.log(`  Concurrent Users: ${CONFIG.concurrentUsers}`);
  console.log(`  Requests per User: ${CONFIG.requestsPerUser}`);
  console.log(`  Total Requests: ${CONFIG.concurrentUsers * CONFIG.requestsPerUser}`);
  console.log(`  Timeout: ${CONFIG.timeout}ms`);
  console.log('='.repeat(80));
  console.log('');

  // Check if server is reachable
  console.log('🔍 Checking server availability...');
  try {
    await axios.get(`${CONFIG.baseUrl}/health`, { timeout: 5000 });
    console.log('✅ Server is reachable\n');
  } catch (error) {
    console.error('❌ Server is not reachable:', error.message);
    console.error('   Please ensure the server is running at', CONFIG.baseUrl);
    process.exit(1);
  }

  // Initialize metrics
  const metrics = new MetricsCollector();
  const progressBar = new ProgressBar(CONFIG.concurrentUsers);

  console.log('🏃 Starting load test...\n');

  // Start timer
  metrics.start();

  // Create user simulators
  const users = [];
  for (let i = 1; i <= CONFIG.concurrentUsers; i++) {
    users.push(new UserSimulator(i, metrics));
  }

  // Run all users concurrently
  const promises = users.map(user =>
    user.run().then(() => progressBar.update())
  );

  await Promise.all(promises);

  // End timer
  metrics.end();

  // Generate report
  console.log('\n');
  console.log('='.repeat(80));
  console.log('📊 LOAD TEST RESULTS');
  console.log('='.repeat(80));
  console.log('');

  // Overall metrics
  console.log('Overall Metrics:');
  console.log(`  Total Requests: ${metrics.getTotalRequests()}`);
  console.log(`  Successful: ${metrics.getSuccessCount()} (${metrics.getSuccessRate()}%)`);
  console.log(`  Failed: ${metrics.getFailureCount()}`);
  console.log(`  Total Duration: ${Math.round(metrics.getTotalDuration() / 1000)}s`);
  console.log(`  Requests/Second: ${metrics.getRequestsPerSecond()}`);
  console.log('');

  // Response time metrics
  console.log('Response Time Metrics:');
  console.log(`  Average: ${metrics.getAverageResponseTime()}ms`);
  console.log(`  Median: ${metrics.getMedianResponseTime()}ms`);
  console.log(`  Min: ${metrics.getMinResponseTime()}ms`);
  console.log(`  Max: ${metrics.getMaxResponseTime()}ms`);
  console.log(`  P50: ${metrics.getPercentile(50)}ms`);
  console.log(`  P75: ${metrics.getPercentile(75)}ms`);
  console.log(`  P90: ${metrics.getPercentile(90)}ms`);
  console.log(`  P95: ${metrics.getPercentile(95)}ms`);
  console.log(`  P99: ${metrics.getPercentile(99)}ms`);
  console.log('');

  // Metrics by message type
  console.log('Metrics by Message Type:');
  const typeMetrics = metrics.getMetricsByType();
  Object.entries(typeMetrics).forEach(([type, data]) => {
    console.log(`  ${type}:`);
    console.log(`    Total: ${data.total}`);
    console.log(`    Success: ${data.success}`);
    console.log(`    Failed: ${data.failed}`);
    console.log(`    Avg Time: ${data.avgTime}ms`);
    console.log(`    Min Time: ${data.minTime}ms`);
    console.log(`    Max Time: ${data.maxTime}ms`);
  });
  console.log('');

  // Error summary
  if (metrics.getFailureCount() > 0) {
    console.log('Error Summary:');
    const errorSummary = metrics.getErrorSummary();
    Object.entries(errorSummary).forEach(([error, count]) => {
      console.log(`  ${error}: ${count} occurrences`);
    });
    console.log('');
  }

  // Performance assessment
  console.log('Performance Assessment:');
  const avgTime = metrics.getAverageResponseTime();
  const successRate = metrics.getSuccessRate();
  const p95 = metrics.getPercentile(95);

  let performanceGrade = 'F';
  let performanceColor = '🔴';

  if (successRate >= 99 && avgTime < 100 && p95 < 200) {
    performanceGrade = 'A+';
    performanceColor = '🟢';
  } else if (successRate >= 95 && avgTime < 200 && p95 < 500) {
    performanceGrade = 'A';
    performanceColor = '🟢';
  } else if (successRate >= 90 && avgTime < 500 && p95 < 1000) {
    performanceGrade = 'B';
    performanceColor = '🟡';
  } else if (successRate >= 80 && avgTime < 1000 && p95 < 2000) {
    performanceGrade = 'C';
    performanceColor = '🟡';
  } else if (successRate >= 70) {
    performanceGrade = 'D';
    performanceColor = '🟠';
  }

  console.log(`  Grade: ${performanceColor} ${performanceGrade}`);
  console.log('');

  // Recommendations
  console.log('Recommendations:');
  if (avgTime > 500) {
    console.log('  ⚠️  Average response time is high (>500ms)');
    console.log('     Consider optimizing database queries or adding caching');
  }
  if (p95 > 1000) {
    console.log('  ⚠️  P95 response time is high (>1000ms)');
    console.log('     Some requests are taking too long - investigate slow queries');
  }
  if (successRate < 95) {
    console.log('  ⚠️  Success rate is below 95%');
    console.log('     Check error logs and fix failing requests');
  }
  if (metrics.getRequestsPerSecond() < 50) {
    console.log('  ⚠️  Throughput is low (<50 req/s)');
    console.log('     Consider scaling horizontally or optimizing request handling');
  }

  if (performanceGrade === 'A+' || performanceGrade === 'A') {
    console.log('  ✅ System is performing well!');
  }
  console.log('');

  console.log('='.repeat(80));
  console.log('');

  // Save detailed report to file
  const report = {
    config: CONFIG,
    timestamp: new Date().toISOString(),
    summary: {
      totalRequests: metrics.getTotalRequests(),
      successful: metrics.getSuccessCount(),
      failed: metrics.getFailureCount(),
      successRate: metrics.getSuccessRate(),
      totalDuration: metrics.getTotalDuration(),
      requestsPerSecond: metrics.getRequestsPerSecond(),
    },
    responseTimes: {
      average: metrics.getAverageResponseTime(),
      median: metrics.getMedianResponseTime(),
      min: metrics.getMinResponseTime(),
      max: metrics.getMaxResponseTime(),
      p50: metrics.getPercentile(50),
      p75: metrics.getPercentile(75),
      p90: metrics.getPercentile(90),
      p95: metrics.getPercentile(95),
      p99: metrics.getPercentile(99),
    },
    byType: typeMetrics,
    errors: metrics.getErrorSummary(),
    performanceGrade,
  };

  const fs = require('fs');
  const reportFile = `load-test-report-${Date.now()}.json`;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`📄 Detailed report saved to: ${reportFile}\n`);
}

// Run the load test
if (require.main === module) {
  runLoadTest()
    .then(() => {
      console.log('✅ Load test completed successfully!\n');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Load test failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

module.exports = { runLoadTest, UserSimulator, MetricsCollector };
