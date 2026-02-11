require('dotenv').config();
const twilioService = require('./src/services/twilio.service');
const logger = require('./src/utils/logger');

/**
 * Test script for Twilio WhatsApp integration
 * Run: node test-twilio-whatsapp.js
 */

async function testTwilioConfiguration() {
    console.log('\n🔍 Testing Twilio WhatsApp Configuration...\n');

    // Step 1: Check environment variables
    console.log('📋 Step 1: Checking Environment Variables');
    console.log('─'.repeat(50));

    const requiredVars = {
        'TWILIO_ACCOUNT_SID': process.env.TWILIO_ACCOUNT_SID,
        'TWILIO_AUTH_TOKEN': process.env.TWILIO_AUTH_TOKEN,
        'TWILIO_WHATSAPP_NUMBER': process.env.TWILIO_WHATSAPP_NUMBER,
    };

    let allVarsPresent = true;

    for (const [key, value] of Object.entries(requiredVars)) {
        if (!value) {
            console.log(`❌ ${key}: NOT SET`);
            allVarsPresent = false;
        } else {
            // Mask sensitive values
            const displayValue = key === 'TWILIO_AUTH_TOKEN'
                ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
                : value;
            console.log(`✅ ${key}: ${displayValue}`);
        }
    }

    if (!allVarsPresent) {
        console.log('\n❌ Missing required environment variables!');
        console.log('Please set all required variables in your .env file.\n');
        process.exit(1);
    }

    // Step 2: Check number format
    console.log('\n📋 Step 2: Validating Number Format');
    console.log('─'.repeat(50));

    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    const hasPrefix = whatsappNumber.startsWith('whatsapp:');
    const numberOnly = whatsappNumber.replace(/^whatsapp:/, '');
    const hasPlus = numberOnly.startsWith('+');

    console.log(`Original value: ${whatsappNumber}`);
    console.log(`Has 'whatsapp:' prefix: ${hasPrefix ? '✅ Yes' : '⚠️  No (will be added automatically)'}`);
    console.log(`Number part: ${numberOnly}`);
    console.log(`Has '+' prefix: ${hasPlus ? '✅ Yes' : '❌ No (REQUIRED!)'}`);

    if (!hasPlus) {
        console.log('\n❌ Invalid number format!');
        console.log('TWILIO_WHATSAPP_NUMBER must include country code with + prefix');
        console.log('Example: +14155238886 or whatsapp:+14155238886\n');
        process.exit(1);
    }

    // Step 3: Test sending a message
    console.log('\n📋 Step 3: Testing Message Send');
    console.log('─'.repeat(50));

    // Use a test number - you should replace this with a real number that has joined your sandbox
    const testRecipient = process.env.TEST_PHONE_NUMBER || '+9779822403262';

    console.log(`Test recipient: ${testRecipient}`);
    console.log(`\n⚠️  NOTE: Make sure ${testRecipient} has joined your WhatsApp Sandbox!`);
    console.log('If using sandbox, send the join code first.\n');

    const testMessage = `🧪 Test Message from Khaacho\n\nThis is an automated test message sent at ${new Date().toLocaleString()}.\n\nIf you receive this, the Twilio integration is working correctly! ✅`;

    try {
        console.log('Sending test message...');

        const result = await twilioService.sendWhatsAppMessage(
            testRecipient,
            testMessage
        );

        console.log('\n✅ SUCCESS! Message sent successfully!');
        console.log('─'.repeat(50));
        console.log(`Message SID: ${result.messageSid}`);
        console.log(`Status: ${result.status}`);
        console.log('\nCheck your WhatsApp to confirm receipt.');
        console.log('Also check Twilio Console → Monitor → Logs → Messaging for delivery status.');

    } catch (error) {
        console.log('\n❌ FAILED to send message!');
        console.log('─'.repeat(50));
        console.log(`Error: ${error.message}`);

        if (error.message.includes('63007')) {
            console.log('\n🔍 Error 63007 Troubleshooting:');
            console.log('1. Verify your TWILIO_WHATSAPP_NUMBER matches the number in Twilio Console');
            console.log('2. If using Sandbox: Make sure it\'s active and you\'ve joined it');
            console.log('3. If using Production: Ensure your WhatsApp sender is approved');
            console.log('4. Check Twilio Console → Messaging → Senders → WhatsApp senders');
        } else if (error.message.includes('21608')) {
            console.log('\n🔍 Error 21608 Troubleshooting:');
            console.log(`1. The recipient (${testRecipient}) hasn't joined your WhatsApp Sandbox`);
            console.log('2. Have them send the join code to your sandbox number');
            console.log('3. Or use a different test number that has already joined');
        }

        console.log('\n📚 Full error details:');
        console.log(error);

        process.exit(1);
    }

    console.log('\n✨ All tests passed! Twilio WhatsApp integration is working correctly.\n');
}

// Run the test
testTwilioConfiguration().catch(error => {
    console.error('\n💥 Unexpected error:', error);
    process.exit(1);
});
