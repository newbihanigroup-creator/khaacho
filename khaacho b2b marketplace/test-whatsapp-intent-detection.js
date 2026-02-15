/**
 * Test Script: WhatsApp Intent Detection
 * 
 * Tests intent detection from WhatsApp messages
 * 
 * Usage: node test-whatsapp-intent-detection.js
 */

require('dotenv').config();
const intentDetectionService = require('./src/services/whatsappIntentDetection.service');

// Test messages with expected intents
const testMessages = [
  // Place Order Intent
  {
    text: 'RICE-1KG x 10',
    expectedIntent: 'place_order',
    description: 'SKU format order',
  },
  {
    text: '10 x RICE-1KG',
    expectedIntent: 'place_order',
    description: 'Quantity x SKU format',
  },
  {
    text: 'I need 10 bags of rice',
    expectedIntent: 'place_order',
    description: 'Natural language order',
  },
  {
    text: 'rice 10 kg\ndal 5 kg',
    expectedIntent: 'place_order',
    description: 'Multi-line order',
  },
  {
    text: 'Please send 20 kg chamal',
    expectedIntent: 'place_order',
    description: 'Order with local term',
  },

  // Order Status Intent
  {
    text: 'Order #ORD260100001',
    expectedIntent: 'order_status',
    description: 'Order number query',
  },
  {
    text: 'Status of my order',
    expectedIntent: 'order_status',
    description: 'Status query',
  },
  {
    text: 'Where is my delivery?',
    expectedIntent: 'order_status',
    description: 'Delivery query',
  },
  {
    text: 'Track ORD260100001',
    expectedIntent: 'order_status',
    description: 'Track order',
  },

  // Help Intent
  {
    text: 'help',
    expectedIntent: 'help',
    description: 'Help request',
  },
  {
    text: 'How do I place an order?',
    expectedIntent: 'help',
    description: 'How-to question',
  },
  {
    text: 'What can you do?',
    expectedIntent: 'help',
    description: 'Capability question',
  },
  {
    text: "I don't understand",
    expectedIntent: 'help',
    description: 'Confusion statement',
  },

  // Greeting Intent
  {
    text: 'Hi',
    expectedIntent: 'greeting',
    description: 'Simple greeting',
  },
  {
    text: 'Hello there',
    expectedIntent: 'greeting',
    description: 'Greeting with extra words',
  },
  {
    text: 'Namaste',
    expectedIntent: 'greeting',
    description: 'Local greeting',
  },
  {
    text: 'Good morning',
    expectedIntent: 'greeting',
    description: 'Time-based greeting',
  },
  {
    text: 'Thanks',
    expectedIntent: 'greeting',
    description: 'Thank you message',
  },

  // Unknown Intent
  {
    text: 'xyz abc 123',
    expectedIntent: 'unknown',
    description: 'Random text',
  },
  {
    text: 'The weather is nice today',
    expectedIntent: 'unknown',
    description: 'Off-topic message',
  },
];

