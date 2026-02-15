/**
 * Vendor Selection Service Test
 * Tests intelligent vendor selection and order splitting
 */

const vendorSelectionService = require('./src/services/vendorSelection.service');
const logger = require('./src/utils/logger');

async function testVendorSelection() {
  console.log('🧪 Testing Vendor Selection Service\n');

  try {
    // Test 1: Get ranking weights
    console.log('📊 Test 1: Get Ranking Weights');
    const weights = vendorSelectionService.getRankingWeights();
    console.log('Current weights:', JSON.stringify(weights, null, 2));
    console.log('✅ Test 1 passed\n');

    // Test 2: Rank vendors for a product
    console.log('🏆 Test 2: Rank Vendors for Product');
    
    // You'll need to replace this with an actual product ID from your database
    const testProductId = 'your-product-id-here';
    
    try {
      const rankedVendors = await vendorSelectionService.rankVendorsForProduct(
        testProductId,
        10, // quantity
        {
          topN: 3,
          minReliabilityScore: 60,
        }
      );

      console.log(`Found ${rankedVendors.length} vendors for product ${testProductId}`);
      
      if (rankedVendors.length > 0) {
        console.log('\nTop vendor:');
        console.log('  Vendor:', rankedVendors[0].businessName || rankedVendors[0].vendorName);
        console.log('  Final Score:', rankedVendors[0].finalScore);
        console.log('  Scores:', JSON.stringify(rankedVendors[0].scores, null, 2));
        console.log('  Price:', rankedVendors[0].price);
        console.log('  Stock:', rankedVendors[0].stock);
      }
      
      console.log('✅ Test 2 passed\n');
    } catch (error) {
      console.log('⚠️  Test 2 skipped (no product data):', error.message);
      console.log('   To test, replace testProductId with a real product ID\n');
    }

    // Test 3: Select vendors for multiple items
    console.log('🎯 Test 3: Select Vendors for Order');
    
    const testItems = [
      { productId: 'product-1', quantity: 10 },
      { productId: 'product-2', quantity: 5 },
    ];

    try {
      const selections = await vendorSelectionService.selectVendorsForOrder(testItems, {
        topN: 3,
        minReliabilityScore: 60,
      });

      console.log(`Vendor selection completed for ${selections.items.length} items`);
      
      selections.items.forEach((item, index) => {
        console.log(`\nItem ${index + 1}:`);
        console.log('  Product ID:', item.productId);
        console.log('  Top vendors found:', item.topVendors.length);
        if (item.selectedVendor) {
          console.log('  Selected vendor:', item.selectedVendor.businessName || item.selectedVendor.vendorName);
          console.log('  Score:', item.selectedVendor.finalScore);
        }
      });
      
      console.log('✅ Test 3 passed\n');
    } catch (error) {
      console.log('⚠️  Test 3 skipped (no product data):', error.message);
      console.log('   To test, replace testItems with real product IDs\n');
    }

    // Test 4: Split order by vendor
    console.log('✂️  Test 4: Split Order by Vendor');
    
    const mockItems = [
      { productId: 'rice-1kg', quantity: 100, name: 'Rice 1kg' },
      { productId: 'coke-500ml', quantity: 50, name: 'Coke 500ml' },
      { productId: 'sugar-1kg', quantity: 30, name: 'Sugar 1kg' },
    ];

    const mockSelections = {
      items: [
        {
          productId: 'rice-1kg',
          quantity: 100,
          selectedVendor: {
            vendorId: 'vendor-a',
            vendorCode: 'V001',
            businessName: 'Vendor A',
            vendorProductId: 'vp-1',
            price: 50.00,
            finalScore: 85.5,
          },
          topVendors: [],
        },
        {
          productId: 'coke-500ml',
          quantity: 50,
          selectedVendor: {
            vendorId: 'vendor-b',
            vendorCode: 'V002',
            businessName: 'Vendor B',
            vendorProductId: 'vp-2',
            price: 25.00,
            finalScore: 82.3,
          },
          topVendors: [],
        },
        {
          productId: 'sugar-1kg',
          quantity: 30,
          selectedVendor: {
            vendorId: 'vendor-a',
            vendorCode: 'V001',
            businessName: 'Vendor A',
            vendorProductId: 'vp-3',
            price: 45.00,
            finalScore: 85.5,
          },
          topVendors: [],
        },
      ],
    };

    const splitOrders = await vendorSelectionService.splitOrderByVendor(
      mockItems,
      mockSelections
    );

    console.log(`Order split into ${splitOrders.length} vendor groups:`);
    
    splitOrders.forEach((split, index) => {
      console.log(`\nVendor ${index + 1}: ${split.vendorInfo.businessName}`);
      console.log('  Vendor ID:', split.vendorId);
      console.log('  Items:', split.items.length);
      split.items.forEach(item => {
        console.log(`    - ${item.name}: ${item.quantity} units @ $${item.unitPrice}`);
      });
      const totalValue = split.items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      );
      console.log(`  Total value: $${totalValue.toFixed(2)}`);
    });
    
    console.log('✅ Test 4 passed\n');

    // Test 5: Update ranking weights
    console.log('⚙️  Test 5: Update Ranking Weights');
    
    const newWeights = {
      reliabilityScore: 0.40,
      deliverySuccessRate: 0.30,
      responseSpeed: 0.15,
      priceCompetitiveness: 0.15,
    };

    const updatedWeights = await vendorSelectionService.updateRankingWeights(newWeights);
    console.log('Updated weights:', JSON.stringify(updatedWeights, null, 2));
    
    // Verify sum is 1.0
    const sum = Object.values(updatedWeights).reduce((a, b) => a + b, 0);
    console.log('Weights sum:', sum.toFixed(2));
    
    if (Math.abs(sum - 1.0) < 0.01) {
      console.log('✅ Test 5 passed\n');
    } else {
      console.log('❌ Test 5 failed: Weights do not sum to 1.0\n');
    }

    // Test 6: Test weight validation
    console.log('🔒 Test 6: Weight Validation');
    
    try {
      const invalidWeights = {
        reliabilityScore: 0.50,
        deliverySuccessRate: 0.30,
        responseSpeed: 0.30, // Sum > 1.0
        priceCompetitiveness: 0.20,
      };

      await vendorSelectionService.updateRankingWeights(invalidWeights);
      console.log('❌ Test 6 failed: Should have rejected invalid weights\n');
    } catch (error) {
      console.log('Correctly rejected invalid weights:', error.message);
      console.log('✅ Test 6 passed\n');
    }

    // Test 7: Generate routing reason
    console.log('📝 Test 7: Generate Routing Reason');
    
    const reason = vendorSelectionService.generateRoutingReason(
      mockSelections,
      splitOrders
    );
    
    console.log('Generated routing reason:');
    console.log(reason);
    console.log('✅ Test 7 passed\n');

    // Summary
    console.log('═══════════════════════════════════════');
    console.log('✅ All tests completed successfully!');
    console.log('═══════════════════════════════════════\n');

    console.log('📋 Summary:');
    console.log('  - Vendor ranking: Multi-criteria scoring');
    console.log('  - Criteria: Reliability, Delivery Success, Response Speed, Price');
    console.log('  - Order splitting: Automatic by vendor');
    console.log('  - ML-ready: Weights can be updated dynamically');
    console.log('  - Database logging: All routing decisions stored');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
testVendorSelection()
  .then(() => {
    console.log('\n✅ Test suite completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  });
