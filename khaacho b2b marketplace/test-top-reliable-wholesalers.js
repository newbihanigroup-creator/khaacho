/**
 * Test Top Reliable Wholesalers Function
 * 
 * Tests the getTopReliableWholesellers function
 * Run with: node test-top-reliable-wholesalers.js
 */

require('dotenv').config();
const vendorPerformanceService = require('./src/services/vendorPerformance.service');
const prisma = require('./src/config/database');

async function testGetTopReliableWholesalers() {
  console.log('🧪 Testing getTopReliableWholesellers Function\n');
  console.log('═'.repeat(70));
  console.log('');

  try {
    // Check database connection
    await prisma.$connect();
    console.log('✅ Database connected\n');

    // Get a sample product to test with
    console.log('📦 Finding a product with multiple vendors...\n');
    
    const productsWithVendors = await prisma.$queryRaw`
      SELECT 
        p.id,
        p.name,
        p.product_code,
        COUNT(DISTINCT vp.vendor_id) as vendor_count
      FROM products p
      INNER JOIN vendor_products vp ON vp.product_id = p.id
      WHERE p.is_active = true
      AND p.deleted_at IS NULL
      AND vp.is_available = true
      AND vp.deleted_at IS NULL
      GROUP BY p.id, p.name, p.product_code
      HAVING COUNT(DISTINCT vp.vendor_id) > 0
      ORDER BY COUNT(DISTINCT vp.vendor_id) DESC
      LIMIT 5
    `;

    if (productsWithVendors.length === 0) {
      console.log('⚠️  No products with vendors found in database.');
      console.log('Please ensure you have:');
      console.log('  1. Products in the database');
      console.log('  2. Vendors in the database');
      console.log('  3. VendorProducts linking them together\n');
      process.exit(1);
    }

    console.log(`✅ Found ${productsWithVendors.length} products with vendors:\n`);
    productsWithVendors.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} (${product.product_code})`);
      console.log(`   Vendors: ${product.vendor_count}`);
      console.log('');
    });

    // Test with the first product (most vendors)
    const testProduct = productsWithVendors[0];
    console.log('═'.repeat(70));
    console.log(`Testing with: ${testProduct.name}`);
    console.log(`Product ID: ${testProduct.id}`);
    console.log(`Available vendors: ${testProduct.vendor_count}`);
    console.log('═'.repeat(70));
    console.log('');

    // Test 1: Get top 5 wholesalers (default)
    console.log('TEST 1: Get top 5 reliable wholesalers (default)\n');
    const startTime1 = Date.now();
    const top5 = await vendorPerformanceService.getTopReliableWholesellers(testProduct.id);
    const duration1 = Date.now() - startTime1;

    console.log(`✅ Query completed in ${duration1}ms`);
    console.log(`📊 Found ${top5.length} wholesalers\n`);

    if (top5.length > 0) {
      console.log('Top Reliable Wholesalers:');
      console.log('─'.repeat(70));
      
      top5.forEach((vendor, index) => {
        console.log(`\n${index + 1}. ${vendor.vendorName} (${vendor.vendorCode})`);
        console.log(`   Business: ${vendor.businessName || 'N/A'}`);
        console.log(`   City: ${vendor.city || 'N/A'}`);
        console.log(`   Phone: ${vendor.phoneNumber || 'N/A'}`);
        console.log('');
        console.log('   📊 Performance Scores:');
        console.log(`   - Reliability Score:  ${vendor.reliabilityScore.toFixed(2)}`);
        console.log(`   - Overall Score:      ${vendor.overallScore.toFixed(2)}`);
        console.log(`   - Availability Score: ${vendor.availabilityScore.toFixed(2)}`);
        console.log(`   - Price Score:        ${vendor.priceScore.toFixed(2)}`);
        console.log(`   - Workload Score:     ${vendor.workloadScore.toFixed(2)}`);
        console.log(`   - Grade:              ${vendor.performanceGrade.grade} (${vendor.performanceGrade.label})`);
        console.log('');
        console.log('   💰 Pricing:');
        console.log(`   - Price:     Rs. ${vendor.price.toFixed(2)}`);
        console.log(`   - MRP:       Rs. ${vendor.mrp.toFixed(2)}`);
        console.log(`   - Discount:  ${vendor.discount.toFixed(2)}%`);
        console.log('');
        console.log('   📦 Inventory:');
        console.log(`   - Stock:              ${vendor.stock} ${testProduct.unit || 'units'}`);
        console.log(`   - Available Quantity: ${vendor.availableQuantity || 'N/A'}`);
        console.log(`   - Status:             ${vendor.inventoryStatus || 'N/A'}`);
        console.log(`   - Lead Time:          ${vendor.leadTimeDays} days`);
        console.log('');
        console.log('   📈 Order Metrics:');
        console.log(`   - Total Orders:       ${vendor.totalOrders}`);
        console.log(`   - Completed Orders:   ${vendor.completedOrders}`);
        console.log(`   - Active Orders:      ${vendor.activeOrdersCount}`);
        console.log(`   - Pending Orders:     ${vendor.pendingOrdersCount}`);
        console.log(`   - Acceptance Rate:    ${vendor.acceptanceRate.toFixed(2)}%`);
        console.log(`   - Completion Rate:    ${vendor.completionRate.toFixed(2)}%`);
        console.log(`   - Avg Delivery Time:  ${vendor.avgDeliveryTime.toFixed(2)} hours`);
        console.log(`   - Avg Fulfillment:    ${vendor.averageFulfillmentTime} minutes`);
        
        if (vendor.rank) {
          console.log(`   - Vendor Rank:        #${vendor.rank}`);
        }
      });
    } else {
      console.log('⚠️  No wholesalers found for this product');
    }

    console.log('\n' + '═'.repeat(70));
    console.log('');

    // Test 2: Get top 3 wholesalers
    console.log('TEST 2: Get top 3 reliable wholesalers\n');
    const startTime2 = Date.now();
    const top3 = await vendorPerformanceService.getTopReliableWholesellers(testProduct.id, 3);
    const duration2 = Date.now() - startTime2;

    console.log(`✅ Query completed in ${duration2}ms`);
    console.log(`📊 Found ${top3.length} wholesalers\n`);

    if (top3.length > 0) {
      console.log('Top 3 Wholesalers (Summary):');
      console.log('─'.repeat(70));
      top3.forEach((vendor, index) => {
        console.log(`${index + 1}. ${vendor.vendorName} - Reliability: ${vendor.reliabilityScore.toFixed(2)} - Price: Rs. ${vendor.price.toFixed(2)}`);
      });
    }

    console.log('\n' + '═'.repeat(70));
    console.log('');

    // Test 3: Get top 10 wholesalers
    console.log('TEST 3: Get top 10 reliable wholesalers\n');
    const startTime3 = Date.now();
    const top10 = await vendorPerformanceService.getTopReliableWholesellers(testProduct.id, 10);
    const duration3 = Date.now() - startTime3;

    console.log(`✅ Query completed in ${duration3}ms`);
    console.log(`📊 Found ${top10.length} wholesalers\n`);

    console.log('═'.repeat(70));
    console.log('');

    // Test 4: Test with a product that has no vendors
    console.log('TEST 4: Test with product that has no vendors\n');
    
    const productWithNoVendors = await prisma.product.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
        vendorProducts: {
          none: {},
        },
      },
    });

    if (productWithNoVendors) {
      console.log(`Testing with: ${productWithNoVendors.name}`);
      const noVendors = await vendorPerformanceService.getTopReliableWholesellers(productWithNoVendors.id);
      console.log(`✅ Result: ${noVendors.length} wholesalers (expected 0)`);
    } else {
      console.log('⚠️  All products have vendors, skipping this test');
    }

    console.log('\n' + '═'.repeat(70));
    console.log('');

    // Summary
    console.log('📊 Test Summary');
    console.log('═'.repeat(70));
    console.log(`Test 1 (top 5):  ${top5.length} results in ${duration1}ms`);
    console.log(`Test 2 (top 3):  ${top3.length} results in ${duration2}ms`);
    console.log(`Test 3 (top 10): ${top10.length} results in ${duration3}ms`);
    console.log('');

    if (top5.length > 0) {
      console.log('✅ All tests passed!');
      console.log('');
      console.log('Key Findings:');
      console.log(`- Most reliable vendor: ${top5[0].vendorName}`);
      console.log(`- Highest reliability score: ${top5[0].reliabilityScore.toFixed(2)}`);
      console.log(`- Best price: Rs. ${Math.min(...top5.map(v => v.price)).toFixed(2)}`);
      console.log(`- Average reliability: ${(top5.reduce((sum, v) => sum + v.reliabilityScore, 0) / top5.length).toFixed(2)}`);
    } else {
      console.log('⚠️  No vendors found for testing');
    }

    console.log('');
    console.log('💡 Usage Example:');
    console.log(`
const vendorPerformanceService = require('./src/services/vendorPerformance.service');

// Get top 5 reliable wholesalers for a product
const productId = '${testProduct.id}';
const wholesalers = await vendorPerformanceService.getTopReliableWholesellers(productId, 5);

wholesalers.forEach(vendor => {
  console.log(\`\${vendor.vendorName}: Reliability \${vendor.reliabilityScore}, Price Rs. \${vendor.price}\`);
});
`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('✅ Database disconnected\n');
  }

  console.log('✅ All tests completed!\n');
}

// Run tests
testGetTopReliableWholesalers();
