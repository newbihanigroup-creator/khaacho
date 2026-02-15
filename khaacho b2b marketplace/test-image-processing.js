/**
 * Test Order Image Processing Service
 * 
 * This script tests the complete image processing workflow:
 * 1. Fetch image URL from DB
 * 2. Google Vision OCR
 * 3. Store raw text
 * 4. LLM extraction
 * 5. Update status
 * 
 * Run with: node test-image-processing.js <uploadedOrderId>
 */

require('dotenv').config();
const orderImageProcessingService = require('./src/services/orderImageProcessing.service');
const prisma = require('./src/config/database');

async function testImageProcessing() {
  console.log('🧪 Testing Order Image Processing Service\n');

  try {
    // Get uploaded order ID from command line or use test ID
    const uploadedOrderId = process.argv[2];

    if (!uploadedOrderId) {
      console.error('❌ Error: Please provide uploadedOrderId as argument');
      console.log('Usage: node test-image-processing.js <uploadedOrderId>');
      console.log('\nOr create a test order first:');
      console.log('  node test-image-upload.js');
      process.exit(1);
    }

    console.log(`📋 Processing uploaded order: ${uploadedOrderId}\n`);

    // Check if order exists
    const existingOrder = await prisma.uploadedOrder.findUnique({
      where: { id: uploadedOrderId },
      include: {
        retailer: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!existingOrder) {
      console.error(`❌ Error: UploadedOrder not found: ${uploadedOrderId}`);
      process.exit(1);
    }

    console.log('✅ Found uploaded order:');
    console.log(`   - Image URL: ${existingOrder.imageUrl}`);
    console.log(`   - Retailer: ${existingOrder.retailer?.user?.name || 'Unknown'}`);
    console.log(`   - Status: ${existingOrder.status}`);
    console.log('');

    // Process the order
    console.log('🔄 Starting processing...\n');
    const startTime = Date.now();

    const result = await orderImageProcessingService.processUploadedOrder(uploadedOrderId);

    const duration = Date.now() - startTime;

    console.log('\n✅ Processing completed!\n');

    // Display results
    console.log('📊 Results:');
    console.log('─'.repeat(60));
    console.log(`Status: ${result.status}`);
    console.log(`Processing Time: ${duration}ms`);
    console.log('');

    console.log('📝 Raw Text Extracted:');
    console.log('─'.repeat(60));
    console.log(result.rawText?.substring(0, 500) || 'No text extracted');
    if (result.rawText?.length > 500) {
      console.log(`... (${result.rawText.length - 500} more characters)`);
    }
    console.log('');

    console.log('📦 Extracted Order Data:');
    console.log('─'.repeat(60));
    console.log(JSON.stringify(result.extractedData, null, 2));
    console.log('');

    if (result.extractedData.items && result.extractedData.items.length > 0) {
      console.log('🛒 Items Found:');
      console.log('─'.repeat(60));
      result.extractedData.items.forEach((item, index) => {
        console.log(`${index + 1}. ${item.productName}`);
        console.log(`   Quantity: ${item.quantity} ${item.unit}`);
        console.log(`   Price: Rs. ${item.price}`);
        console.log(`   Subtotal: Rs. ${item.price * item.quantity}`);
        console.log('');
      });

      console.log(`Total: Rs. ${result.extractedData.total || 'Not specified'}`);
      console.log(`Confidence: ${(result.extractedData.confidence * 100).toFixed(1)}%`);
      console.log(`Extraction Method: ${result.extractedData.extractionMethod || 'Unknown'}`);
      if (result.extractedData.model) {
        console.log(`Model: ${result.extractedData.model}`);
      }
    } else {
      console.log('❌ No items extracted from image');
      if (result.extractedData.error) {
        console.log(`Error: ${result.extractedData.error}`);
      }
    }

    console.log('');

    // Check updated database record
    const updatedOrder = await prisma.uploadedOrder.findUnique({
      where: { id: uploadedOrderId },
    });

    console.log('💾 Database Record Updated:');
    console.log('─'.repeat(60));
    console.log(`Status: ${updatedOrder.status}`);
    console.log(`Extracted Text Length: ${updatedOrder.extractedText?.length || 0} characters`);
    console.log(`Parsed Data: ${updatedOrder.parsedData ? 'Stored' : 'Not stored'}`);
    console.log(`Processed At: ${updatedOrder.processedAt || 'Not set'}`);
    console.log('');

    // Summary
    console.log('✅ Test completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Uploaded Order ID: ${uploadedOrderId}`);
    console.log(`   - Final Status: ${result.status}`);
    console.log(`   - Items Extracted: ${result.extractedData.items?.length || 0}`);
    console.log(`   - Processing Time: ${duration}ms`);
    console.log(`   - Confidence: ${(result.extractedData.confidence * 100).toFixed(1)}%`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    
    // Check configuration
    console.log('\n🔍 Configuration Check:');
    console.log('─'.repeat(60));
    console.log(`GOOGLE_CLOUD_PROJECT_ID: ${process.env.GOOGLE_CLOUD_PROJECT_ID ? 'Set' : 'Not set'}`);
    console.log(`GOOGLE_CLOUD_CREDENTIALS: ${process.env.GOOGLE_CLOUD_CREDENTIALS ? 'Set' : 'Not set'}`);
    console.log(`LLM_PROVIDER: ${process.env.LLM_PROVIDER || 'Not set (will use fallback)'}`);
    
    if (process.env.LLM_PROVIDER === 'openai') {
      console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'Set' : 'Not set'}`);
    } else if (process.env.LLM_PROVIDER === 'anthropic') {
      console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set'}`);
    } else if (process.env.LLM_PROVIDER === 'gemini') {
      console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'Set' : 'Not set'}`);
    }
    
    console.log('\n💡 Troubleshooting:');
    console.log('1. Ensure Google Vision API is configured');
    console.log('2. Check LLM provider API key');
    console.log('3. Verify uploaded order exists');
    console.log('4. Check image URL is accessible');
    console.log('\nSee ORDER_IMAGE_PROCESSING_GUIDE.md for setup instructions.');
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run test
testImageProcessing();
