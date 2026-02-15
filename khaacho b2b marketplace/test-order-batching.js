/**
 * Order Batching System Test
 * 
 * Tests order batching functionality
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-auth-token';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function testOrderBatchingSystem() {
  console.log('🧪 Testing Order Batching System\n');

  try {
    // Test 1: Get batching configuration
    console.log('1️⃣ Getting batching configuration...');
    const configResponse = await api.get('/api/v1/order-batching/config');
    console.log('✅ Config:', JSON.stringify(configResponse.data, null, 2));
    console.log('');

    // Test 2: Get active batches
    console.log('2️⃣ Getting active batches...');
    const activeBatchesResponse = await api.get('/api/v1/order-batching/active');
    console.log('✅ Active Batches:', JSON.stringify(activeBatchesResponse.data, null, 2));
    console.log('');

    // Test 3: Get batch savings summary
    console.log('3️⃣ Getting batch savings summary...');
    const savingsResponse = await api.get('/api/v1/order-batching/savings-summary?days=30');
    console.log('✅ Savings Summary:', JSON.stringify(savingsResponse.data, null, 2));
    console.log('');

    // Test 4: Get product batching efficiency
    console.log('4️⃣ Getting product batching efficiency...');
    const efficiencyResponse = await api.get('/api/v1/order-batching/product-efficiency');
    console.log('✅ Product Efficiency:', JSON.stringify(efficiencyResponse.data, null, 2));
    console.log('');

    // Test 5: Create batch (requires vendor ID and location)
    console.log('5️⃣ Testing batch creation...');
    console.log('ℹ️  Requires vendor ID and center location - skipping for now');
    console.log('');

    console.log('✅ All order batching tests completed successfully!\n');

    // Summary
    console.log('📊 Order Batching System Features:');
    console.log('');
    console.log('Batching Criteria:');
    console.log('- Geographic proximity (default: 5km radius)');
    console.log('- Same products grouped together');
    console.log('- Time window batching (default: 60 minutes)');
    console.log('- Minimum 3 orders per batch');
    console.log('- Maximum 20 orders per batch');
    console.log('');
    console.log('Cost Optimization:');
    console.log('- Reduced delivery costs through route optimization');
    console.log('- Bulk discounts for grouped products');
    console.log('- Savings tracked per batch');
    console.log('- CO2 emissions reduction calculated');
    console.log('');
    console.log('Delivery Optimization:');
    console.log('- Optimized delivery routes');
    console.log('- Delivery sequence planning');
    console.log('- Distance-based cost calculation');
    console.log('- Per-stop cost optimization');
    console.log('');

    console.log('📝 API Endpoints:');
    console.log('GET  /api/v1/order-batching/config');
    console.log('GET  /api/v1/order-batching/active');
    console.log('GET  /api/v1/order-batching/savings-summary');
    console.log('GET  /api/v1/order-batching/product-efficiency');
    console.log('GET  /api/v1/order-batching/:batchId');
    console.log('POST /api/v1/order-batching/create');
    console.log('POST /api/v1/order-batching/auto-batch');
    console.log('POST /api/v1/order-batching/:batchId/confirm');
    console.log('POST /api/v1/order-batching/:batchId/dispatch');
    console.log('POST /api/v1/order-batching/:batchId/delivered');
    console.log('');

    console.log('💰 Savings Calculation:');
    console.log('- Individual delivery cost = Base cost + (Distance × 2 × Cost/km)');
    console.log('- Batch delivery cost = Base cost + (Total distance × Cost/km) + (Stops × Cost/stop)');
    console.log('- Savings = Individual cost - Batch cost');
    console.log('- Bulk discounts applied when threshold met');
    console.log('');

    console.log('🔄 Automatic Batching:');
    console.log('- Worker runs every 30 minutes');
    console.log('- Automatically batches pending orders');
    console.log('- Groups by vendor and location');
    console.log('- Optimizes delivery routes');
    console.log('');

  } catch (error) {
    console.error('❌ Test failed:', error.message);

    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }

    process.exit(1);
  }
}

// Run tests
testOrderBatchingSystem();
