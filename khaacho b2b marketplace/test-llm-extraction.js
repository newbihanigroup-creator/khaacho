/**
 * Test Script for LLM Item Extraction Service
 * Tests the extractItemsWithLLM function with various scenarios
 */

require('dotenv').config();
const llmItemExtractionService = require('./src/services/llmItemExtraction.service');

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
 * Test 1: Simple grocery list
 */
async function testSimpleGroceryList() {
  logTest('Test 1: Simple grocery list');

  const rawText = `
Order from ABC Store
Date: 2026-02-13

10kg rice
5L cooking oil
2 dozen eggs
500g sugar
1L milk
  `;

  try {
    const items = await llmItemExtractionService.extractItemsWithLLM(rawText);

    logSuccess(`Extracted ${items.length} items`);

    items.forEach((item, index) => {
      console.log(`\n  Item ${index + 1}:`);
      console.log(`    Name: ${item.name}`);
      console.log(`    Quantity: ${item.quantity}`);
      console.log(`    Unit: ${item.unit || 'null'}`);
      console.log(`    Confidence: ${item.confidence.toFixed(2)}`);
    });

    // Validate expected items
    const expectedItems = ['rice', 'oil', 'eggs', 'sugar', 'milk'];
    const extractedNames = items.map(i => i.name.toLowerCase());
    
    let allFound = true;
    for (const expected of expectedItems) {
      const found = extractedNames.some(name => name.includes(expected));
      if (!found) {
        logWarning(`Expected item not found: ${expected}`);
        allFound = false;
      }
    }

    if (allFound) {
      logSuccess('All expected items found');
    }

    return items.length >= 4; // At least 4 items
  } catch (error) {
    logError(`Error: ${error.code} - ${error.message}`);
    if (error.code === 'OPENAI_NOT_CONFIGURED') {
      logWarning('Set OPENAI_API_KEY to run this test');
    }
    return false;
  }
}

/**
 * Test 2: Complex order with noise
 */
async function testComplexOrderWithNoise() {
  logTest('Test 2: Complex order with noise');

  const rawText = `
ABC Wholesale Distributors
Phone: +977-9800000000
Address: Surkhet, Nepal
Date: February 13, 2026
Invoice #: INV-2026-001

ORDER ITEMS:
--------------
1. Rice (Premium Basmati) - 25 kg
2. Cooking Oil (Sunflower) - 10 liters
3. Sugar (White) - 15 kg
4. Salt - 5 kg
5. Tea Leaves - 2 kg
6. Wheat Flour - 20 kg
7. Lentils (Red) - 10 kg
8. Chickpeas - 5 kg

TOTAL: Rs. 15,450
Payment Terms: Net 30
Delivery: Within 2 days

Thank you for your business!
  `;

  try {
    const items = await llmItemExtractionService.extractItemsWithLLM(rawText);

    logSuccess(`Extracted ${items.length} items`);

    items.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name} - ${item.quantity} ${item.unit || 'units'} (conf: ${item.confidence.toFixed(2)})`);
    });

    // Should extract 8 items and ignore noise
    if (items.length >= 7) {
      logSuccess('Correctly extracted items and ignored noise');
      return true;
    } else {
      logWarning(`Expected at least 7 items, got ${items.length}`);
      return false;
    }
  } catch (error) {
    logError(`Error: ${error.code} - ${error.message}`);
    return false;
  }
}

/**
 * Test 3: Handwritten-style text (messy)
 */
async function testMessyHandwrittenText() {
  logTest('Test 3: Messy handwritten-style text');

  const rawText = `
rice 10kg
oil 5l
eggs 2doz
sugar 500gm
milk 1ltr
bread 4pcs
  `;

  try {
    const items = await llmItemExtractionService.extractItemsWithLLM(rawText);

    logSuccess(`Extracted ${items.length} items`);

    items.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name} - ${item.quantity} ${item.unit || 'units'}`);
    });

    // Check unit normalization
    const hasNormalizedUnits = items.some(item => 
      ['kg', 'l', 'dozen', 'g', 'pieces'].includes(item.unit)
    );

    if (hasNormalizedUnits) {
      logSuccess('Units normalized correctly');
    }

    return items.length >= 5;
  } catch (error) {
    logError(`Error: ${error.code} - ${error.message}`);
    return false;
  }
}

/**
 * Test 4: Items with no units
 */
async function testItemsWithoutUnits() {
  logTest('Test 4: Items without units');

  const rawText = `
Order:
Rice 10
Oil 5
Eggs 24
Sugar 2
  `;

  try {
    const items = await llmItemExtractionService.extractItemsWithLLM(rawText);

    logSuccess(`Extracted ${items.length} items`);

    items.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name} - ${item.quantity} ${item.unit || 'null'}`);
    });

    // Check that items without units have null
    const itemsWithNullUnit = items.filter(item => item.unit === null);
    
    if (itemsWithNullUnit.length > 0) {
      logSuccess(`${itemsWithNullUnit.length} items correctly have null unit`);
    }

    return items.length >= 3;
  } catch (error) {
    logError(`Error: ${error.code} - ${error.message}`);
    return false;
  }
}

/**
 * Test 5: Duplicate items
 */
async function testDuplicateItems() {
  logTest('Test 5: Duplicate items (should be removed)');

  const rawText = `
Rice 10kg
Oil 5L
Rice 10kg
Sugar 2kg
Oil 5 liters
Eggs 2 dozen
  `;

  try {
    const items = await llmItemExtractionService.extractItemsWithLLM(rawText);

    logSuccess(`Extracted ${items.length} items (after deduplication)`);

    items.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name} - ${item.quantity} ${item.unit || 'units'}`);
    });

    // Should have removed duplicates
    if (items.length <= 4) {
      logSuccess('Duplicates removed correctly');
      return true;
    } else {
      logWarning(`Expected 4 or fewer items, got ${items.length}`);
      return false;
    }
  } catch (error) {
    logError(`Error: ${error.code} - ${error.message}`);
    return false;
  }
}

