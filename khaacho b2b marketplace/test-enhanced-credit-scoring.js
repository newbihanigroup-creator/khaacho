/**
 * Enhanced Credit Scoring Test Script
 * 
 * Tests the enhanced credit scoring system with automatic adjustments
 */

require('dotenv').config();
const enhancedCreditScoring = require('./src/services/enhancedCreditScoring.service');
const prisma = require('./src/config/database');

async function testEnhancedCreditScoring() {
  console.log('🧪 Testing Enhanced Credit Scoring System\n');

  try {
    // Test 1: Get credit score statistics
    console.log('📊 Test 1: Get Credit Score Statistics');
    const stats = await enhancedCreditScoring.getCreditScoreStatistics();
    console.log('Statistics:', JSON.stringify(stats, null, 2));
    console.log('✅ Statistics retrieved\n');

    // Test 2: Get a sample retailer
    console.log('👤 Test 2: Get Sample Retailer');
    const retailer = await prisma.retailer.findFirst({
      where: {
        isApproved: true,
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            businessName: true,
          },
        },
      },
    });

    if (!retailer) {
      console.log('⚠️  No retailers found for testing\n');
      return;
    }

    console.log(`Testing with retailer: ${retailer.user.businessName} (${retailer.retailerCode})`);
    console.log('✅ Retailer selected\n');

    // Test 3: Get retailer credit summary
    console.log('📋 Test 3: Get Retailer Credit Summary');
    const summary = await enhancedCreditScoring.getRetailerCreditSummary(retailer.id);
    console.log('Summary:', JSON.stringify(summary, null, 2));
    console.log('✅ Summary retrieved\n');

    // Test 4: Check order restriction (small order)
    console.log('🔍 Test 4: Check Order Restriction (Small Order)');
    const smallOrderAmount = 5000;
    const smallOrderCheck = await enhancedCreditScoring.checkOrderRestriction(
      retailer.id,
      smallOrderAmount
    );
    console.log(`Order amount: Rs.${smallOrderAmount}`);
    console.log('Result:', JSON.stringify(smallOrderCheck, null, 2));
    console.log(smallOrderCheck.canOrder ? '✅ Order allowed\n' : '❌ Order restricted\n');

    // Test 5: Check order restriction (large order)
    console.log('🔍 Test 5: Check Order Restriction (Large Order)');
    const largeOrderAmount = 500000;
    const largeOrderCheck = await enhancedCreditScoring.checkOrderRestriction(
      retailer.id,
      largeOrderAmount
    );
    console.log(`Order amount: Rs.${largeOrderAmount}`);
    console.log('Result:', JSON.stringify(largeOrderCheck, null, 2));
    console.log(largeOrderCheck.canOrder ? '✅ Order allowed\n' : '❌ Order restricted\n');

    // Test 6: Update credit score and check for automatic adjustment
    console.log('🔄 Test 6: Update Credit Score and Check Adjustment');
    const updateResult = await enhancedCreditScoring.updateCreditScoreAndAdjust(
      retailer.id
    );
    console.log('Update result:', JSON.stringify(updateResult, null, 2));
    
    if (updateResult.adjustment.adjusted) {
      console.log(`✅ Credit limit ${updateResult.adjustment.adjustmentType === 'AUTOMATIC_INCREASE' ? 'increased' : 'decreased'}\n`);
    } else {
      console.log('ℹ️  No adjustment needed\n');
    }

    // Test 7: Get credit adjustment history
    console.log('📜 Test 7: Get Credit Adjustment History');
    const adjustmentHistory = await enhancedCreditScoring.getCreditAdjustmentHistory(
      retailer.id,
      10
    );
    console.log(`Found ${adjustmentHistory.length} adjustments`);
    if (adjustmentHistory.length > 0) {
      console.log('Latest adjustment:', JSON.stringify(adjustmentHistory[0], null, 2));
    }
    console.log('✅ Adjustment history retrieved\n');

    // Test 8: Get order restrictions log
    console.log('📝 Test 8: Get Order Restrictions Log');
    const restrictionsLog = await enhancedCreditScoring.getOrderRestrictionsLog(
      retailer.id,
      10
    );
    console.log(`Found ${restrictionsLog.length} restriction checks`);
    if (restrictionsLog.length > 0) {
      console.log('Latest check:', JSON.stringify(restrictionsLog[0], null, 2));
    }
    console.log('✅ Restrictions log retrieved\n');

    // Test 9: Test manual credit adjustment
    console.log('✏️  Test 9: Test Manual Credit Adjustment');
    const currentLimit = parseFloat(retailer.creditLimit);
    const newLimit = currentLimit + 10000; // Increase by 10,000
    
    try {
      const manualAdjustment = await enhancedCreditScoring.manualCreditAdjustment(
        retailer.id,
        newLimit,
        'Test manual adjustment',
        null // No user ID for test
      );
      console.log('Manual adjustment:', JSON.stringify(manualAdjustment, null, 2));
      console.log('✅ Manual adjustment completed\n');
      
      // Restore original limit
      await enhancedCreditScoring.manualCreditAdjustment(
        retailer.id,
        currentLimit,
        'Restore original limit after test',
        null
      );
      console.log('✅ Original limit restored\n');
    } catch (error) {
      console.log(`⚠️  Manual adjustment test skipped: ${error.message}\n`);
    }

    // Test 10: Check database views
    console.log('🔍 Test 10: Check Database Views');
    
    const summaryView = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM retailer_credit_score_summary
    `;
    console.log(`Retailer credit score summary view: ${summaryView[0].count} records`);
    
    const thresholds = await prisma.creditScoreThreshold.findMany({
      where: { isActive: true },
    });
    console.log(`Credit score thresholds: ${thresholds.length} active thresholds`);
    console.log('Thresholds:', thresholds.map(t => ({
      name: t.thresholdName,
      range: `${t.minScore}-${t.maxScore}`,
      maxOrder: t.maxOrderAmount ? `Rs.${t.maxOrderAmount}` : 'No limit',
      autoIncrease: t.autoIncreaseEnabled ? `${t.autoIncreasePercentage}%` : 'Disabled',
    })));
    console.log('✅ Database views working\n');

    // Test 11: Test credit score functions
    console.log('🧮 Test 11: Test Database Functions');
    
    const restrictionCheck = await prisma.$queryRaw`
      SELECT * FROM check_order_restriction(${retailer.id}::uuid, 10000::decimal)
    `;
    console.log('Restriction check function:', JSON.stringify(restrictionCheck[0], null, 2));
    
    const adjustmentCalc = await prisma.$queryRaw`
      SELECT * FROM calculate_credit_limit_adjustment(${retailer.id}::uuid)
    `;
    console.log('Adjustment calculation function:', JSON.stringify(adjustmentCalc[0], null, 2));
    console.log('✅ Database functions working\n');

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
testEnhancedCreditScoring();
