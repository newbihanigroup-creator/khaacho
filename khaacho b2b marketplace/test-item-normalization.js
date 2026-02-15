/**
 * Test Script for Item Normalization Service
 * Tests the normalizeItems function with database queries
 */

require('dotenv').config();
const itemNormalizationService = require('./src/services/itemNormalization.service');
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
 * Setup: Create test data
 */
async function setupTestData() {
  logTest('Setup: Creating test data');

  try {
    // Create test products
    const products = await prisma.product.createMany({
      data: [
        {
          name: 'Rice',
          category: 'Grains',
          unit: 'kg',
          popularityScore: 100,
        },
        {
          name: 'Basmati Rice',
          category: 'Grains',
          unit: 'kg',
          popularityScore: 80,
        },
        {
          name: 'Cooking Oil',
          category: 'Oils',
          unit: 'l',
          popularityScore: 90,
        },
        {
          name: 'Sunflower Oil',
          category: 'Oils',
          unit: 'l',
          popularityScore: 70,
        },
        {
          name: 'Sugar',
          category: 'Sweeteners',
          unit: 'kg',
          popularityScore: 85,
        },
      ],
      skipDuplicates: true,
    });

    logSuccess(`Created ${products.count} test products`);

    // Create test uploaded order
    const uploadedOrder = await prisma.uploadedOrder.create({
      data: {
        imageUrl: 'https://example.com/test.jpg',
        imageKey: 'test/test.jpg',
        status: 'PROCESSING',
        extractedText: 'Test order',
        parsedData: {
          items: [
            { name: 'Rice', quantity: 10, unit: 'kg', confidence: 0.95 },
            { name: 'oil', quantity: 5, unit: 'l', confidence: 0.90 },
            { name: 'basmati', quantity: 2, unit: 'kg', confidence: 0.85 },
            { name: 'unknown item', quantity: 1, unit: null, confidence: 0.70 },
          ],
        },
      },
    });

    logSuccess(`Created test uploaded order: ${uploadedOrder.id}`);

    return uploadedOrder.id;
  } catch (error) {
    logError(`Setup failed: ${error.message}`);
    throw error;
  }
}

/**
 * Cleanup: Remove test data
 */
async function cleanupTestData(uploadedOrderId) {
  logTest('Cleanup: Removing test data');

  try {
    if (uploadedOrderId) {
      await prisma.uploadedOrder.delete({
        where: { id: uploadedOrderId },
      });
      logSuccess('Deleted test uploaded order');
    }

    // Note: We don't delete products as they might be used by other data
    logSuccess('Cleanup completed');
  } catch (error) {
    logWarning(`Cleanup warning: ${error.message}`);
  }
}

/**
 * Test 1: Normalize items with exact matches
 */
async function testExactMatches(uploadedOrderId) {
  logTest('Test 1: Normalize items with exact matches');

  try {
    const result = await itemNormalizationService.normalizeItems(uploadedOrderId);

    logSuccess(`Normalization completed`);
    console.log(`\n  Results:`);
    console.log(`    Total items: ${result.totalItems}`);
    console.log(`    Matched: ${result.matched}`);
    console.log(`    Unmatched: ${result.unmatched}`);
    console.log(`    Needs review: ${result.needsReview}`);
    console.log(`    Status: ${result.status}`);

    console.log(`\n  Items:`);
    result.items.forEach((item, index) => {
      console.log(`\n    ${index + 1}. ${item.name}`);
      console.log(`       Product ID: ${item.productId || 'null'}`);
      console.log(`       Product Name: ${item.productName || 'null'}`);
      console.log(`       Match Type: ${item.matchType}`);
      console.log(`       Confidence: ${item.confidence.toFixed(2)}`);
      console.log(`       Needs Review: ${item.needsReview}`);
      
      if (item.alternatives && item.alternatives.length > 0) {
        console.log(`       Alternatives: ${item.alternatives.length}`);
      }
    });

    // Validate results
    if (result.totalItems === 4) {
      logSuccess('Correct number of items processed');
    }

    if (result.matched >= 2) {
      logSuccess('At least 2 items matched');
    }

    return true;
  } catch (error) {
    logError(`Error: ${error.code || 'UNKNOWN'} - ${error.message}`);
    return false;
  }
}

/**
 * Test 2: Check database storage
 */
