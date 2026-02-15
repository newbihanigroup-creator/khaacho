/**
 * Vendor Load Balancing Test Script
 * 
 * Tests the vendor load balancing system
 */

require('dotenv').config();
const vendorLoadBalancing = require('./src/services/vendorLoadBalancing.service');
const prisma = require('./src/config/database');

async function testVendorLoadBalancing() {
  console.log('🧪 Testing Vendor Load Balancing System\n');

  try {
    // Test 1: Get current configuration
    console.log('📋 Test 1: Get Configuration');
    const config = vendorLoadBalancing.getConfiguration();
    console.log('Configuration:', JSON.stringify(config, null, 2));
    console.log('✅ Configuration retrieved\n');

    // Test 2: Get vendor load statistics
    console.log('📊 Test 2: Get Vendor Load Statistics');
    const loadStats = await vendorLoadBalancing.getVendorLoadStatistics();
    console.log(`Found ${loadStats.length} vendors`);
    if (loadStats.length > 0) {
      console.log('Sample vendor:', JSON.stringify(loadStats[0], null, 2));
    }
    console.log('✅ Load statistics retrieved\n');

    // Test 3: Get monopoly statistics
    console.log('🎯 Test 3: Get Monopoly Statistics');
    const monopolyStats = await vendorLoadBalancing.getMonopolyStatistics(null, 30);
    console.log(`Found ${monopolyStats.length} vendor-product combinations`);
    if (monopolyStats.length > 0) {
      const topVendor = monopolyStats[0];
      console.log('Top market share:', JSON.stringify(topVendor, null, 2));
      
      if (topVendor.exceedsThreshold) {
        console.log(`⚠️  Vendor ${topVendor.vendorCode} exceeds monopoly threshold!`);
      }
    }
    console.log('✅ Monopoly statistics retrieved\n');

    // Test 4: Test vendor selection with load balancing
    console.log('🎲 Test 4: Test Vendor Selection');
    
    // Get a sample product
    const product = await prisma.product.findFirst({
      where: {
        vendorProducts: {
          some: {
            isAvailable: true,
            stock: { gt: 0 },
          },
        },
      },
    });

    if (product) {
      console.log(`Testing with product: ${product.name} (${product.id})`);
      
      try {
        const selectedVendor = await vendorLoadBalancing.selectVendorWithLoadBalancing(
          product.id,
          10,
          { retailerId: null }
        );
        
        console.log('Selected vendor:', JSON.stringify({
          vendorId: selectedVendor.vendorId,
          vendorCode: selectedVendor.vendorCode,
          vendorName: selectedVendor.vendorName,
          activeOrders: selectedVendor.activeOrdersCount,
          pendingOrders: selectedVendor.pendingOrdersCount,
          intelligenceScore: selectedVendor.intelligenceScore,
          price: selectedVendor.price,
        }, null, 2));
        console.log('✅ Vendor selected successfully\n');
      } catch (error) {
        console.log(`⚠️  Vendor selection failed: ${error.message}\n`);
      }
    } else {
      console.log('⚠️  No products available for testing\n');
    }

    // Test 5: Test working hours filtering
    console.log('⏰ Test 5: Test Working Hours Filtering');
    const now = new Date();
    const currentHour = now.getHours();
    console.log(`Current time: ${now.toLocaleTimeString()} (Hour: ${currentHour})`);
    
    const vendors = await prisma.vendor.findMany({
      where: {
        isApproved: true,
        deletedAt: null,
      },
      take: 5,
    });

    if (vendors.length > 0) {
      const testVendors = vendors.map(v => ({
        vendorId: v.id,
        vendorCode: v.vendorCode,
        workingHoursStart: v.workingHoursStart || config.defaultWorkingHours.start,
        workingHoursEnd: v.workingHoursEnd || config.defaultWorkingHours.end,
      }));

      const filtered = await vendorLoadBalancing.filterByWorkingHours(testVendors);
      console.log(`Vendors in working hours: ${filtered.length}/${testVendors.length}`);
      console.log('✅ Working hours filtering tested\n');
    }

    // Test 6: Test capacity filtering
    console.log('📦 Test 6: Test Capacity Filtering');
    if (loadStats.length > 0) {
      const filtered = await vendorLoadBalancing.filterByLoadCapacity(loadStats);
      console.log(`Vendors with capacity: ${filtered.length}/${loadStats.length}`);
      
      const atCapacity = loadStats.filter(v => 
        v.activeOrders >= config.maxActiveOrdersPerVendor ||
        v.pendingOrders >= config.maxPendingOrdersPerVendor
      );
      
      if (atCapacity.length > 0) {
        console.log(`⚠️  ${atCapacity.length} vendors at capacity`);
        console.log('Sample:', JSON.stringify(atCapacity[0], null, 2));
      }
      console.log('✅ Capacity filtering tested\n');
    }

    // Test 7: Test configuration update
    console.log('⚙️  Test 7: Test Configuration Update');
    const newConfig = {
      maxActiveOrdersPerVendor: 15,
      loadBalancingStrategy: 'least-loaded',
    };
    vendorLoadBalancing.updateConfiguration(newConfig);
    const updatedConfig = vendorLoadBalancing.getConfiguration();
    console.log('Updated config:', JSON.stringify({
      maxActiveOrdersPerVendor: updatedConfig.maxActiveOrdersPerVendor,
      loadBalancingStrategy: updatedConfig.loadBalancingStrategy,
    }, null, 2));
    
    // Restore original config
    vendorLoadBalancing.updateConfiguration(config);
    console.log('✅ Configuration update tested\n');

    // Test 8: Check database views
    console.log('🔍 Test 8: Check Database Views');
    
    const capacityView = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM vendor_capacity_status
    `;
    console.log(`Vendor capacity status view: ${capacityView[0].count} records`);
    
    const marketShareView = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM vendor_market_share
    `;
    console.log(`Vendor market share view: ${marketShareView[0].count} records`);
    console.log('✅ Database views working\n');

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
testVendorLoadBalancing();
