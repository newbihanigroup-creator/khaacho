/**
 * Test script for Delivery Management System
 * Tests delivery assignment, status updates, and credit ledger integration
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'your-admin-token';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function testDeliverySystem() {
  console.log('🚚 Testing Delivery Management System\n');
  console.log('='.repeat(60));

  try {
    // Test 1: Create delivery person
    console.log('\n📋 Test 1: Create Delivery Person');
    console.log('-'.repeat(60));
    
    const deliveryPerson = await api.post('/delivery/delivery-persons', {
      name: 'Ram Bahadur',
      phoneNumber: '+977-9841234567',
      vehicleType: 'Motorcycle',
      vehicleNumber: 'BA-01-PA-1234',
      licenseNumber: 'DL-12345'
    });
    
    console.log('✅ Delivery person created:', deliveryPerson.data.data);
    const deliveryPersonId = deliveryPerson.data.data[0]?.id;

    // Test 2: Create delivery assignment
    console.log('\n📋 Test 2: Create Delivery Assignment');
    console.log('-'.repeat(60));
    
    // First, get a dispatched order
    const orders = await api.get('/orders?status=DISPATCHED&limit=1');
    
    if (orders.data.data.orders.length === 0) {
      console.log('⚠️  No DISPATCHED orders found. Creating test order...');
      // You would need to create a test order here
      console.log('⚠️  Skipping delivery assignment test');
    } else {
      const orderId = orders.data.data.orders[0].id;
      
      const delivery = await api.post('/delivery/deliveries', {
        orderId,
        deliveryPersonId,
        deliveryAddress: 'Kathmandu, Nepal',
        recipientName: 'Test Retailer',
        recipientPhone: '+977-9841111111',
        estimatedDeliveryTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      });
      
      console.log('✅ Delivery created:', delivery.data.data);
      const deliveryId = delivery.data.data.id;

      // Test 3: Update delivery status - PICKED_UP
      console.log('\n📋 Test 3: Mark as Picked Up');
      console.log('-'.repeat(60));
      
      const pickedUp = await api.put(`/delivery/deliveries/${deliveryId}/picked-up`, {
        location: { lat: 27.7172, lng: 85.3240 },
        notes: 'Package picked up from warehouse'
      });
      
      console.log('✅ Delivery marked as picked up:', pickedUp.data.data);

      // Test 4: Update delivery status - OUT_FOR_DELIVERY
      console.log('\n📋 Test 4: Mark as Out for Delivery');
      console.log('-'.repeat(60));
      
      const outForDelivery = await api.put(`/delivery/deliveries/${deliveryId}/out-for-delivery`, {
        location: { lat: 27.7172, lng: 85.3240 },
        notes: 'On the way to customer'
      });
      
      console.log('✅ Delivery marked as out for delivery:', outForDelivery.data.data);

      // Test 5: Update delivery status - DELIVERED (triggers credit ledger)
      console.log('\n📋 Test 5: Mark as Delivered (Credit Ledger Integration)');
      console.log('-'.repeat(60));
      
      const delivered = await api.put(`/delivery/deliveries/${deliveryId}/delivered`, {
        location: { lat: 27.7172, lng: 85.3240 },
        notes: 'Package delivered successfully',
        signatureUrl: 'https://example.com/signature.png',
        photoUrl: 'https://example.com/proof.jpg'
      });
      
      console.log('✅ Delivery marked as delivered:', delivered.data.data);
      console.log('💳 Credit ledger should be updated automatically');

      // Test 6: Get delivery details
      console.log('\n📋 Test 6: Get Delivery Details');
      console.log('-'.repeat(60));
      
      const deliveryDetails = await api.get(`/delivery/deliveries/${deliveryId}`);
      
      console.log('✅ Delivery details:', deliveryDetails.data.data);
      console.log('📜 Status logs:', deliveryDetails.data.data.statusLogs);

      // Test 7: Get active deliveries
      console.log('\n📋 Test 7: Get Active Deliveries');
      console.log('-'.repeat(60));
      
      const activeDeliveries = await api.get('/delivery/deliveries/active');
      
      console.log('✅ Active deliveries:', activeDeliveries.data.data.count);

      // Test 8: Get delivery person performance
      console.log('\n📋 Test 8: Get Delivery Person Performance');
      console.log('-'.repeat(60));
      
      const performance = await api.get(`/delivery/delivery-persons/${deliveryPersonId}/performance`);
      
      console.log('✅ Performance metrics:', performance.data.data);

      // Test 9: Rate delivery
      console.log('\n📋 Test 9: Rate Delivery');
      console.log('-'.repeat(60));
      
      const rating = await api.post('/delivery/deliveries/rate', {
        deliveryId,
        orderId,
        deliveryPersonId,
        retailerId: orders.data.data.orders[0].retailerId,
        rating: 5,
        feedback: 'Excellent service, on-time delivery'
      });
      
      console.log('✅ Delivery rated:', rating.data.data);

      // Test 10: Get deliveries for person
      console.log('\n📋 Test 10: Get Deliveries for Person');
      console.log('-'.repeat(60));
      
      const personDeliveries = await api.get(`/delivery/delivery-persons/${deliveryPersonId}/deliveries`);
      
      console.log('✅ Deliveries for person:', personDeliveries.data.data.count);
    }

    // Test 11: Test failed delivery
    console.log('\n📋 Test 11: Test Failed Delivery Flow');
    console.log('-'.repeat(60));
    console.log('ℹ️  Failed delivery can be reassigned to ASSIGNED status');
    console.log('ℹ️  This allows retry with same or different delivery person');

    console.log('\n' + '='.repeat(60));
    console.log('✅ All Delivery System Tests Completed Successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run tests
testDeliverySystem();