async function runTests() {
  console.log('🧪 WhatsApp Intent Detection Test\n');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;

  for (const test of testMessages) {
    try {
      console.log(`\n📝 Test: ${test.description}`);
      console.log(`   Message: "${test.text}"`);
      console.log(`   Expected: ${test.expectedIntent}`);

      const result = await intentDetectionService.detectIntent({
        phoneNumber: '+9779800000000',
        messageText: test.text,
        messageId: `test-${Date.now()}-${Math.random()}`,
      });

      console.log(`   Detected: ${result.intent} (${result.confidence}% confidence)`);

      if (result.alternativeIntents.length > 0) {
        console.log('   Alternatives:');
        result.alternativeIntents.forEach(alt => {
          console.log(`     - ${alt.intent} (${alt.confidence}%)`);
        });
      }

      if (result.intent === test.expectedIntent) {
        console.log('   ✅ PASS');
        passed++;
      } else {
        console.log(`   ❌ FAIL - Expected ${test.expectedIntent}, got ${result.intent}`);
        failed++;
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${testMessages.length} tests`);
  console.log(`   Success Rate: ${Math.round((passed / testMessages.length) * 100)}%\n`);
}

async function testConversationState() {
  console.log('\n🔄 Testing Conversation State Management\n');
  console.log('='.repeat(80));

  const testPhone = '+9779800000001';

  try {
    // Test 1: Create conversation
    console.log('\n1️⃣ Creating conversation...');
    const result1 = await intentDetectionService.detectIntent({
      phoneNumber: testPhone,
      messageText: 'Hello',
      messageId: 'test-conv-1',
    });
    console.log(`   ✅ Conversation created: ${result1.conversationId}`);

    // Test 2: Get conversation
    console.log('\n2️⃣ Getting conversation...');
    const conversation = await intentDetectionService.getConversation(testPhone);
    console.log(`   ✅ Conversation retrieved`);
    console.log(`   Message count: ${conversation.message_count}`);
    console.log(`   Current intent: ${conversation.current_intent}`);

    // Test 3: Update context
    console.log('\n3️⃣ Updating context...');
    await intentDetectionService.updateContext(testPhone, {
      lastProduct: 'RICE-1KG',
      preferredVendor: 'vendor-123',
    });
    console.log('   ✅ Context updated');

    // Test 4: Set pending action
    console.log('\n4️⃣ Setting pending action...');
    await intentDetectionService.setPendingAction(testPhone, 'confirm_order', {
      items: [{ sku: 'RICE-1KG', quantity: 10 }],
    });
    console.log('   ✅ Pending action set');

    // Test 5: Get updated conversation
    console.log('\n5️⃣ Getting updated conversation...');
    const updatedConv = await intentDetectionService.getConversation(testPhone);
    console.log(`   ✅ Conversation retrieved`);
    console.log(`   Pending action: ${updatedConv.pending_action}`);
    console.log(`   Context:`, updatedConv.context);

    // Test 6: Clear pending action
    console.log('\n6️⃣ Clearing pending action...');
    await intentDetectionService.clearPendingAction(testPhone);
    console.log('   ✅ Pending action cleared');

    // Test 7: Increment metrics
    console.log('\n7️⃣ Incrementing metrics...');
    await intentDetectionService.incrementMetric(testPhone, 'successful_orders');
    await intentDetectionService.incrementMetric(testPhone, 'help_requests');
    console.log('   ✅ Metrics incremented');

    // Test 8: Get final conversation state
    console.log('\n8️⃣ Getting final conversation state...');
    const finalConv = await intentDetectionService.getConversation(testPhone);
    console.log(`   ✅ Final state:`);
    console.log(`   Message count: ${finalConv.message_count}`);
    console.log(`   Successful orders: ${finalConv.successful_orders}`);
    console.log(`   Help requests: ${finalConv.help_requests}`);

    console.log('\n✅ All conversation state tests passed!');
  } catch (error) {
    console.log(`\n❌ Conversation state test failed: ${error.message}`);
    console.error(error.stack);
  }
}

async function testStatistics() {
  console.log('\n📊 Testing Statistics\n');
  console.log('='.repeat(80));

  try {
    // Test 1: Get intent statistics
    console.log('\n1️⃣ Getting intent statistics (last 7 days)...');
    const stats = await intentDetectionService.getIntentStatistics(7);
    console.log(`   ✅ Statistics retrieved: ${stats.length} intent types`);
    
    if (stats.length > 0) {
      console.log('\n   Intent Statistics:');
      stats.forEach(stat => {
        console.log(`   - ${stat.detected_intent}:`);
        console.log(`     Total: ${stat.total_count}`);
        console.log(`     Avg Confidence: ${stat.avg_confidence}%`);
        console.log(`     Unique Users: ${stat.unique_users}`);
      });
    }

    // Test 2: Get active conversations
    console.log('\n2️⃣ Getting active conversations (last 24 hours)...');
    const activeConvs = await intentDetectionService.getActiveConversations(24);
    console.log(`   ✅ Active conversations: ${activeConvs.length}`);

    if (activeConvs.length > 0) {
      console.log('\n   Recent Conversations:');
      activeConvs.slice(0, 5).forEach(conv => {
        console.log(`   - ${conv.phone_number}:`);
        console.log(`     Business: ${conv.business_name || 'N/A'}`);
        console.log(`     Messages: ${conv.message_count}`);
        console.log(`     Last message: ${conv.hours_since_last_message.toFixed(1)} hours ago`);
      });
    }

    console.log('\n✅ All statistics tests passed!');
  } catch (error) {
    console.log(`\n❌ Statistics test failed: ${error.message}`);
    console.error(error.stack);
  }
}

async function testMessageGeneration() {
  console.log('\n💬 Testing Message Generation\n');
  console.log('='.repeat(80));

  try {
    // Test 1: Help message
    console.log('\n1️⃣ Generating help message...');
    const helpMsg = intentDetectionService.generateHelpMessage();
    console.log('   ✅ Help message generated:');
    console.log('   ' + helpMsg.split('\n').join('\n   '));

    // Test 2: Greeting (new user)
    console.log('\n2️⃣ Generating greeting for new user...');
    const greetingNew = intentDetectionService.generateGreetingResponse(false);
    console.log('   ✅ Greeting generated:');
    console.log('   ' + greetingNew.split('\n').join('\n   '));

    // Test 3: Greeting (returning user)
    console.log('\n3️⃣ Generating greeting for returning user...');
    const greetingReturning = intentDetectionService.generateGreetingResponse(true);
    console.log('   ✅ Greeting generated:');
    console.log('   ' + greetingReturning.split('\n').join('\n   '));

    console.log('\n✅ All message generation tests passed!');
  } catch (error) {
    console.log(`\n❌ Message generation test failed: ${error.message}`);
    console.error(error.stack);
  }
}

async function main() {
  try {
    // Run all tests
    await runTests();
    await testConversationState();
    await testStatistics();
    await testMessageGeneration();

    console.log('\n' + '='.repeat(80));
    console.log('✅ All tests completed!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
main();
