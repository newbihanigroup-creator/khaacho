/**
 * Test Image Upload API
 * 
 * This script tests the image upload endpoint
 * Run with: node test-image-upload.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const API_VERSION = process.env.API_VERSION || 'v1';

// Test credentials (update with actual credentials)
const TEST_CREDENTIALS = {
  phoneNumber: process.env.TEST_PHONE || '+977-9800000000',
  password: process.env.TEST_PASSWORD || 'password123',
};

async function testImageUpload() {
  console.log('🧪 Testing Image Upload API\n');

  try {
    // Step 1: Login to get token
    console.log('1️⃣ Logging in...');
    const loginResponse = await axios.post(`${API_URL}/api/${API_VERSION}/auth/login`, TEST_CREDENTIALS);
    const token = loginResponse.data.data.token;
    console.log('✅ Login successful\n');

    // Step 2: Create a test image (or use existing)
    console.log('2️⃣ Preparing test image...');
    
    // Option A: Use existing image
    const imagePath = path.join(__dirname, 'test-order-image.jpg');
    
    if (!fs.existsSync(imagePath)) {
      console.log('⚠️  Test image not found. Creating placeholder...');
      // Create a simple test image (1x1 pixel PNG)
      const testImageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      fs.writeFileSync(imagePath, testImageBuffer);
      console.log('✅ Placeholder image created\n');
    } else {
      console.log('✅ Test image found\n');
    }

    // Step 3: Upload image
    console.log('3️⃣ Uploading image...');
    
    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath));
    
    const uploadResponse = await axios.post(
      `${API_URL}/api/${API_VERSION}/orders/upload-image`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    console.log('✅ Image uploaded successfully!');
    console.log('Response:', JSON.stringify(uploadResponse.data, null, 2));
    console.log('');

    const uploadedOrderId = uploadResponse.data.data.uploadedOrderId;

    // Step 4: Check upload status
    console.log('4️⃣ Checking upload status...');
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const statusResponse = await axios.get(
      `${API_URL}/api/${API_VERSION}/orders/upload-image/${uploadedOrderId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    console.log('✅ Status retrieved successfully!');
    console.log('Status:', statusResponse.data.data.status);
    console.log('Full Response:', JSON.stringify(statusResponse.data, null, 2));
    console.log('');

    // Step 5: List uploaded orders
    console.log('5️⃣ Listing uploaded orders...');
    
    const listResponse = await axios.get(
      `${API_URL}/api/${API_VERSION}/orders/upload-image?page=1&limit=5`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    console.log('✅ List retrieved successfully!');
    console.log(`Found ${listResponse.data.data.uploadedOrders.length} uploaded orders`);
    console.log('Pagination:', listResponse.data.data.pagination);
    console.log('');

    // Summary
    console.log('✅ All tests passed!');
    console.log('\n📊 Test Summary:');
    console.log(`   - Uploaded Order ID: ${uploadedOrderId}`);
    console.log(`   - Image URL: ${uploadResponse.data.data.imageUrl}`);
    console.log(`   - Status: ${statusResponse.data.data.status}`);
    console.log(`   - Total Uploads: ${listResponse.data.data.pagination.total}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    process.exit(1);
  }
}

// Run tests
testImageUpload();
