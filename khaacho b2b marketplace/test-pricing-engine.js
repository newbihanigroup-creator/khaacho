/**
 * Test script for Multi-Vendor Pricing Engine
 * Tests pricing setup, bulk tiers, automatic price selection, and history tracking
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

async function testPricingEngine() {
  console.log('💰 Testing Multi-Vendor Pricing Engine\n');
  console.log('='.repeat(60));

  try {
    // Get test vendors and products
    const vendors = await api.get('/vendors?limit=3');
    const products = await api.get('/products?limit=2');

    if (vendors.data.data.vendors.length < 2) {
      console.log('⚠️  Need at least 2 vendors for testing');
      return;
    }

    if (products.data.data.products.length < 1) {
      console.log('⚠️  Need at least 1 product for testing');
      return;
    }

    const vendor1 = vendors.data.data.vendors[0];
    const vendor2 = vendors.data.data.vendors[1];
    const product = products.data.data.products[0];

    console.log(`\nTest Vendors: ${vendor1.user.businessName}, ${vendor2.user.businessName}`);
    console.log(`Test Product: ${product.name}`);

    // Test 1: Set base pricing for Vendor 1
    console.log('\n📋 Test 1: Set Base Pricing (Vendor 1)');
    console.log('-'.repeat(60));
    
    const pricing1 = await api.post('/pricing/pricing', {
      vendorId: vendor1.id,
      productId: product.id,
      basePrice: 150.00,
      hasBulkPricing: false,
      minOrderQuantity: 1,
      isPromotional: false
    });
    
    console.log('✅ Vendor 1 pricing set:', {
      vendor: vendor1.user.businessName,
      basePrice: pricing1.data.data.base_price,
      pricingId: pricing1.data.data.id
    });

    // Test 2: Set pricing with bulk tiers for Vendor 2
    console.log('\n📋 Test 2: Set Pricing with Bulk Tiers (Vendor 2)');
    console.log('-'.repeat(60));
    
    const pricing2 = await api.post('/pricing/pricing', {
      vendorId: vendor2.id,
      productId: product.id,
      basePrice: 160.00,
      hasBulkPricing: true,
      minOrderQuantity: 1,
      bulkTiers: [
        {
          tierName: 'Small Bulk',
          minimumQuantity: 10,
          maximumQuantity: 49,
          tierPrice: 145.00,
          priority: 1
        },
        {
          tierName: 'Medium Bulk',
          minimumQuantity: 50,
          maximumQuantity: 99,
          tierPrice: 135.00,
          priority: 2
        },
        {
          tierName: 'Large Bulk',
          minimumQuantity: 100,
          maximumQuantity: null,
          tierPrice: 125.00,
          priority: 3
        }
      ]
    });
    
    console.log('✅ Vendor 2 pricing with tiers set:', {
      vendor: vendor2.user.businessName,
      basePrice: pricing2.data.data.base_price,
      tiers: pricing2.data.data.tiers?.length || 0
    });

    // Test 3: Get best price for small quantity (1 unit)
    console.log('\n📋 Test 3: Get Best Price for Small Quantity (1 unit)');
    console.log('-'.repeat(60));
    
    const bestPrice1 = await api.get(`/pricing/product/${product.id}/best-price?quantity=1`);
    
    console.log('✅ Best price for 1 unit:', {
      vendor: bestPrice1.data.data.vendorName,
      finalPrice: bestPrice1.data.data.finalPrice,
      selectionReason: bestPrice1.data.data.selectionReason
    });

    // Test 4: Get best price for medium quantity (50 units)
    console.log('\n📋 Test 4: Get Best Price for Medium Quantity (50 units)');
    console.log('-'.repeat(60));
    
    const bestPrice50 = await api.get(`/pricing/product/${product.id}/best-price?quantity=50`);
    
    console.log('✅ Best price for 50 units:', {
      vendor: bestPrice50.data.data.vendorName,
      basePrice: bestPrice50.data.data.basePrice,
      tierPrice: bestPrice50.data.data.tierPrice,
      finalPrice: bestPrice50.data.data.finalPrice,
      tierName: bestPrice50.data.data.tierName,
      selectionReason: bestPrice50.data.data.selectionReason
    });

    // Test 5: Get best price for large quantity (100 units)
    console.log('\n📋 Test 5: Get Best Price for Large Quantity (100 units)');
    console.log('-'.repeat(60));
    
    const bestPrice100 = await api.get(`/pricing/product/${product.id}/best-price?quantity=100`);
    
    console.log('✅ Best price for 100 units:', {
      vendor: bestPrice100.data.data.vendorName,
      basePrice: bestPrice100.data.data.basePrice,
      tierPrice: bestPrice100.data.data.tierPrice,
      finalPrice: bestPrice100.data.data.finalPrice,
      tierName: bestPrice100.data.data.tierName,
      discount: bestPrice100.data.data.discountPercentage,
      selectionReason: bestPrice100.data.data.selectionReason
    });

    // Test 6: Get all prices for comparison
    console.log('\n📋 Test 6: Get All Prices for Comparison (50 units)');
    console.log('-'.repeat(60));
    
    const allPrices = await api.get(`/pricing/product/${product.id}/all-prices?quantity=50`);
    
    console.log('✅ All vendor prices:');
    allPrices.data.data.prices.forEach((price, index) => {
      console.log(`  ${index + 1}. ${price.vendor_name}: ${price.final_price} ${price.tier_name ? `(${price.tier_name})` : '(base)'}`);
    });

    // Test 7: Get price comparison summary
    console.log('\n📋 Test 7: Get Price Comparison Summary');
    console.log('-'.repeat(60));
    
    const comparison = await api.get(`/pricing/product/${product.id}/comparison`);
    
    console.log('✅ Price comparison:', {
      vendorCount: comparison.data.data.vendor_count,
      lowestPrice: comparison.data.data.lowest_base_price,
      highestPrice: comparison.data.data.highest_base_price,
      averagePrice: comparison.data.data.average_base_price,
      priceRange: comparison.data.data.price_range,
      absoluteLowest: comparison.data.data.absolute_lowest_price
    });

    // Test 8: Calculate price for specific vendor and quantity
    console.log('\n📋 Test 8: Calculate Price for Specific Vendor');
    console.log('-'.repeat(60));
    
    const calculation = await api.get(`/pricing/vendor/${vendor2.id}/product/${product.id}/calculate?quantity=75`);
    
    console.log('✅ Price calculation for 75 units:', {
      vendor: vendor2.user.businessName,
      basePrice: calculation.data.data.basePrice,
      finalPrice: calculation.data.data.finalPrice,
      tierApplied: calculation.data.data.tierApplied,
      discount: calculation.data.data.discount
    });

    // Test 9: Get vendor's all pricing
    console.log('\n📋 Test 9: Get All Pricing for Vendor');
    console.log('-'.repeat(60));
    
    const vendorPricing = await api.get(`/pricing/vendor/${vendor2.id}/pricing`);
    
    console.log('✅ Vendor pricing:', {
      vendor: vendor2.user.businessName,
      totalProducts: vendorPricing.data.data.count,
      productsWithTiers: vendorPricing.data.data.pricing.filter(p => p.tier_count > 0).length
    });

    // Test 10: Update bulk tiers
    console.log('\n📋 Test 10: Update Bulk Tiers');
    console.log('-'.repeat(60));
    
    const updatedTiers = await api.put(`/pricing/pricing/${pricing2.data.data.id}/tiers`, {
      tiers: [
        {
          tierName: 'Wholesale',
          minimumQuantity: 20,
          maximumQuantity: null,
          tierPrice: 130.00,
          priority: 1
        }
      ]
    });
    
    console.log('✅ Bulk tiers updated');

    // Test 11: Set promotional pricing
    console.log('\n📋 Test 11: Set Promotional Pricing');
    console.log('-'.repeat(60));
    
    if (products.data.data.products.length > 1) {
      const product2 = products.data.data.products[1];
      
      const promotional = await api.post('/pricing/pricing', {
        vendorId: vendor1.id,
        productId: product2.id,
        basePrice: 99.00,
        isPromotional: true,
        promotionalLabel: 'Flash Sale - 50% Off!',
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });
      
      console.log('✅ Promotional pricing set:', {
        product: product2.name,
        price: promotional.data.data.base_price,
        label: promotional.data.data.promotional_label,
        validUntil: promotional.data.data.valid_until
      });
    }

    // Test 12: Bulk set pricing
    console.log('\n📋 Test 12: Bulk Set Pricing');
    console.log('-'.repeat(60));
    
    const bulkPricing = await api.post(`/pricing/vendor/${vendor1.id}/pricing/bulk`, {
      pricingList: products.data.data.products.slice(0, 2).map(p => ({
        productId: p.id,
        basePrice: 100 + Math.random() * 50,
        minOrderQuantity: 1
      }))
    });
    
    console.log('✅ Bulk pricing set:', {
      total: bulkPricing.data.data.total,
      successful: bulkPricing.data.data.successful,
      failed: bulkPricing.data.data.failed
    });

    // Test 13: Get pricing dashboard
    console.log('\n📋 Test 13: Get Pricing Dashboard');
    console.log('-'.repeat(60));
    
    const dashboard = await api.get('/pricing/dashboard');
    
    console.log('✅ Pricing dashboard:', {
      totalProductsPriced: dashboard.data.data.summary.total_products_priced,
      totalVendors: dashboard.data.data.summary.total_vendors,
      averagePrice: dashboard.data.data.summary.average_base_price,
      productsWithBulkPricing: dashboard.data.data.summary.products_with_bulk_pricing,
      promotionalProducts: dashboard.data.data.summary.promotional_products
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ All Pricing Engine Tests Completed Successfully!');
    console.log('='.repeat(60));

    console.log('\n📊 Key Features Demonstrated:');
    console.log('  ✓ Base pricing setup');
    console.log('  ✓ Bulk pricing tiers (quantity-based discounts)');
    console.log('  ✓ Automatic best price selection');
    console.log('  ✓ Multi-vendor price comparison');
    console.log('  ✓ Promotional pricing');
    console.log('  ✓ Price calculation for any quantity');
    console.log('  ✓ Bulk pricing operations');
    console.log('  ✓ Pricing dashboard and analytics');

  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run tests
testPricingEngine();
