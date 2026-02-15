/**
 * Enhanced Health Monitoring System Test
 * 
 * Tests production metrics tracking:
 * 1. Database connection status
 * 2. Queue backlog size
 * 3. WhatsApp webhook latency
 * 4. Failed orders per hour
 * 5. OCR processing failures
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Test configuration
const config = {
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

/**
 * Test helper functions
 */
function logTest(name, passed, details = {}) {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}`);
  
  if (details.message) {
    console.log(`   ${details.message}`);
  }
  
  if (details.data) {
    console.log(`   Data:`, JSON.stringify(details.data, null, 2));
  }
  
  results.tests.push({ name, passed, details });
  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test 1: Basic health endpoint
 */
async function testBasicHealth() {
  console.log('\n📋 Test 1: Basic Health Endpoint');
  
  try {
    const response = await axios.get(`${BASE_URL}/health`, config);
    
    const passed = response.status === 200 &&
                   response.data.success === true &&
                   response.data.data.status === 'ok';
    
    logTest('Basic health endpoint', passed, {
      message: `Status: ${response.data.data.status}, Uptime: ${response.data.data.uptime}s`,
      data: response.data.data,
    });
  } catch (error) {
    logTest('Basic health endpoint', false, {
      message: error.message,
    });
  }
}

/**
 * Test 2: Readiness endpoint
 */
async function testReadiness() {
  console.log('\n📋 Test 2: Readiness Endpoint');
  
  try {
    const response = await axios.get(`${BASE_URL}/ready`, config);
    
    const passed = response.status === 200 &&
                   response.data.data.checks.database === true;
    
    logTest('Readiness endpoint', passed, {
      message: `Status: ${response.data.data.status}, Database: ${response.data.data.checks.database}, Redis: ${response.data.data.checks.redis}`,
      data: response.data.data.checks,
    });
  } catch (error) {
    logTest('Readiness endpoint', false, {
      message: error.message,
    });
  }
}

/**
 * Test 3: Production metrics endpoint
 */
async function testProductionMetrics() {
  console.log('\n📋 Test 3: Production Metrics Endpoint');
  
  try {
    const response = await axios.get(`${BASE_URL}/health/metrics`, config);
    
    const data = response.data.data;
    
    // Check all required metrics are present
    const hasDatabase = data.database && typeof data.database.status === 'boolean';
    const hasQueues = data.queues && typeof data.queues.total === 'number';
    const hasWebhooks = data.webhooks && typeof data.webhooks.avgLatencyMs === 'number';
    const hasOrders = data.orders && typeof data.orders.totalCount === 'number';
    const hasOCR = data.ocr && typeof data.ocr.failedCount === 'number';
    
    const passed = response.status === 200 &&
                   hasDatabase &&
                   hasQueues &&
                   hasWebhooks &&
                   hasOrders &&
                   hasOCR;
    
    logTest('Production metrics endpoint', passed, {
      message: `Database: ${data.database.status}, Queue backlog: ${data.queues.total}, Webhook latency: ${data.webhooks.avgLatencyMs}ms, Failed orders: ${data.orders.totalCount}, OCR failures: ${data.ocr.failedCount}`,
    });
    
    // Log detailed metrics
    console.log('\n   📊 Detailed Metrics:');
    console.log(`   Database Status: ${data.database.status ? 'Connected' : 'Disconnected'}`);
    console.log(`   Database Response Time: ${data.database.responseTimeMs}ms`);
    console.log(`   Redis Status: ${data.redis.status ? 'Connected' : 'Disconnected'}`);
    console.log(`   Redis Response Time: ${data.redis.responseTimeMs}ms`);
    console.log(`   Queue Backlog Total: ${data.queues.total}`);
    console.log(`   Queue Status: ${data.queues.status}`);
    console.log(`   Webhook Avg Latency: ${data.webhooks.avgLatencyMs}ms`);
    console.log(`   Webhook P95 Latency: ${data.webhooks.p95LatencyMs}ms`);
    console.log(`   Webhook Status: ${data.webhooks.status}`);
    console.log(`   Failed Orders (1h): ${data.orders.totalCount}`);
    console.log(`   Order Status: ${data.orders.status}`);
    console.log(`   OCR Failures (1h): ${data.ocr.failedCount}`);
    console.log(`   OCR Failure Rate: ${data.ocr.failureRate}%`);
    console.log(`   OCR Status: ${data.ocr.status}`);
    
    // Log queue breakdown
    if (Object.keys(data.queues.byQueue).length > 0) {
      console.log('\n   📦 Queue Breakdown:');
      Object.entries(data.queues.byQueue).forEach(([queueName, stats]) => {
        console.log(`   - ${queueName}: ${stats.pending} pending, ${stats.failed} failed`);
      });
    }
    
    // Log webhook breakdown
    if (Object.keys(data.webhooks.bySource).length > 0) {
      console.log('\n   🔗 Webhook Breakdown:');
      Object.entries(data.webhooks.bySource).forEach(([source, stats]) => {
        console.log(`   - ${source}: ${stats.avgLatencyMs}ms avg, ${stats.totalRequests} requests`);
      });
    }
    
    return data;
  } catch (error) {
    logTest('Production metrics endpoint', false, {
      message: error.message,
    });
    return null;
  }
}

/**
 * Test 4: Health alerts endpoint
 */
async function testHealthAlerts() {
  console.log('\n📋 Test 4: Health Alerts Endpoint');
  
  try {
    const response = await axios.get(`${BASE_URL}/health/alerts`, config);
    
    const passed = response.status === 200 &&
                   Array.isArray(response.data.data.alerts);
    
    const alertCount = response.data.data.count;
    
    logTest('Health alerts endpoint', passed, {
      message: `Active alerts: ${alertCount}`,
    });
    
    if (alertCount > 0) {
      console.log('\n   ⚠️  Active Alerts:');
      response.data.data.alerts.forEach((alert, index) => {
        console.log(`   ${index + 1}. [${alert.alert_level.toUpperCase()}] ${alert.metric_name}`);
        console.log(`      Message: ${alert.alert_message}`);
        console.log(`      Value: ${alert.metric_value} (Threshold: ${alert.threshold_value})`);
        console.log(`      Active for: ${Math.round(alert.minutes_active)} minutes`);
      });
    }
  } catch (error) {
    logTest('Health alerts endpoint', false, {
      message: error.message,
    });
  }
}

/**
 * Test 5: System health snapshot endpoint
 */
async function testHealthSnapshot() {
  console.log('\n📋 Test 5: System Health Snapshot Endpoint');
  
  try {
    const response = await axios.get(`${BASE_URL}/health/snapshot`, config);
    
    const passed = response.status === 200;
    
    const snapshot = response.data.data;
    
    if (snapshot && snapshot.overall_health_score !== undefined) {
      logTest('Health snapshot endpoint', passed, {
        message: `Overall health score: ${snapshot.overall_health_score}/100, Status: ${snapshot.overall_status}`,
      });
      
      console.log('\n   📸 System Health Snapshot:');
      console.log(`   Overall Health Score: ${snapshot.overall_health_score}/100`);
      console.log(`   Overall Status: ${snapshot.overall_status.toUpperCase()}`);
      console.log(`   Database: ${snapshot.database_status ? 'OK' : 'FAILED'} (${snapshot.database_response_time_ms}ms)`);
      console.log(`   Redis: ${snapshot.redis_status ? 'OK' : 'FAILED'} (${snapshot.redis_response_time_ms}ms)`);
      console.log(`   Queue Backlog: ${snapshot.queue_backlog_total}`);
      console.log(`   Webhook Latency: ${snapshot.webhook_avg_latency_ms}ms`);
      console.log(`   Failed Orders (1h): ${snapshot.failed_orders_last_hour}`);
      console.log(`   OCR Failures (1h): ${snapshot.ocr_failures_last_hour}`);
      console.log(`   Snapshot Time: ${snapshot.snapshot_timestamp}`);
    } else {
      logTest('Health snapshot endpoint', passed, {
        message: 'No snapshot available yet',
      });
    }
  } catch (error) {
    logTest('Health snapshot endpoint', false, {
      message: error.message,
    });
  }
}

/**
 * Test 6: Metrics caching
 */
async function testMetricsCaching() {
  console.log('\n📋 Test 6: Metrics Caching Performance');
  
  try {
    // First call (uncached)
    const start1 = Date.now();
    await axios.get(`${BASE_URL}/health/metrics`, config);
    const time1 = Date.now() - start1;
    
    // Second call (should be cached)
    const start2 = Date.now();
    await axios.get(`${BASE_URL}/health/metrics`, config);
    const time2 = Date.now() - start2;
    
    // Third call (should still be cached)
    const start3 = Date.now();
    await axios.get(`${BASE_URL}/health/metrics`, config);
    const time3 = Date.now() - start3;
    
    const avgCachedTime = (time2 + time3) / 2;
    const speedup = time1 / avgCachedTime;
    
    const passed = time2 < time1 && time3 < time1;
    
    logTest('Metrics caching', passed, {
      message: `First call: ${time1}ms, Cached calls: ${time2}ms, ${time3}ms (${speedup.toFixed(1)}x faster)`,
    });
  } catch (error) {
    logTest('Metrics caching', false, {
      message: error.message,
    });
  }
}

/**
 * Test 7: Performance under load
 */
async function testPerformanceUnderLoad() {
  console.log('\n📋 Test 7: Performance Under Load (10 concurrent requests)');
  
  try {
    const requests = [];
    const startTime = Date.now();
    
    for (let i = 0; i < 10; i++) {
      requests.push(axios.get(`${BASE_URL}/health/metrics`, config));
    }
    
    const responses = await Promise.all(requests);
    const totalTime = Date.now() - startTime;
    const avgTime = totalTime / 10;
    
    const allSuccessful = responses.every(r => r.status === 200);
    const passed = allSuccessful && avgTime < 1000; // Average should be under 1 second
    
    logTest('Performance under load', passed, {
      message: `10 requests completed in ${totalTime}ms (avg: ${avgTime}ms per request)`,
    });
  } catch (error) {
    logTest('Performance under load', false, {
      message: error.message,
    });
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Enhanced Health Monitoring System Test Suite');
  console.log('='.repeat(60));
  console.log(`Testing: ${BASE_URL}`);
  console.log('='.repeat(60));
  
  try {
    await testBasicHealth();
    await testReadiness();
    await testProductionMetrics();
    await testHealthAlerts();
    await testHealthSnapshot();
    await testMetricsCaching();
    await testPerformanceUnderLoad();
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${results.passed + results.failed}`);
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
    
    if (results.failed === 0) {
      console.log('\n🎉 All tests passed! Health monitoring system is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the results above.');
    }
    
    process.exit(results.failed === 0 ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
