/**
 * Test Product Normalization Service
 * 
 * Tests the normalizeExtractedItems function with various product names
 * Run with: node test-product-normalization.js
 */

require('dotenv').config();
const productNormalizationService = require('./src/services/productNormalization.service');
const prisma = require('./src/config/database');

// Test data: Create a mock uploaded order with extracted items
const mockExtractedItems = [
  { name: 'Rice', quantity: 10, unit: 'kg' },
  { name: 'Basmati Rice', quantity: 5, unit: 'kg' },
  { name: 'Sunflower Oil', quantity: 2, unit: 'L' },
  { name: 'Sugar', quantity: 5, unit: 'kg' },
  { name: 'Wheat Flour', quantity: 10, unit: 'kg' },
  { name: 'Tea Powder', quantity: 500, unit: 'g' },
  { name: 'Milk', quantity: 2, unit: 'L' },
  { name: 'Unknown Product XYZ', quantity: 1, unit: null }, // Should not match
];

async function createMockUploadedOrder() {
  console.log('📝 Creating mock uploaded order...\n');

  try {
    // Get first retailer for testing
    const retailer = await prisma.retailer.findFirst({
      where: {
        isApproved: true,
        deletedAt: null,
      },
    });

    if (!retailer) {
      console.error('❌ No approved retailer found. Please create a retailer first.');
      process.exit(1);
    }

    // Create uploaded order with mock data
    const uploadedOrder = await prisma.uploadedOrder.create({
      data: {
        retailerId: retailer.id,
        imageUrl: 'https://example.com/test-image.jpg',
        imageKey: 'test/mock-image.jpg',
        status: 'COMPLETED',
        extractedText: 'Mock extracted text from OCR',
        parsedData: {
          items: mockExtractedItems,
          total: 0,
          confidence: 0.8,
          extractionMethod: 'test',
        },
      },
    });

    console.log('✅ Mock uploaded order created:', uploadedOrder.id);
    console.log('📦 Items to normalize:', mockExtractedItems.length);
    console.log('');

    return uploadedOrder.id;

  } catch (error) {
    console.error('❌ Failed to create mock uploaded order:', error.message);
    throw error;
  }
}

async function testNormalization(uploadedOrderId) {
  console.log('🔄 Testing product normalization...\n');
  console.log('═'.repeat(70));

  try {
    const startTime = Date.now();
    const result = await productNormalizationService.normalizeExtractedItems(uploadedOrderId);
    const duration = Date.now() - startTime;

    console.log(`✅ Normalization completed in ${duration}ms\n`);
    console.log('📊 Results Summary:');
    console.log('─'.repeat(70));
    console.log(`Total items:    ${result.totalItems}`);
    console.log(`Matched items:  ${result.matchedItems}`);
    console.log(`Needs review:   ${result.needsReview}`);
    console.log(`Final status:   ${result.status}`);
    console.log('');

    console.log('📋 Detailed Results:');
    console.log('═'.repeat(70));

    result.normalizedItems.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.originalItem.name || item.originalItem.productName}`);
      console.log('   Original:', JSON.stringify(item.originalItem));
      
      if (item.matched) {
        console.log(`   ✅ MATCHED`);
        console.log(`   Product ID:   ${item.productId}`);
        console.log(`   Product Name: ${item.productName}`);
        console.log(`   Match Type:   ${item.matchType}`);
        console.log(`   Confidence:   ${Math.round(item.confidence * 100)}%`);
        console.log(`   Needs Review: ${item.needsReview ? 'YES' : 'NO'}`);
        
        if (item.needsReview) {
          console.log(`   Reason:       ${item.reason}`);
        }
        
        if (item.alternatives && item.alternatives.length > 0) {
          console.log(`   Alternatives:`);
          item.alternatives.forEach(alt => {
            console.log(`     - ${alt.productName} (${Math.round(alt.confidence * 100)}%)`);
          });
        }
      } else {
        console.log(`   ❌ NOT MATCHED`);
        console.log(`   Reason: ${item.reason}`);
        console.log(`   Needs Review: YES`);
      }
    });

    console.log('\n' + '═'.repeat(70));
    console.log('');

    return result;

  } catch (error) {
    console.error('❌ Normalization failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

async function testDirectMatch() {
  console.log('🔬 Testing direct product matching...\n');

  const testItems = [
    { name: 'Rice', quantity: 10, unit: 'kg' },
    { name: 'Basmati Rice', quantity: 5, unit: 'kg' },
    { name: 'Ric', quantity: 10, unit: 'kg' }, // Typo
    { name: 'Sunflower Oil', quantity: 2, unit: 'L' },
    { name: 'Sunflowr Oil', quantity: 2, unit: 'L' }, // Typo
  ];

  for (const item of testItems) {
    console.log(`Testing: "${item.name}"`);
    
    try {
      const result = await productNormalizationService.matchProduct(item);
      
      if (result.matched) {
        console.log(`  ✅ Matched: ${result.productName}`);
        console.log(`  Confidence: ${Math.round(result.confidence * 100)}%`);
        console.log(`  Match Type: ${result.matchType}`);
        console.log(`  Needs Review: ${result.needsReview ? 'YES' : 'NO'}`);
      } else {
        console.log(`  ❌ Not matched: ${result.reason}`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }
}

async function checkProducts() {
  console.log('📦 Checking available products in database...\n');

  try {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        productCode: true,
        name: true,
        category: true,
        unit: true,
      },
      take: 10,
    });

    if (products.length === 0) {
      console.log('⚠️  No products found in database.');
      console.log('Please seed the database with products first:');
      console.log('  npm run db:seed\n');
      return false;
    }

    console.log(`✅ Found ${products.length} products (showing first 10):\n`);
    products.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name}`);
      console.log(`   Code: ${product.productCode}`);
      console.log(`   Category: ${product.category || 'N/A'}`);
      console.log(`   Unit: ${product.unit}`);
      console.log('');
    });

    return true;

  } catch (error) {
    console.error('❌ Failed to check products:', error.message);
    return false;
  }
}

