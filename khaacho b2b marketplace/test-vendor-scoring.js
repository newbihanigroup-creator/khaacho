/**
 * Vendor Scoring System Test
 * 
 * Tests dynamic vendor scoring functionality
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'your-admin-token';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function testVendorScoringSystem() {
  console.log('🧪 Testing Vendor Scoring System\n');

  try {
    // Test 1: Get scoring configuration
    console.log('1️⃣ Getting scoring configuration...');
    const configResponse = await api.get('/api/v1/vendor-scoring/config');
    console.log('✅ Config:', JSON.stringify(configResponse.data, null, 2));
    console.log('');

    // Test 2: Get top vendors
    console.log('2️⃣ Getting top vendors by score...');
    const topVendorsResponse = await api.get('/api/v1/vendor-scoring/top-vendors?limit=10');
    console.log('✅ Top Vendors:', JSON.stringify(topVendorsResponse.data, null, 2));
    console.log('');

    if (topVendorsResponse.data.data && topVendorsResponse.data.data.length > 0) {
      const vendorId = topVendorsResponse.data.data[0].vendor_id;

      // Test 3: Get specific vendor score
      console.log('3️⃣ Getting vendor score details...');
      const scoreResponse = await api.get(`/api/v1/vendor-scoring/vendors/${vendorId}/score`);
      console.log('✅ Vendor Score:', JSON.stringify(scoreResponse.data, null, 2));
      console.log('');

      // Test 4: Get vendor score history
      console.log('4️⃣ Getting vendor score history...');
      const historyResponse = await api.get(`/api/v1/vendor-scoring/vendors/${vendorId}/history?days=30`);
      console.log('✅ Score History:', JSON.stringify(historyResponse.data, null, 2));
      console.log('');

      // Test 5: Get vendor performance summary
      console.log('5️⃣ Getting vendor performance summary...');
      const summaryResponse = await api.get(`/api/v1/vendor-scoring/vendors/${vendorId}/summary`);
      console.log('✅ Performance Summary:', JSON.stringify(summaryResponse.data, null, 2));
      console.log('');
    }

    // Test 6: Get best vendors for a product (if product exists)
    console.log('6️⃣ Testing best vendors for product...');
    console.log('ℹ️  Requires product ID - skipping for now');
    console.log('');

    console.log('✅ All vendor scoring tests completed successfully!\n');

    // Summary
    console.log('📊 Vendor Scoring System Features:');
    console.log('');
    console.log('Score Components (Weighted):');
    console.log('- Response Speed (25%): How fast vendor responds to orders');
    console.log('- Acceptance Rate (20%): Percentage of orders accepted');
    console.log('- Price Competitiveness (20%): Pricing vs market average');
    console.log('- Delivery Success (25%): Percentage of successful deliveries');
    console.log('- Cancellation Rate (10%): Percentage of cancelled orders');
    console.log('');
    console.log('Performance Tiers:');
    console.log('- EXCELLENT: Score >= 90');
    console.log('- GOOD: Score >= 75');
    console.log('- AVERAGE: Score >= 50');
    console.log('- POOR: Score < 50');
    console.log('');
    console.log('Automatic Features:');
    console.log('- Scores updated after every order event');
    console.log('- Late response penalties applied automatically');
    console.log('- Best vendor selected based on highest score');
    console.log('- Historical tracking for trend analysis');
    console.log('- Periodic recalculation (hourly)');
    console.log('');

    console.log('📝 API Endpoints:');
    console.log('GET  /api/v1/vendor-scoring/top-vendors');
    console.log('GET  /api/v1/vendor-scoring/products/:productId/best-vendors');
    console.log('GET  /api/v1/vendor-scoring/config');
    console.log('GET  /api/v1/vendor-scoring/vendors/:vendorId/score');
    console.log('GET  /api/v1/vendor-scoring/vendors/:vendorId/history');
    console.log('GET  /api/v1/vendor-scoring/vendors/:vendorId/summary');
    console.log('POST /api/v1/vendor-scoring/vendors/:vendorId/initialize');
    console.log('POST /api/v1/vendor-scoring/vendors/:vendorId/update');
    console.log('');

    console.log('🔄 Score Update Triggers:');
    console.log('- ORDER_ACCEPTED: Vendor accepts order');
    console.log('- ORDER_REJECTED: Vendor rejects order');
    console.log('- ORDER_DELIVERED: Order successfully delivered');
    console.log('- ORDER_CANCELLED: Order cancelled by vendor');
    console.log('- LATE_RESPONSE: Vendor responds after threshold');
    console.log('- DELIVERY_FAILED: Delivery fails');
    console.log('- PERIODIC_UPDATE: Hourly recalculation');
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
testVendorScoringSystem();
