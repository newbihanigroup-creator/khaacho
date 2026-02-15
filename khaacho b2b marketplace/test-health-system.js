/**
 * Health System Test
 * Tests the production-grade health and readiness endpoints
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

async function testHealthEndpoint() {
  console.log('\n=== Testing Health Endpoint ===');
  
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    
    console.log('✅ Health endpoint responded');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.status === 'ok') {
      console.log('✅ Health check passed');
      return true;
    } else {
      console.log('❌ Health check failed - unexpected status');
      return false;
    }
  } catch (error) {
    console.error('❌ Health endpoint failed:', error.message);
    return false;
  }
}

async function testReadinessEndpoint() {
  console.log('\n=== Testing Readiness Endpoint ===');
  
  try {
    const response = await axios.get(`${BASE_URL}/ready`);
    
    console.log('✅ Readiness endpoint responded');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    const { data } = response.data;
    
    // Check all components
    console.log('\nComponent Status:');
    console.log('- Database:', data.checks.database ? '✅' : '❌');
    console.log('- Redis:', data.checks.redis ? '✅' : '❌');
    console.log('- Environment:', data.checks.environment ? '✅' : '❌');
    console.log('- Overall:', data.status === 'ready' ? '✅ READY' : '❌ NOT READY');
    console.log('- Uptime:', data.uptime, 'seconds');
    console.log('- Response Time:', data.responseTime, 'ms');
    
    return data.status === 'ready';
  } catch (error) {
    if (error.response && error.response.status === 503) {
      console.log('⚠️  Service not ready (503)');
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
      return false;
    }
    
    console.error('❌ Readiness endpoint failed:', error.message);
    return false;
  }
}

async function testHealthCheckPerformance() {
  console.log('\n=== Testing Health Check Performance ===');
  
  const iterations = 10;
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    
    try {
      await axios.get(`${BASE_URL}/health`);
      const duration = Date.now() - start;
      times.push(duration);
    } catch (error) {
      console.error(`❌ Request ${i + 1} failed:`, error.message);
    }
  }
  
  if (times.length > 0) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    
    console.log(`✅ Completed ${times.length}/${iterations} requests`);
    console.log(`Average response time: ${avg.toFixed(2)}ms`);
    console.log(`Min: ${min}ms, Max: ${max}ms`);
    
    if (avg < 100) {
      console.log('✅ Performance is excellent (< 100ms)');
    } else if (avg < 500) {
      console.log('⚠️  Performance is acceptable (< 500ms)');
    } else {
      console.log('❌ Performance is poor (> 500ms)');
    }
  }
}

async function testCaching() {
  console.log('\n=== Testing Readiness Check Caching ===');
  
  console.log('Making first request (should hit database)...');
  const start1 = Date.now();
  await axios.get(`${BASE_URL}/ready`);
  const time1 = Date.now() - start1;
  
  console.log(`First request: ${time1}ms`);
  
  console.log('Making second request immediately (should use cache)...');
  const start2 = Date.now();
  await axios.get(`${BASE_URL}/ready`);
  const time2 = Date.now() - start2;
  
  console.log(`Second request: ${time2}ms`);
  
  if (time2 < time1) {
    console.log('✅ Caching is working (second request faster)');
  } else {
    console.log('⚠️  Caching may not be working as expected');
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('HEALTH SYSTEM TEST SUITE');
  console.log('='.repeat(60));
  console.log('Base URL:', BASE_URL);
  
  try {
    // Test basic health endpoint
    const healthPassed = await testHealthEndpoint();
    
    // Test readiness endpoint
    const readinessPassed = await testReadinessEndpoint();
    
    // Test performance
    await testHealthCheckPerformance();
    
    // Test caching
    await testCaching();
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('Health Endpoint:', healthPassed ? '✅ PASSED' : '❌ FAILED');
    console.log('Readiness Endpoint:', readinessPassed ? '✅ PASSED' : '❌ FAILED');
    
    if (healthPassed && readinessPassed) {
      console.log('\n✅ All tests passed! Health system is working correctly.');
      process.exit(0);
    } else {
      console.log('\n❌ Some tests failed. Please check the logs above.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
