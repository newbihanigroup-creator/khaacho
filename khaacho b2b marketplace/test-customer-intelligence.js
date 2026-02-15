/**
 * Customer Intelligence Test
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

async function testCustomerIntelligence() {
  console.log('🧪 Testing Customer Intelligence Layer\n');

  const testRetailerId = 'test-retailer-id';
  const testPhoneNumber = '+919876543210';

  try {
    // Test 1: Get customer memory
    console.log('1️⃣ Getting customer memory...');
    const memoryResult = await api.get(`/api/v1/customer-intelligence/memory/${testRetailerId}`);
    
    console.log('✅ Customer Memory:', JSON.stringify(memoryResult.data, null, 2));
    console.log('');

    // Test 2: Check quick reorder eligibility
    console.log('2️⃣ Checking quick reorder eligibility...');
    const eligibilityResult = await api.get(
      `/api/v1/customer-intelligence/quick-reorder/${testRetailerId}/check`
    );
    
    console.log('✅ Eligibility:', JSON.stringify(eligibilityResult.data, null, 2));
    console.log('');

    // Test 3: Generate quick reorder suggestion
    console.log('3️⃣ Generating quick reorder suggestion...');
    const suggestionResult = await api.post(
      `/api/v1/customer-intelligence/quick-reorder/${testRetailerId}/generate`,
      { suggestionType: 'LAST_ORDER' }
    );
    
    console.log('✅ Suggestion:', JSON.stringify(suggestionResult.data, null, 2));
    console.log('');

    const suggestionId = suggestionResult.data.data?.id;

    // Test 4: Send quick reorder suggestion
    if (suggestionId) {
      console.log('4️⃣ Sending quick reorder suggestion...');
      const sendResult = await api.post(
        `/api/v1/customer-intelligence/quick-reorder/${testRetailerId}/send`,
        { phoneNumber: testPhoneNumber }
      );
      
      console.log('✅ Send Result:', JSON.stringify(sendResult.data, null, 2));
      console.log('');

      // Test 5: Handle customer response
      console.log('5️⃣ Simulating customer response (YES)...');
      const responseResult = await api.post(
        `/api/v1/customer-intelligence/quick-reorder/suggestions/${suggestionId}/respond`,
        { response: 'YES' }
      );
      
      console.log('✅ Response Handled:', JSON.stringify(responseResult.data, null, 2));
      console.log('');

      // Test 6: Create order from suggestion
      console.log('6️⃣ Creating order from suggestion...');
      const orderResult = await api.post(
        `/api/v1/customer-intelligence/quick-reorder/suggestions/${suggestionId}/create-order`
      );
      
      console.log('✅ Order Created:', JSON.stringify(orderResult.data, null, 2));
      console.log('');
    }

    // Test 7: Get frequent buyers
    console.log('7️⃣ Getting frequent buyers...');
    const buyersResult = await api.get('/api/v1/customer-intelligence/frequent-buyers', {
      params: { limit: 10 }
    });
    
    console.log('✅ Frequent Buyers:', JSON.stringify(buyersResult.data, null, 2));
    console.log('');

    // Test 8: Get conversation context
    console.log('8️⃣ Getting conversation context...');
    const contextResult = await api.get(
      `/api/v1/customer-intelligence/conversation/${testRetailerId}`
    );
    
    console.log('✅ Conversation Context:', JSON.stringify(contextResult.data, null, 2));
    console.log('');

    // Test 9: Get statistics
    console.log('9️⃣ Getting intelligence statistics...');
    const statsResult = await api.get('/api/v1/customer-intelligence/statistics');
    
    console.log('✅ Statistics:', JSON.stringify(statsResult.data, null, 2));
    console.log('');

    // Test 10: Refresh analytics
    console.log('🔟 Refreshing analytics...');
    const refreshResult = await api.post('/api/v1/customer-intelligence/analytics/refresh');
    
    console.log('✅ Analytics Refreshed:', JSON.stringify(refreshResult.data, null, 2));
    console.log('');

    console.log('✅ All customer intelligence tests completed!\n');

    // Summary
    console.log('📊 Customer Intelligence Features:');
    console.log('');
    console.log('Memory & History:');
    console.log('- Remembers all previous orders');
    console.log('- Tracks buying patterns and frequency');
    console.log('- Identifies frequent buyers automatically');
    console.log('- Calculates average order value and frequency');
    console.log('');
    console.log('Quick Reorder:');
    console.log('- "Order same as last week?" suggestions');
    console.log('- Automatic eligibility detection');
    console.log('- WhatsApp message integration');
    console.log('- One-click reorder from last order');
    console.log('');
    console.log('Conversational Intelligence:');
    console.log('- Maintains conversation context');
    console.log('- Tracks customer responses');
    console.log('- Handles YES/NO/MODIFY responses');
    console.log('- Session management with timeout');
    console.log('');
    console.log('Buyer Classification:');
    console.log('- DAILY: Orders every 1-2 days');
    console.log('- WEEKLY: Orders every 3-10 days');
    console.log('- MONTHLY: Orders every 11-35 days');
    console.log('- OCCASIONAL: Orders less frequently');
    console.log('');
    console.log('Analytics:');
    console.log('- Suggestion acceptance rate');
    console.log('- Quick reorder conversion rate');
    console.log('- Customer engagement metrics');
    console.log('- Performance tracking');
    console.log('');

    console.log('📝 API Endpoints:');
    console.log('GET  /api/v1/customer-intelligence/memory/:retailerId');
    console.log('GET  /api/v1/customer-intelligence/quick-reorder/:retailerId/check');
    console.log('POST /api/v1/customer-intelligence/quick-reorder/:retailerId/generate');
    console.log('POST /api/v1/customer-intelligence/quick-reorder/:retailerId/send');
    console.log('POST /api/v1/customer-intelligence/quick-reorder/suggestions/:id/respond');
    console.log('POST /api/v1/customer-intelligence/quick-reorder/suggestions/:id/create-order');
    console.log('GET  /api/v1/customer-intelligence/frequent-buyers');
    console.log('GET  /api/v1/customer-intelligence/conversation/:retailerId');
    console.log('GET  /api/v1/customer-intelligence/statistics');
    console.log('POST /api/v1/customer-intelligence/analytics/refresh');
    console.log('');

    console.log('💬 Example WhatsApp Message:');
    console.log('---');
    console.log('Hi! 👋');
    console.log('');
    console.log("It's been 7 days since your last order.");
    console.log('');
    console.log('Would you like to order the same items again?');
    console.log('');
    console.log('📦 Your last order:');
    console.log('• 5 kg Rice');
    console.log('• 2 kg Dal');
    console.log('• 12 pieces Coke');
    console.log('');
    console.log('💰 Estimated total: ₹850.00');
    console.log('');
    console.log('Reply:');
    console.log('✅ YES - to place this order');
    console.log('✏️ MODIFY - to change items');
    console.log('❌ NO - not now');
    console.log('---');
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
testCustomerIntelligence();
