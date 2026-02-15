/**
 * Test Script for Wholesaler Ranking Service
 * Tests the getTopWholesalersForProduct function
 */

require('dotenv').config();
const wholesalerRankingService = require('./src/services/wholesalerRanking.service');
const prisma = require('./src/config/database');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function logTest(testName) {
  log(`\n▶ ${testName}`, 'blue');
}

function logSuccess(message) {
  log(`  ✓ ${message}`, 'green');
}

function logError(message) {
  log(`  ✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`  ⚠ ${message}`, 'yellow');
}

/**
 * Test 1: Get top wholesalers for existing product
 */
async function testGetTopWholesalers() {
  logTest('Test 1: Get top wholesalers for product');

  try {
    // Get a product that has wholesalers
    const product = await prisma.product.findFirst({
      where: {
        productWholesalers: {
          some: {
            isAvailable: true,
            availableQuantity: { gt: 0 },
          },
        },
      },
    });

    if (!product) {
      logWarning('No products with wholesalers found in database');
      logWarning('Create test data first');
      return false;
    }

    logSuccess(`Found product: ${product.name} (${product.id})`);

    const wholesalers = await wholesalerRankingService.getTopWholesalersForProduct(
      product.id,
      5
    );

    logSuccess(`Retrieved ${wholesalers.length} wholesalers`);

    if (wholesalers.length > 0) {
      console.log('\n  Top Wholesalers:');
      wholesalers.forEach((w, index) => {
        console.log(`\n  ${index + 1}. ${w.businessName}`);
        console.log(`     Ranking Score: ${w.rankingScore.toFixed(3)}`);
        console.log(`     Price: Rs. ${w.price}`);
        console.log(`     Reliability: ${w.reliabilityScore}%`);
        console.log(`     Fulfillment: ${w.fulfillmentRate}%`);
        console.log(`     Response Time: ${w.averageResponseHours}h`);
        console.log(`     Total Orders: ${w.totalOrders}`);
        console.log(`     Available Qty: ${w.availableQuantity}`);
      });

      // Verify ranking order
      for (let i = 1; i < wholesalers.length; i++) {
        if (wholesalers[i].rankingScore > wholesalers[i - 1].rankingScore) {
          logError('Ranking order is incorrect');
          return false;
        }
      }

      logSuccess('Ranking order is correct (descending)');
    }

    return true;
  } catch (error) {
    logError(`Error: ${error.code || 'UNKNOWN'} - ${error.message}`);
    return false;
  }
}

/**
 * Test 2: Test with custom limit
 */
async function testCustomLimit() {
  logTest('Test 2: Test with custom limit');

  try {
    const product = await prisma.product.findFirst({
      where: {
        productWholesalers: {
          some: {
            isAvailable: true,
          },
        },
      },
    });

    if (!product) {
      logWarning('No products found');
      return false;
    }

    const limit = 3;
    const wholesalers = await wholesalerRankingService.getTopWholesalersForProduct(
      product.id,
      limit
    );

    if (wholesalers.length <= limit) {
      logSuccess(`Returned ${wholesalers.length} wholesalers (limit: ${limit})`);
      return true;
    } else {
      logError(`Returned ${wholesalers.length} wholesalers, expected max ${limit}`);
      return false;
    }
  } catch (error) {
    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 3: Test with invalid product ID
 */
async function testInvalidProductId() {
  logTest('Test 3: Test with invalid product ID');

  try {
    const wholesalers = await wholesalerRankingService.getTopWholesalersForProduct(
      'non-existent-product-id',
      5
    );

    if (wholesalers.length === 0) {
      logSuccess('Correctly returned empty array for non-existent product');
      return true;
    } else {
      logWarning(`Returned ${wholesalers.length} wholesalers for non-existent product`);
      return false;
    }
  } catch (error) {
    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 4: Test invalid inputs
 */
async function testInvalidInputs() {
  logTest('Test 4: Test invalid inputs');

  let passed = 0;
  let failed = 0;

  // Test null product ID
  try {
    await wholesalerRankingService.getTopWholesalersForProduct(null, 5);
    logError('Should have thrown error for null product ID');
    failed++;
  } catch (error) {
    if (error.code === 'INVALID_PRODUCT_ID') {
      logSuccess('Correctly rejected null product ID');
      passed++;
    } else {
      logError(`Unexpected error: ${error.code}`);
      failed++;
    }
  }

  // Test invalid limit
  try {
    await wholesalerRankingService.getTopWholesalersForProduct('test-id', 0);
    logError('Should have thrown error for invalid limit');
    failed++;
  } catch (error) {
    if (error.code === 'INVALID_LIMIT') {
      logSuccess('Correctly rejected invalid limit');
      passed++;
    } else {
      logError(`Unexpected error: ${error.code}`);
      failed++;
    }
  }

  // Test limit too high
  try {
    await wholesalerRankingService.getTopWholesalersForProduct('test-id', 100);
    logError('Should have thrown error for limit > 50');
    failed++;
  } catch (error) {
    if (error.code === 'INVALID_LIMIT') {
      logSuccess('Correctly rejected limit > 50');
      passed++;
    } else {
      logError(`Unexpected error: ${error.code}`);
      failed++;
    }
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

/**
 * Test 5: Test batch query
 */
async function testBatchQuery() {
  logTest('Test 5: Test batch query for multiple products');

  try {
    const products = await prisma.product.findMany({
      where: {
        productWholesalers: {
          some: {
            isAvailable: true,
          },
        },
      },
      take: 3,
    });

    if (products.length === 0) {
      logWarning('No products found for batch test');
      return false;
    }

    const productIds = products.map(p => p.id);
    logSuccess(`Testing with ${productIds.length} products`);

    const results = await wholesalerRankingService.getTopWholesalersForProducts(
      productIds,
      3
    );

    logSuccess(`Batch query completed`);

    console.log('\n  Results:');
    Object.entries(results).forEach(([productId, wholesalers]) => {
      const product = products.find(p => p.id === productId);
      console.log(`    ${product?.name}: ${wholesalers.length} wholesalers`);
    });

    if (Object.keys(results).length === productIds.length) {
      logSuccess('All products processed');
      return true;
    } else {
      logError('Some products missing from results');
      return false;
    }
  } catch (error) {
    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 6: Test ranking weights
 */
async function testRankingWeights() {
  logTest('Test 6: Test ranking weights configuration');

  try {
    const weights = wholesalerRankingService.getRankingWeights();

    logSuccess('Ranking weights retrieved');
    console.log('\n  Weights:');
    console.log(`    Reliability: ${weights.reliability}`);
    console.log(`    Price: ${weights.price}`);
    console.log(`    Fulfillment: ${weights.fulfillment}`);
    console.log(`    Response: ${weights.response}`);
    console.log(`    Total: ${weights.total.toFixed(2)}`);

    if (Math.abs(weights.total - 1.0) < 0.01) {
      logSuccess('Weights sum to 1.0');
      return true;
    } else {
      logWarning(`Weights sum to ${weights.total.toFixed(2)}, expected 1.0`);
      return false;
    }
  } catch (error) {
    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 7: Test health status
 */
async function testHealthStatus() {
  logTest('Test 7: Health status check');

  try {
    const health = wholesalerRankingService.getHealthStatus();

    logSuccess('Health status retrieved');
    console.log('\n  Status:');
    console.log(`    Service: ${health.service}`);
    console.log(`    Weights Sum: ${health.weightsSum.toFixed(2)}`);
    console.log(`    Timestamp: ${health.timestamp}`);

    return true;
  } catch (error) {
    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 8: Verify ranking score calculation
 */
async function testRankingScoreCalculation() {
  logTest('Test 8: Verify ranking score calculation');

  try {
    const product = await prisma.product.findFirst({
      where: {
        productWholesalers: {
          some: {
            isAvailable: true,
          },
        },
      },
    });

    if (!product) {
      logWarning('No products found');
      return false;
    }

    const wholesalers = await wholesalerRankingService.getTopWholesalersForProduct(
      product.id,
      5
    );

    if (wholesalers.length === 0) {
      logWarning('No wholesalers found');
      return false;
    }

    console.log('\n  Ranking Score Breakdown:');
    wholesalers.forEach((w, index) => {
      console.log(`\n  ${index + 1}. ${w.businessName}`);
      console.log(`     Normalized Reliability: ${w.normalizedReliability.toFixed(3)}`);
      console.log(`     Normalized Price: ${w.normalizedPrice.toFixed(3)}`);
      console.log(`     Normalized Fulfillment: ${w.normalizedFulfillment.toFixed(3)}`);
      console.log(`     Normalized Response: ${w.normalizedResponse.toFixed(3)}`);
      console.log(`     Final Ranking Score: ${w.rankingScore.toFixed(3)}`);
    });

    // Verify all ranking scores are between 0 and 1
    const allValid = wholesalers.every(w => 
      w.rankingScore >= 0 && w.rankingScore <= 1
    );

    if (allValid) {
      logSuccess('All ranking scores are in valid range (0-1)');
      return true;
    } else {
      logError('Some ranking scores are out of range');
      return false;
    }
  } catch (error) {
    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  logSection('Wholesaler Ranking Service Test Suite');

  console.log('\nConfiguration:');
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '✓ Set' : '✗ Not set'}`);
  console.log(`  RANKING_WEIGHT_RELIABILITY: ${process.env.RANKING_WEIGHT_RELIABILITY || '0.40 (default)'}`);
  console.log(`  RANKING_WEIGHT_PRICE: ${process.env.RANKING_WEIGHT_PRICE || '0.30 (default)'}`);
  console.log(`  RANKING_WEIGHT_FULFILLMENT: ${process.env.RANKING_WEIGHT_FULFILLMENT || '0.20 (default)'}`);
  console.log(`  RANKING_WEIGHT_RESPONSE: ${process.env.RANKING_WEIGHT_RESPONSE || '0.10 (default)'}`);

  if (!process.env.DATABASE_URL) {
    logError('\n✗ DATABASE_URL not set. Cannot run tests.');
    process.exit(1);
  }

  try {
    const tests = [
      { name: 'Health Status', fn: testHealthStatus },
      { name: 'Ranking Weights', fn: testRankingWeights },
      { name: 'Invalid Inputs', fn: testInvalidInputs },
      { name: 'Invalid Product ID', fn: testInvalidProductId },
      { name: 'Get Top Wholesalers', fn: testGetTopWholesalers },
      { name: 'Custom Limit', fn: testCustomLimit },
      { name: 'Batch Query', fn: testBatchQuery },
      { name: 'Ranking Score Calculation', fn: testRankingScoreCalculation },
    ];

    const results = [];

    for (const test of tests) {
      try {
        const passed = await test.fn();
        results.push({ name: test.name, passed });
      } catch (error) {
        logError(`Test "${test.name}" threw unexpected error: ${error.message}`);
        results.push({ name: test.name, passed: false });
      }
    }

    // Summary
    logSection('Test Summary');

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;

    console.log('\nResults:');
    results.forEach(result => {
      const icon = result.passed ? '✓' : '✗';
      const color = result.passed ? 'green' : 'red';
      log(`  ${icon} ${result.name}`, color);
    });

    console.log('\n' + '='.repeat(60));
    log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`, passed === total ? 'green' : 'yellow');
    console.log('='.repeat(60) + '\n');

    if (failed > 0) {
      logWarning('Some tests failed.');
      process.exit(1);
    } else {
      logSuccess('All tests passed!');
      process.exit(0);
    }

  } catch (error) {
    logError(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
runAllTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
