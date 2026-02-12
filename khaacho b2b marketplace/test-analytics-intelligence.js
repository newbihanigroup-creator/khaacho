/**
 * Analytics & Intelligence System Test
 * Tests all intelligence engines and aggregation jobs
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

if (!ADMIN_TOKEN) {
  console.error('❌ ADMIN_TOKEN environment variable is required');
  console.log('Usage: ADMIN_TOKEN=your_jwt_token node test-analytics-intelligence.js');
  process.exit(1);
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function testAnalyticsSystem() {
  console.log('🧪 Testing Analytics & Intelligence System\n');
  console.log('='.repeat(60));

  let passedTests = 0;
  let failedTests = 0;

  // Test 1: CEO Dashboard
  console.log('\n📊 Test 1: CEO Dashboard');
  try {
    const response = await api.get('/api/analytics/ceo-dashboard?days=30');
    console.log('✅ CEO Dashboard retrieved successfully');
    console.log('   Platform Metrics:', {
      gmv: response.data.data.platformMetrics.grossMerchandiseValue,
      margin: response.data.data.platformMetrics.netMarginPercentage + '%',
      retailers: response.data.data.platformMetrics.activeRetailers,
      vendors: response.data.data.platformMetrics.activeVendors
    });
    passedTests++;
  } catch (error) {
    console.log('❌ CEO Dashboard failed:', error.response?.data?.message || error.message);
    failedTests++;
  }

  // Test 2: Daily Aggregation
  console.log('\n📅 Test 2: Daily Aggregation Job');
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    const response = await api.post(`/api/analytics/jobs/daily-aggregation?date=${dateStr}`);
    console.log('✅ Daily aggregation completed successfully');
    console.log('   Date:', response.data.data.date);
    passedTests++;
  } catch (error) {
    console.log('❌ Daily aggregation failed:', error.response?.data?.message || error.message);
    failedTests++;
  }

  // Test 3: Get Retailers for Intelligence Testing
  console.log('\n👥 Test 3: Fetching Retailers for Intelligence Analysis');
  let retailerId = null;
  try {
    // Try to get a retailer from orders
    const prisma = require('./src/config/database');
    const retailer = await prisma.retailer.findFirst({
      where: { isActive: true }
    });
    
    if (retailer) {
      retailerId = retailer.id;
      console.log('✅ Found retailer:', retailer.shopName);
      passedTests++;
    } else {
      console.log('⚠️  No active retailers found - skipping retailer intelligence test');
    }
  } catch (error) {
    console.log('❌ Failed to fetch retailer:', error.message);
    failedTests++;
  }

  // Test 4: Retailer Intelligence
  if (retailerId) {
    console.log('\n🧠 Test 4: Retailer Intelligence Analysis');
    try {
      const response = await api.get(`/api/analytics/intelligence/retailer/${retailerId}`);
      console.log('✅ Retailer intelligence retrieved successfully');
      console.log('   Metrics:', {
        avgOrderValue: response.data.data.metrics.avgOrderValue,
        orderFrequency: response.data.data.metrics.orderFrequency + ' days',
        churnRisk: response.data.data.metrics.churnRisk + '%',
        lifetimeValue: response.data.data.metrics.lifetimeValue
      });
      console.log('   Actions Generated:', response.data.data.actions.length);
      if (response.data.data.actions.length > 0) {
        console.log('   Sample Action:', response.data.data.actions[0].type);
      }
      passedTests++;
    } catch (error) {
      console.log('❌ Retailer intelligence failed:', error.response?.data?.message || error.message);
      failedTests++;
    }
  }

  // Test 5: Get Vendor for Intelligence Testing
  console.log('\n🏪 Test 5: Fetching Vendor for Intelligence Analysis');
  let vendorId = null;
  try {
    const prisma = require('./src/config/database');
    const vendor = await prisma.vendor.findFirst({
      where: { isApproved: true }
    });
    
    if (vendor) {
      vendorId = vendor.id;
      console.log('✅ Found vendor:', vendor.vendorCode);
      passedTests++;
    } else {
      console.log('⚠️  No approved vendors found - skipping vendor intelligence test');
    }
  } catch (error) {
    console.log('❌ Failed to fetch vendor:', error.message);
    failedTests++;
  }

  // Test 6: Vendor Intelligence
  if (vendorId) {
    console.log('\n🏭 Test 6: Vendor Intelligence Analysis');
    try {
      const response = await api.get(`/api/analytics/intelligence/vendor/${vendorId}`);
      console.log('✅ Vendor intelligence retrieved successfully');
      console.log('   Metrics:', {
        fulfillmentRate: response.data.data.metrics.fulfillmentRate + '%',
        avgAcceptTime: response.data.data.metrics.avgAcceptTime + ' min',
        cancellationRate: response.data.data.metrics.cancellationRate + '%'
      });
      console.log('   Actions Generated:', response.data.data.actions.length);
      passedTests++;
    } catch (error) {
      console.log('❌ Vendor intelligence failed:', error.response?.data?.message || error.message);
      failedTests++;
    }
  }

  // Test 7: Credit Intelligence
  console.log('\n💳 Test 7: Credit Intelligence Analysis');
  try {
    const response = await api.get('/api/analytics/intelligence/credit');
    console.log('✅ Credit intelligence retrieved successfully');
    console.log('   Total Exposure:', response.data.data.totalCreditExposure);
    console.log('   Aging Buckets:', response.data.data.agingBuckets);
    console.log('   Expected Inflow (7 days):', response.data.data.expectedInflow7Days);
    console.log('   Expected Inflow (30 days):', response.data.data.expectedInflow30Days);
    passedTests++;
  } catch (error) {
    console.log('❌ Credit intelligence failed:', error.response?.data?.message || error.message);
    failedTests++;
  }

  // Test 8: Get Product for Forecasting
  console.log('\n📦 Test 8: Fetching Product for Demand Forecasting');
  let productId = null;
  try {
    const prisma = require('./src/config/database');
    const product = await prisma.product.findFirst({
      where: { isActive: true }
    });
    
    if (product) {
      productId = product.id;
      console.log('✅ Found product:', product.name);
      passedTests++;
    } else {
      console.log('⚠️  No active products found - skipping forecast test');
    }
  } catch (error) {
    console.log('❌ Failed to fetch product:', error.message);
    failedTests++;
  }

  // Test 9: Demand Forecasting
  if (productId) {
    console.log('\n🔮 Test 9: Demand Forecasting');
    try {
      const response = await api.get(`/api/analytics/forecast/product/${productId}?days=7`);
      console.log('✅ Demand forecast retrieved successfully');
      console.log('   Predicted Quantity (7 days):', response.data.data.predictedQuantity);
      console.log('   Confidence:', response.data.data.confidence + '%');
      console.log('   Moving Avg (7-day):', response.data.data.movingAvg7Day);
      console.log('   Trend Slope:', response.data.data.trendSlope);
      passedTests++;
    } catch (error) {
      console.log('❌ Demand forecast failed:', error.response?.data?.message || error.message);
      failedTests++;
    }
  }

  // Test 10: Top 20 Products Forecast
  console.log('\n🏆 Test 10: Top 20 Products Forecast');
  try {
    const response = await api.get('/api/analytics/forecast/top20');
    console.log('✅ Top 20 forecast retrieved successfully');
    console.log('   Products Forecasted:', response.data.data.length);
    if (response.data.data.length > 0) {
      console.log('   Sample:', {
        product: response.data.data[0].name,
        avgDailyDemand: response.data.data[0].avgDailyDemand,
        predicted7Days: response.data.data[0].predictedNext7Days
      });
    }
    passedTests++;
  } catch (error) {
    console.log('❌ Top 20 forecast failed:', error.response?.data?.message || error.message);
    failedTests++;
  }

  // Test 11: Check Intelligence Actions Table
  console.log('\n🤖 Test 11: Intelligence Actions Database');
  try {
    const prisma = require('./src/config/database');
    const actions = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count, action_type, priority 
      FROM intelligence_actions 
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY action_type, priority
      ORDER BY count DESC
      LIMIT 5
    `);
    
    console.log('✅ Intelligence actions table accessible');
    console.log('   Recent Actions (last 7 days):', actions.length > 0 ? actions : 'None yet');
    passedTests++;
  } catch (error) {
    console.log('❌ Intelligence actions check failed:', error.message);
    failedTests++;
  }

  // Test 12: Check Aggregation Tables
  console.log('\n📊 Test 12: Aggregation Tables');
  try {
    const prisma = require('./src/config/database');
    
    const dailySales = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM daily_sales_summary
    `);
    
    const creditExposure = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM credit_exposure_summary
    `);
    
    const platformMetrics = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM platform_intelligence_metrics
    `);
    
    console.log('✅ Aggregation tables accessible');
    console.log('   Daily Sales Records:', dailySales[0].count);
    console.log('   Credit Exposure Records:', creditExposure[0].count);
    console.log('   Platform Metrics Records:', platformMetrics[0].count);
    passedTests++;
  } catch (error) {
    console.log('❌ Aggregation tables check failed:', error.message);
    failedTests++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📈 Test Summary');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📊 Total: ${passedTests + failedTests}`);
  console.log(`🎯 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);

  if (failedTests === 0) {
    console.log('\n🎉 All tests passed! Analytics & Intelligence system is working perfectly.');
  } else if (passedTests > failedTests) {
    console.log('\n⚠️  Most tests passed. Review failed tests above.');
  } else {
    console.log('\n❌ Multiple tests failed. Check system configuration.');
  }

  console.log('\n💡 Next Steps:');
  console.log('   1. Check CEO dashboard daily: GET /api/analytics/ceo-dashboard');
  console.log('   2. Review intelligence actions: SELECT * FROM intelligence_actions WHERE status = \'PENDING\'');
  console.log('   3. Monitor aggregation jobs in logs/combined-*.log');
  console.log('   4. Act on high-priority recommendations');

  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
testAnalyticsSystem().catch(error => {
  console.error('❌ Test suite failed:', error.message);
  process.exit(1);
});