async function cleanup(uploadedOrderId) {
  console.log('🧹 Cleaning up test data...\n');

  try {
    if (uploadedOrderId) {
      await prisma.uploadedOrder.delete({
        where: { id: uploadedOrderId },
      });
      console.log('✅ Test uploaded order deleted\n');
    }
  } catch (error) {
    console.error('⚠️  Cleanup failed:', error.message);
  }
}

async function main() {
  console.log('🧪 Testing Product Normalization Service\n');
  console.log('═'.repeat(70));
  console.log('');

  let uploadedOrderId = null;

  try {
    // Check database connection
    await prisma.$connect();
    console.log('✅ Database connected\n');

    // Check if products exist
    const hasProducts = await checkProducts();
    if (!hasProducts) {
      console.log('❌ Cannot proceed without products in database');
      process.exit(1);
    }

    // Test 1: Direct matching
    console.log('═'.repeat(70));
    console.log('TEST 1: Direct Product Matching');
    console.log('═'.repeat(70));
    console.log('');
    await testDirectMatch();

    // Test 2: Full normalization workflow
    console.log('═'.repeat(70));
    console.log('TEST 2: Full Normalization Workflow');
    console.log('═'.repeat(70));
    console.log('');
    
    uploadedOrderId = await createMockUploadedOrder();
    const result = await testNormalization(uploadedOrderId);

    // Summary
    console.log('📊 Test Summary');
    console.log('═'.repeat(70));
    console.log(`Total items tested:     ${result.totalItems}`);
    console.log(`Successfully matched:   ${result.matchedItems}`);
    console.log(`Failed to match:        ${result.totalItems - result.matchedItems}`);
    console.log(`Needs manual review:    ${result.needsReview}`);
    console.log(`Match rate:             ${Math.round((result.matchedItems / result.totalItems) * 100)}%`);
    console.log('');

    if (result.needsReview > 0) {
      console.log('⚠️  Some items need manual review');
      console.log('These items have low confidence matches or no matches found.');
    } else {
      console.log('✅ All items matched successfully!');
    }

    console.log('');
    console.log('💡 Configuration:');
    console.log(`Confidence threshold: ${productNormalizationService.CONFIDENCE_THRESHOLD * 100}%`);
    console.log(`Minimum similarity:   ${productNormalizationService.MIN_SIMILARITY * 100}%`);
    console.log('');
    console.log('To adjust threshold, set environment variable:');
    console.log('PRODUCT_MATCH_THRESHOLD=0.8  # 80% confidence required');
    console.log('');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    // Cleanup
    await cleanup(uploadedOrderId);
    
    // Disconnect
    await prisma.$disconnect();
    console.log('✅ Database disconnected');
  }

  console.log('\n✅ All tests completed!\n');
}

main();
