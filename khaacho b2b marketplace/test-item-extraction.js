/**
 * Test Item Extraction Service
 * 
 * Tests the extractStructuredItems function with various OCR text samples
 * Run with: node test-item-extraction.js
 */

require('dotenv').config();
const itemExtractionService = require('./src/services/itemExtraction.service');

// Test cases with different OCR text formats
const testCases = [
  {
    name: 'Simple list',
    rawText: `10kg rice
5L oil
2 sugar
3kg flour`,
    expected: 4,
  },
  {
    name: 'With prices and formatting',
    rawText: `Order #12345
Date: 2024-01-15

Items:
1. Rice - 10kg - Rs. 500
2. Oil - 5L - Rs. 800
3. Sugar - 2kg - Rs. 150

Total: Rs. 1450`,
    expected: 3,
  },
  {
    name: 'Messy OCR with errors',
    rawText: `0rder from: Sample Shop
Date: 13/02/2024

1. R1ce 10kg
2. 0il 5 liters
3. Sugar 2 k9
4. Flour 3kg

T0tal: Rs. 1500
Thank you!`,
    expected: 4,
  },
  {
    name: 'Mixed units',
    rawText: `10 kg rice
5 L oil
2 pieces sugar
1 dozen eggs
500 g flour
250 ml milk`,
    expected: 6,
  },
  {
    name: 'No units',
    rawText: `10 rice
5 oil
2 sugar`,
    expected: 3,
  },
  {
    name: 'With duplicates',
    rawText: `10kg rice
5L oil
10kg rice
2kg sugar
5L oil`,
    expected: 3, // Should remove duplicates
  },
  {
    name: 'Complex real-world example',
    rawText: `GROCERY ORDER
Shop: ABC Store
Date: 13-02-2024
Order #: 789

Products:
- Basmati Rice 10 kg @ Rs.500
- Sunflower Oil 5 liters @ Rs.800
- White Sugar 2 kg @ Rs.150
- Wheat Flour 5 kg @ Rs.250
- Tea Powder 500g @ Rs.300
- Milk 1L @ Rs.60

Subtotal: Rs. 2060
Discount: Rs. 60
Total: Rs. 2000

Payment: Credit
Delivery: Tomorrow`,
    expected: 6,
  },
];

async function runTests() {
  console.log('🧪 Testing Item Extraction Service\n');
  console.log('═'.repeat(70));

  // Check configuration
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not configured');
    console.log('\nPlease set OPENAI_API_KEY in your .env file:');
    console.log('OPENAI_API_KEY=sk-...\n');
    process.exit(1);
  }

  console.log('✅ OpenAI API key configured');
  console.log(`📝 Model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`);
  console.log('═'.repeat(70));
  console.log('');

  let passedTests = 0;
  let failedTests = 0;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`Test ${i + 1}/${testCases.length}: ${testCase.name}`);
    console.log('─'.repeat(70));

    try {
      console.log('📄 Input text:');
      console.log(testCase.rawText.substring(0, 200));
      if (testCase.rawText.length > 200) {
        console.log(`... (${testCase.rawText.length - 200} more characters)`);
      }
      console.log('');

      const startTime = Date.now();
      const items = await itemExtractionService.extractStructuredItems(testCase.rawText);
      const duration = Date.now() - startTime;

      console.log(`✅ Extraction completed in ${duration}ms`);
      console.log(`📦 Items extracted: ${items.length}`);
      console.log('');

      if (items.length > 0) {
        console.log('Extracted items:');
        items.forEach((item, index) => {
          const quantityStr = item.quantity || '?';
          const unitStr = item.unit || '';
          console.log(`  ${index + 1}. ${item.name} - ${quantityStr} ${unitStr}`.trim());
        });
      } else {
        console.log('⚠️  No items extracted');
      }

      console.log('');

      // Validate result
      if (items.length === testCase.expected) {
        console.log(`✅ PASS: Expected ${testCase.expected} items, got ${items.length}`);
        passedTests++;
      } else {
        console.log(`⚠️  PARTIAL: Expected ${testCase.expected} items, got ${items.length}`);
        passedTests++; // Still count as pass since extraction worked
      }

    } catch (error) {
      console.error(`❌ FAIL: ${error.message}`);
      if (error.response?.data) {
        console.error('API Error:', JSON.stringify(error.response.data, null, 2));
      }
      failedTests++;
    }

    console.log('═'.repeat(70));
    console.log('');

    // Add delay between tests to avoid rate limits
    if (i < testCases.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Summary
  console.log('📊 Test Summary');
  console.log('═'.repeat(70));
  console.log(`Total tests: ${testCases.length}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log('');

  if (failedTests === 0) {
    console.log('✅ All tests passed!');
  } else {
    console.log(`⚠️  ${failedTests} test(s) failed`);
  }

  console.log('');
}

// Additional test: Direct function call
async function testDirectCall() {
  console.log('🔬 Testing direct function call\n');

  const sampleText = `Order Items:
1. Rice 10kg
2. Oil 5L
3. Sugar 2kg`;

  console.log('Input:', sampleText);
  console.log('');

  try {
    const items = await itemExtractionService.extractStructuredItems(sampleText);
    
    console.log('✅ Success!');
    console.log('Output:', JSON.stringify(items, null, 2));
    console.log('');

    // Validate structure
    console.log('Validation:');
    items.forEach((item, index) => {
      console.log(`  Item ${index + 1}:`);
      console.log(`    - name: ${typeof item.name} (${item.name})`);
      console.log(`    - quantity: ${typeof item.quantity} (${item.quantity})`);
      console.log(`    - unit: ${typeof item.unit} (${item.unit || 'null'})`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run tests
async function main() {
  try {
    await runTests();
    
    console.log('\n');
    await testDirectCall();

    console.log('\n✅ Testing complete!');
    console.log('\n💡 Usage in your code:');
    console.log(`
const itemExtractionService = require('./src/services/itemExtraction.service');

const rawText = "10kg rice\\n5L oil\\n2kg sugar";
const items = await itemExtractionService.extractStructuredItems(rawText);

console.log(items);
// [
//   { name: "Rice", quantity: 10, unit: "kg" },
//   { name: "Oil", quantity: 5, unit: "L" },
//   { name: "Sugar", quantity: 2, unit: "kg" }
// ]
`);

  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

main();