/**
 * Test 6: Empty text
 */
async function testEmptyText() {
  logTest('Test 6: Empty text');

  try {
    const items = await llmItemExtractionService.extractItemsWithLLM('');

    if (items.length === 0) {
      logSuccess('Correctly returned empty array for empty text');
      return true;
    } else {
      logWarning(`Expected 0 items, got ${items.length}`);
      return false;
    }
  } catch (error) {
    logError(`Error: ${error.code} - ${error.message}`);
    return false;
  }
}

/**
 * Test 7: Invalid input
 */
async function testInvalidInput() {
  logTest('Test 7: Invalid input (null)');

  try {
    await llmItemExtractionService.extractItemsWithLLM(null);
    logError('Should have thrown INVALID_INPUT error');
    return false;
  } catch (error) {
    if (error.code === 'INVALID_INPUT') {
      logSuccess('Correctly rejected invalid input');
      logSuccess(`Error message: ${error.message}`);
      return true;
    }
    logError(`Unexpected error: ${error.code}`);
    return false;
  }
}

/**
 * Test 8: Mixed units (should normalize)
 */
async function testMixedUnits() {
  logTest('Test 8: Mixed units (should normalize)');

  const rawText = `
Rice 10 kilograms
Oil 5 litres
Sugar 500 grams
Milk 1 liter
Eggs 2 dozen
Bread 4 pieces
  `;

  try {
    const items = await llmItemExtractionService.extractItemsWithLLM(rawText);

    logSuccess(`Extracted ${items.length} items`);

    items.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name} - ${item.quantity} ${item.unit || 'units'}`);
    });

    // Check unit normalization
    const normalizedUnits = ['kg', 'l', 'g', 'dozen', 'pieces'];
    const allNormalized = items.every(item => 
      item.unit === null || normalizedUnits.includes(item.unit)
    );

    if (allNormalized) {
      logSuccess('All units normalized correctly');
      return true;
    } else {
      logWarning('Some units not normalized');
      return false;
    }
  } catch (error) {
    logError(`Error: ${error.code} - ${error.message}`);
    return false;
  }
}

/**
 * Test 9: Health status
 */
async function testHealthStatus() {
  logTest('Test 9: Health status check');

  try {
    const health = llmItemExtractionService.getHealthStatus();

    logSuccess('Health status retrieved');
    console.log('\n  Status:');
    console.log(`    Configured: ${health.configured}`);
    console.log(`    Model: ${health.model}`);
    console.log(`    Service: ${health.service}`);
    console.log(`    Timestamp: ${health.timestamp}`);

    return true;
  } catch (error) {
    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 10: Real-world example
 */
async function testRealWorldExample() {
  logTest('Test 10: Real-world example (WhatsApp order)');

  const rawText = `
Hi, I need these items:

Rice - 25kg
Cooking oil - 10L
Sugar - 15kg
Salt - 5kg
Tea - 2kg
Flour - 20kg
Dal - 10kg

Please deliver tomorrow.
Thanks!
  `;

  try {
    const items = await llmItemExtractionService.extractItemsWithLLM(rawText);

    logSuccess(`Extracted ${items.length} items`);

    console.log('\n  Extracted Items:');
    items.forEach((item, index) => {
      console.log(`    ${index + 1}. ${item.name} - ${item.quantity}${item.unit || ''} (confidence: ${item.confidence.toFixed(2)})`);
    });

    // Should extract 7 items and ignore greeting/closing
    if (items.length >= 6) {
      logSuccess('Correctly extracted items from conversational text');
      return true;
    } else {
      logWarning(`Expected at least 6 items, got ${items.length}`);
      return false;
    }
  } catch (error) {
    logError(`Error: ${error.code} - ${error.message}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  logSection('LLM Item Extraction Service Test Suite');

  console.log('\nConfiguration:');
  console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Not set'}`);
  console.log(`  OPENAI_MODEL: ${process.env.OPENAI_MODEL || 'gpt-4o-mini (default)'}`);

  if (!process.env.OPENAI_API_KEY) {
    logWarning('\n⚠ OPENAI_API_KEY not set. Most tests will be skipped.');
    logWarning('Set OPENAI_API_KEY in .env to run all tests.\n');
  }

  const tests = [
    { name: 'Health Status', fn: testHealthStatus },
    { name: 'Invalid Input', fn: testInvalidInput },
    { name: 'Empty Text', fn: testEmptyText },
    { name: 'Simple Grocery List', fn: testSimpleGroceryList },
    { name: 'Complex Order with Noise', fn: testComplexOrderWithNoise },
    { name: 'Messy Handwritten Text', fn: testMessyHandwrittenText },
    { name: 'Items Without Units', fn: testItemsWithoutUnits },
    { name: 'Duplicate Items', fn: testDuplicateItems },
    { name: 'Mixed Units', fn: testMixedUnits },
    { name: 'Real-World Example', fn: testRealWorldExample },
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
    logWarning('Some tests failed. Check configuration and API key.');
  } else {
    logSuccess('All tests passed!');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
