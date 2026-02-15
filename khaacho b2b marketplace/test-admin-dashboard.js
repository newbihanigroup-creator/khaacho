/**
 * Admin Dashboard Test Script
 * 
 * Tests the admin intelligence dashboard with all metrics
 */

require('dotenv').config();
const adminDashboard = require('./src/services/adminDashboard.service');
const prisma = require('./src/config/database');

async function testAdminDashboard() {
  console.log('🧪 Testing Admin Intelligence Dashboard\n');

  try {
    const days = 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Test 1: Get complete admin dashboard
    console.log('📊 Test 1: Get Complete Admin Dashboard');
    console.log(`Period: Last ${days} days\n`);
    
    const dashboard = await adminDashboard.getAdminDashboard(days);
    
    console.log('Platform Overview:');
    console.log(`  Total Orders: ${dashboard.platformOverview.totalOrders}`);
    console.log(`  Completed: ${dashboard.platformOverview.completedOrders}`);
    console.log(`  Failed: ${dashboard.platformOverview.failedOrders}`);
    console.log(`  Success Rate: ${dashboard.platformOverview.orderSuccessRate}%`);
    console.log(`  Total Revenue: Rs.${dashboard.platformOverview.totalRevenue.toFixed(2)}`);
    console.log(`  Avg Order Value: Rs.${dashboard.platformOverview.avgOrderValue.toFixed(2)}`);
    console.log(`  Active Retailers: ${dashboard.platformOverview.activeRetailers}`);
    console.log(`  Active Vendors: ${dashboard.platformOverview.activeVendors}`);
    console.log('✅ Complete dashboard retrieved\n');

    // Test 2: Top Selling Items
    console.log('🏆 Test 2: Top Selling Items');
    console.log(`Found ${dashboard.topSellingItems.length} top selling items`);
    if (dashboard.topSellingItems.length > 0) {
      const top3 = dashboard.topSellingItems.slice(0, 3);
      top3.forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.productName} (${item.productCode})`);
        console.log(`   Category: ${item.category}`);
        console.log(`   Total Quantity Sold: ${item.totalQuantitySold} ${item.unit}`);
        console.log(`   Total Revenue: Rs.${item.totalRevenue.toFixed(2)}`);
        console.log(`   Avg Price: Rs.${item.avgSellingPrice.toFixed(2)}`);
        console.log(`   Order Count: ${item.orderCount}`);
        console.log(`   Trend: ${item.trend}`);
        console.log(`   Vendors: ${item.vendorCount}`);
      });
    }
    console.log('\n✅ Top selling items retrieved\n');

    // Test 3: Vendor Performance Ranking
    console.log('🥇 Test 3: Vendor Performance Ranking');
    console.log(`Found ${dashboard.vendorPerformance.length} vendors`);
    if (dashboard.vendorPerformance.length > 0) {
      const top5 = dashboard.vendorPerformance.slice(0, 5);
      top5.forEach(vendor => {
        console.log(`\n#${vendor.rank} ${vendor.businessName} (${vendor.vendorCode})`);
        console.log(`   Performance Score: ${vendor.performanceScore} (Grade: ${vendor.performanceGrade})`);
        console.log(`   Total Orders: ${vendor.totalOrders}`);
        console.log(`   Fulfillment Rate: ${vendor.fulfillmentRate}%`);
        console.log(`   Cancellation Rate: ${vendor.cancellationRate}%`);
        console.log(`   Total Revenue: Rs.${vendor.totalRevenue.toFixed(2)}`);
        console.log(`   Avg Acceptance Time: ${vendor.avgAcceptanceTimeMinutes.toFixed(2)} min`);
        console.log(`   Avg Delivery Time: ${vendor.avgDeliveryTimeHours.toFixed(2)} hours`);
      });
    }
    console.log('\n✅ Vendor performance ranking retrieved\n');

    // Test 4: Failed Orders Analysis
    console.log('❌ Test 4: Failed Orders Analysis');
    const failedOrders = dashboard.failedOrders;
    console.log(`Total Failed Orders: ${failedOrders.summary.totalFailedOrders}`);
    console.log(`Total Failed Value: Rs.${failedOrders.summary.totalFailedValue.toFixed(2)}`);
    console.log(`Avg Failed Order Value: Rs.${failedOrders.summary.avgFailedOrderValue.toFixed(2)}`);
    
    console.log('\nBy Status:');
    failedOrders.byStatus.forEach(status => {
      console.log(`  ${status.status}: ${status.count} orders (${status.percentage}%)`);
    });
    
    console.log('\nFailure Reasons:');
    console.log(`  Stock Issues: ${failedOrders.failureReasons.stockIssues}`);
    console.log(`  Price Issues: ${failedOrders.failureReasons.priceIssues}`);
    console.log(`  Credit Issues: ${failedOrders.failureReasons.creditIssues}`);
    console.log(`  Delivery Issues: ${failedOrders.failureReasons.deliveryIssues}`);
    console.log(`  No Reason: ${failedOrders.failureReasons.noReason}`);
    
    console.log('\nTime Distribution:');
    console.log(`  Morning (6-12): ${failedOrders.timeDistribution.morning}`);
    console.log(`  Afternoon (12-18): ${failedOrders.timeDistribution.afternoon}`);
    console.log(`  Evening (18-24): ${failedOrders.timeDistribution.evening}`);
    console.log(`  Night (0-6): ${failedOrders.timeDistribution.night}`);
    console.log('✅ Failed orders analysis retrieved\n');

    // Test 5: Order Processing Time
    console.log('⏱️  Test 5: Order Processing Time');
    const processingTime = dashboard.orderProcessingTime;
    console.log(`Total Orders Analyzed: ${processingTime.summary.totalOrders}`);
    console.log(`Avg Time to Confirmation: ${processingTime.summary.avgTimeToConfirmationMinutes.toFixed(2)} min`);
    console.log(`Avg Time to Dispatch: ${processingTime.summary.avgTimeToDispatchMinutes.toFixed(2)} min`);
    console.log(`Avg Time to Delivery: ${processingTime.summary.avgTimeToDeliveryMinutes.toFixed(2)} min`);
    console.log(`Avg Total Processing: ${processingTime.summary.avgTotalProcessingHours.toFixed(2)} hours`);
    console.log(`Median Processing: ${processingTime.summary.medianProcessingMinutes.toFixed(2)} min`);
    console.log(`P90 Processing: ${processingTime.summary.p90ProcessingMinutes.toFixed(2)} min`);
    console.log(`P95 Processing: ${processingTime.summary.p95ProcessingMinutes.toFixed(2)} min`);
    
    console.log('\nSpeed Distribution:');
    console.log(`  Within 24h: ${processingTime.speedDistribution.within24Hours}`);
    console.log(`  24-48h: ${processingTime.speedDistribution.between24And48Hours}`);
    console.log(`  Over 48h: ${processingTime.speedDistribution.over48Hours}`);
    
    if (processingTime.fastestVendors.length > 0) {
      console.log('\nFastest Vendors:');
      processingTime.fastestVendors.slice(0, 3).forEach((vendor, index) => {
        console.log(`  ${index + 1}. ${vendor.businessName}: ${vendor.avgProcessingHours.toFixed(2)} hours`);
      });
    }
    console.log('✅ Order processing time retrieved\n');

    // Test 6: OCR Success Rate
    console.log('📸 Test 6: OCR Success Rate');
    const ocrMetrics = dashboard.ocrSuccessRate;
    console.log(`Total Uploads: ${ocrMetrics.summary.totalUploads}`);
    console.log(`Successful OCR: ${ocrMetrics.summary.successfulOCR}`);
    console.log(`Failed OCR: ${ocrMetrics.summary.failedOCR}`);
    console.log(`Success Rate: ${ocrMetrics.summary.successRate}%`);
    console.log(`Avg Processing Time: ${ocrMetrics.summary.avgProcessingTimeSeconds.toFixed(2)} seconds`);
    console.log(`Avg Confidence Score: ${ocrMetrics.summary.avgConfidenceScore.toFixed(2)}`);
    
    if (ocrMetrics.byConfidenceLevel.high !== undefined) {
      console.log('\nConfidence Level Distribution:');
      console.log(`  High (≥90): ${ocrMetrics.byConfidenceLevel.high}`);
      console.log(`  Medium (70-89): ${ocrMetrics.byConfidenceLevel.medium}`);
      console.log(`  Low (<70): ${ocrMetrics.byConfidenceLevel.low}`);
    }
    console.log('✅ OCR success rate retrieved\n');

    // Test 7: WhatsApp Response Time
    console.log('💬 Test 7: WhatsApp Response Time');
    const whatsappMetrics = dashboard.whatsappResponseTime;
    console.log(`Total Messages: ${whatsappMetrics.summary.totalMessages}`);
    console.log(`Incoming: ${whatsappMetrics.summary.incomingMessages}`);
    console.log(`Outgoing: ${whatsappMetrics.summary.outgoingMessages}`);
    console.log(`Avg Response Time: ${whatsappMetrics.summary.avgResponseTimeSeconds.toFixed(2)} seconds`);
    console.log(`Messages Within SLA: ${whatsappMetrics.summary.messagesWithinSLA}`);
    console.log(`SLA Compliance Rate: ${whatsappMetrics.summary.slaComplianceRate}%`);
    
    if (whatsappMetrics.responseTimeDistribution.within10Seconds !== undefined) {
      console.log('\nResponse Time Distribution:');
      console.log(`  ≤10s: ${whatsappMetrics.responseTimeDistribution.within10Seconds}`);
      console.log(`  10-30s: ${whatsappMetrics.responseTimeDistribution.within10To30Seconds}`);
      console.log(`  30-60s: ${whatsappMetrics.responseTimeDistribution.within30To60Seconds}`);
      console.log(`  >60s: ${whatsappMetrics.responseTimeDistribution.over60Seconds}`);
    }
    console.log('✅ WhatsApp response time retrieved\n');

    // Test 8: Test individual endpoints
    console.log('🔍 Test 8: Test Individual Endpoints');
    
    const topItems = await adminDashboard.getTopSellingItems(startDate, 5);
    console.log(`Top selling items endpoint: ${topItems.length} items`);
    
    const vendorPerf = await adminDashboard.getVendorPerformanceRanking(startDate, 5);
    console.log(`Vendor performance endpoint: ${vendorPerf.length} vendors`);
    
    const failed = await adminDashboard.getFailedOrdersAnalysis(startDate);
    console.log(`Failed orders endpoint: ${failed.summary.totalFailedOrders} failed orders`);
    
    const processing = await adminDashboard.getAverageOrderProcessingTime(startDate);
    console.log(`Processing time endpoint: ${processing.summary.totalOrders} orders analyzed`);
    
    const ocr = await adminDashboard.getOCRSuccessRate(startDate);
    console.log(`OCR endpoint: ${ocr.summary.totalUploads} uploads`);
    
    const whatsapp = await adminDashboard.getWhatsAppResponseTime(startDate);
    console.log(`WhatsApp endpoint: ${whatsapp.summary.totalMessages} messages`);
    
    const overview = await adminDashboard.getPlatformOverview(startDate);
    console.log(`Platform overview endpoint: ${overview.totalOrders} orders`);
    
    console.log('✅ All individual endpoints working\n');

    console.log('✅ All tests completed successfully!');
    console.log(`\nDashboard generated at: ${dashboard.generatedAt}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
testAdminDashboard();