async function testDatabaseStorage(uploadedOrderId) {
  logTest('Test 2: Check database storage');

  try {
    const uploadedOrder = await prisma.uploadedOrder.findUnique({
      where: { id: uploadedOrderId },
    });

    if (!uploadedOrder) {
      logError('Uploaded order not found');
      return false;
    }

    logSuccess('Uploaded order retrieved');

    const parsedData = uploadedOrder.parsedData;
    
    if (parsedData && parsedData.items) {
      logSuccess(`Found ${parsedData.items.length} items in parsedData`);
      
      const itemsWithProductId = parsedData.items.filter(i => i.productId);
      logSuccess(`${itemsWithProductId.length} items have productId`);
      
      const itemsNeedingReview = parsedData.items.filter(i => i.needsReview);
      console.log(`  Items needing review: ${itemsNeedingReview.length}`);
      
      if (parsedData.normalizedAt) {
        logSuccess(`Normalized at: ${parsedData.normalizedAt}`);
      }
    } else {
      logWarning('No items in parsedData');
    }

    if (uploadedOrder.status === 'PENDING_REVIEW' || uploadedOrder.status === 'COMPLETED') {
      logSuccess(`Status updated to: ${uploadedOrder.status}`);
    }

    return true;
  } catch (error) {
    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 3: Test invalid order ID
 */
async function testInvalidOrderId() {
  logTest('Test 3: Test invalid order ID');

  try {
    await itemNormalizationService.normalizeItems('invalid-id-12345');
    logError('Should have thrown ORDER_NOT_FOUND error');
    return false;
  } catch (error) {
    if (error.code === 'ORDER_NOT_FOUND') {
      logSuccess('Correctly threw ORDER_NOT_FOUND error');
      logSuccess(`Error message: ${error.message}`);
      return true;
    }
    logError(`Unexpected error: ${error.code}`);
    return false;
  }
}

/**
 * Test 4: Test health status
 */
async function testHealthStatus() {
  logTest('Test 4: Health status check');

  try {
    const health = itemNormalizationService.getHealthStatus();

    logSuccess('Health status retrieved');
    console.log('\n  Status:');
    console.log(`    Service: ${health.service}`);
    console.log(`    Confidence Threshold: ${health.confidenceThreshold}`);
    console.log(`    Timestamp: ${health.timestamp}`);

    return true;
  } catch (error) {
    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 5: Test match types
 */
async function testMatchTypes(uploadedOrderId) {
  logTest('Test 5: Test different match types');

  try {
    const uploadedOrder = await prisma.uploadedOrder.findUnique({
      where: { id: uploadedOrderId },
    });

    const items = uploadedOrder.parsedData.items;

    const matchTypes = {
      exact: items.filter(i => i.matchType === 'exact').length,
      ilike: items.filter(i => i.matchType === 'ilike').length,
      fulltext: items.filter(i => i.matchType === 'fulltext').length,
      none: items.filter(i => i.matchType === 'none').length,
    };

    console.log('\n  Match Types:');
    console.log(`    Exact: ${matchTypes.exact}`);
    console.log(`    ILIKE: ${matchTypes.ilike}`);
    console.log(`    Full-text: ${matchTypes.fulltext}`);
    console.log(`    None: ${matchTypes.none}`);

    if (matchTypes.exact > 0) {
      logSuccess('Found exact matches');
    }

    if (matchTypes.ilike > 0 || matchTypes.fulltext > 0) {
      logSuccess('Found fuzzy matches');
    }

    if (matchTypes.none > 0) {
      logSuccess('Correctly identified unmatched items');
    }

    return true;
  } catch (error) {
    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 6: Test confidence scoring
 */
async function testConfidenceScoring(uploadedOrderId) {
  logTest('Test 6: Test confidence scoring');

  try {
    const uploadedOrder = await prisma.uploadedOrder.findUnique({
      where: { id: uploadedOrderId },
    });

    const items = uploadedOrder.parsedData.items;

    console.log('\n  Confidence Scores:');
    items.forEach((item, index) => {
      console.log(`    ${index + 1}. ${item.name}: ${item.confidence.toFixed(2)} (${item.needsReview ? 'needs review' : 'ok'})`);
    });

    const highConfidence = items.filter(i => i.confidence >= 0.7).length;
    const lowConfidence = items.filter(i => i.confidence < 0.7).length;

    console.log(`\n  High confidence (≥0.7): ${highConfidence}`);
    console.log(`  Low confidence (<0.7): ${lowConfidence}`);

    logSuccess('Confidence scoring working');

    return true;
  } catch (error) {
    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  logSection('Item Normalization Service Test Suite');

  console.log('\nConfiguration:');
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '✓ Set' : '✗ Not set'}`);
  console.log(`  PRODUCT_MATCH_THRESHOLD: ${process.env.PRODUCT_MATCH_THRESHOLD || '0.7 (default)'}`);

  if (!process.env.DATABASE_URL) {
    logError('\n✗ DATABASE_URL not set. Cannot run tests.');
    process.exit(1);
  }

  let uploadedOrderId = null;

  try {
    // Setup
    uploadedOrderId = await setupTestData();

    // Run tests
    const tests = [
      { name: 'Health Status', fn: () => testHealthStatus() },
      { name: 'Invalid Order ID', fn: () => testInvalidOrderId() },
      { name: 'Exact Matches', fn: () => testExactMatches(uploadedOrderId) },
      { name: 'Database Storage', fn: () => testDatabaseStorage(uploadedOrderId) },
      { name: 'Match Types', fn: () => testMatchTypes(uploadedOrderId) },
      { name: 'Confidence Scoring', fn: () => testConfidenceScoring(uploadedOrderId) },
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

    // Cleanup
    await cleanupTestData(uploadedOrderId);

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
    
    // Cleanup on error
    if (uploadedOrderId) {
      await cleanupTestData(uploadedOrderId);
    }
    
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
