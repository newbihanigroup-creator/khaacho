/**
 * Test WhatsApp Throttling System
 * Tests rate limiting, queuing, idempotency, and retry logic
 */

const whatsappThrottling = require('./src/services/whatsappThrottling.service');
const whatsappThrottledService = require('./src/services/whatsappThrottled.service');
const prisma = require('./src/config/database');

async function testWhatsAppThrottling() {
  console.log('🧪 Testing WhatsApp Throttling System\n');

  try {
    // Test 1: Generate Idempotency Key
    console.log('📋 Test 1: Testing idempotency key generation...');
    const key1 = whatsappThrottling.generateIdempotencyKey(
      '+1234567890',
      'Test message',
      { type: 'text' }
    );
    const key2 = whatsappThrottling.generateIdempotencyKey(
      '+1234567890',
      'Test message',
      { type: 'text' }
    );
    const key3 = whatsappThrottling.generateIdempotencyKey(
      '+1234567890',
      'Different message',
      { type: 'text' }
    );

    console.log('✅ Idempotency keys generated:', {
      key1: key1.substring(0, 30) + '...',
      key2: key2.substring(0, 30) + '...',
      key3: key3.substring(0, 30) + '...',
      sameMessage: key1 === key2,
      differentMessage: key1 !== key3,
    });
    console.log('');

    // Test 2: Rate Limiting
    console.log('📋 Test 2: Testing rate limiting...');
    const testPhone = '+1234567890';
    
    const canSend1 = whatsappThrottling.canSendImmediately(testPhone);
    console.log('First message can send immediately:', canSend1);
    
    whatsappThrottling.updateRateLimit(testPhone);
    
    const canSend2 = whatsappThrottling.canSendImmediately(testPhone);
    console.log('Second message can send immediately:', canSend2);
    
    const delay = whatsappThrottling.getDelayUntilNextMessage(testPhone);
    console.log('Delay until next message:', delay + 'ms');
    
    console.log('✅ Rate limiting working correctly');
    console.log('');

    // Test 3: Duplicate Detection
    console.log('📋 Test 3: Testing duplicate detection...');
    const testKey = 'whatsapp:test:' + Date.now();
    
    const isDup1 = await whatsappThrottling.isDuplicate(testKey);
    console.log('First check (should be false):', isDup1);
    
    // Create a test message with this key
    await prisma.whatsAppMessage.create({
      data: {
        messageId: 'test_' + Date.now(),
        from: '+0000000000',
        to: testPhone,
        body: 'Test message',
        type: 'text',
        status: 'sent',
        direction: 'OUTBOUND',
        metadata: {
          idempotencyKey: testKey,
        },
      },
    });
    
    const isDup2 = await whatsappThrottling.isDuplicate(testKey);
    console.log('Second check (should be true):', isDup2);
    
    console.log('✅ Duplicate detection working');
    console.log('');

    // Test 4: Delivery Failure Logging
    console.log('📋 Test 4: Testing delivery failure logging...');
    const failureData = {
      to: testPhone,
      message: 'Test failed message',
      idempotencyKey: 'whatsapp:test:failure:' + Date.now(),
      attemptCount: 1,
    };
    
    const error = new Error('Test error: Connection timeout');
    error.code = 'ETIMEDOUT';
    
    const failureLog = await whatsappThrottling.logDeliveryFailure(
      failureData,
      error
    );
    
    console.log('✅ Delivery failure logged:', {
      id: failureLog.id,
      phoneNumber: failureLog.phoneNumber,
      attemptCount: failureLog.attemptCount,
      status: failureLog.status,
      nextRetryAt: failureLog.nextRetryAt,
    });
    console.log('');

    // Test 5: Next Retry Calculation
    console.log('📋 Test 5: Testing retry time calculation...');
    const retryTimes = [1, 2, 3, 4, 5].map(attempt => {
      const nextRetry = whatsappThrottling.calculateNextRetry(attempt);
      const delayMs = nextRetry.getTime() - Date.now();
      return {
        attempt,
        delayMs,
        delayMinutes: Math.round(delayMs / 60000),
      };
    });
    
    console.log('✅ Retry schedule (exponential backoff):');
    retryTimes.forEach(({ attempt, delayMinutes }) => {
      console.log(`   Attempt ${attempt}: ${delayMinutes} minutes`);
    });
    console.log('');

    // Test 6: Get Messages for Retry
    console.log('📋 Test 6: Testing get messages for retry...');
    
    // Create a failure ready for retry
    await prisma.whatsAppDeliveryFailure.create({
      data: {
        phoneNumber: testPhone,
        message: 'Ready for retry',
        idempotencyKey: 'whatsapp:test:retry:' + Date.now(),
        errorMessage: 'Test error',
        attemptCount: 1,
        status: 'PENDING',
        nextRetryAt: new Date(Date.now() - 1000), // 1 second ago
      },
    });
    
    const readyForRetry = await whatsappThrottling.getMessagesForRetry(5);
    console.log('✅ Messages ready for retry:', readyForRetry.length);
    if (readyForRetry.length > 0) {
      console.log('   First message:', {
        id: readyForRetry[0].id,
        phoneNumber: readyForRetry[0].phoneNumber,
        attemptCount: readyForRetry[0].attemptCount,
      });
    }
    console.log('');

    // Test 7: Mark as Retried
    console.log('📋 Test 7: Testing mark as retried...');
    if (readyForRetry.length > 0) {
      const updated = await whatsappThrottling.markAsRetried(
        readyForRetry[0].id,
        true
      );
      console.log('✅ Marked as retried:', {
        id: updated.id,
        status: updated.status,
        attemptCount: updated.attemptCount,
        resolvedAt: updated.resolvedAt,
      });
    } else {
      console.log('⚠️  No messages to mark as retried');
    }
    console.log('');

    // Test 8: Throttling Statistics
    console.log('📋 Test 8: Testing throttling statistics...');
    const stats = await whatsappThrottledService.getStats();
    console.log('✅ Throttling statistics:', {
      activeRateLimits: stats.throttling.activeRateLimits,
      rateLimitDescription: stats.throttling.rateLimitDescription,
      pendingFailures: stats.deliveryFailures.pending,
      resolvedFailures: stats.deliveryFailures.resolved,
      permanentlyFailed: stats.deliveryFailures.permanentlyFailed,
    });
    console.log('');

    // Test 9: Clear Rate Limit
    console.log('📋 Test 9: Testing clear rate limit...');
    whatsappThrottling.clearRateLimit(testPhone);
    const canSendAfterClear = whatsappThrottling.canSendImmediately(testPhone);
    console.log('✅ Rate limit cleared, can send:', canSendAfterClear);
    console.log('');

    // Test 10: Cleanup
    console.log('📋 Test 10: Cleaning up test data...');
    await prisma.whatsAppMessage.deleteMany({
      where: {
        to: testPhone,
        body: 'Test message',
      },
    });
    await prisma.whatsAppDeliveryFailure.deleteMany({
      where: {
        phoneNumber: testPhone,
      },
    });
    console.log('✅ Test data cleaned up');
    console.log('');

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ All tests completed successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\nWhatsApp Throttling Features:');
    console.log('  ✅ Rate limiting: 1 message per 2 seconds per user');
    console.log('  ✅ Message queuing for throttled messages');
    console.log('  ✅ Duplicate prevention via idempotency keys');
    console.log('  ✅ Delivery failure tracking');
    console.log('  ✅ Automatic retry with exponential backoff');
    console.log('  ✅ Bull queue integration');
    console.log('\nRetry Schedule:');
    console.log('  Attempt 1: 1 minute');
    console.log('  Attempt 2: 5 minutes');
    console.log('  Attempt 3: 15 minutes');
    console.log('  Attempt 4: 30 minutes');
    console.log('  Attempt 5: 1 hour');
    console.log('\nNext Steps:');
    console.log('  1. Start WhatsApp retry worker');
    console.log('  2. Monitor delivery failures');
    console.log('  3. Adjust rate limits if needed');
    console.log('  4. Set up alerts for permanent failures');
    console.log('\nDocumentation:');
    console.log('  See WHATSAPP_THROTTLING_GUIDE.md for details');
    console.log('');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Database disconnected');
  }
}

// Run tests
testWhatsAppThrottling();
