/**
 * Environment Validation Test
 * Tests the startup validation module
 */

const { validateEnvironment } = require('./src/config/validateEnv');

console.log('Testing Environment Validation Module\n');

// Test 1: Current environment
console.log('TEST 1: Validating current environment');
console.log('-'.repeat(60));
const result1 = validateEnvironment();
console.log('\nResult:', result1.success ? '✅ PASSED' : '❌ FAILED');
console.log('Valid:', result1.results.valid.length);
console.log('Missing:', result1.results.missing.length);
console.log('Invalid:', result1.results.invalid.length);
console.log('Optional:', result1.results.optional.length);

// Test 2: Missing DATABASE_URL
console.log('\n\nTEST 2: Missing DATABASE_URL (should fail)');
console.log('-'.repeat(60));
const originalDbUrl = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;
const result2 = validateEnvironment();
console.log('\nResult:', result2.success ? '✅ PASSED' : '❌ FAILED (expected)');
process.env.DATABASE_URL = originalDbUrl;

// Test 3: Invalid OPENAI_API_KEY format
console.log('\n\nTEST 3: Invalid OPENAI_API_KEY format (should fail)');
console.log('-'.repeat(60));
const originalOpenAI = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'invalid-key';
const result3 = validateEnvironment();
console.log('\nResult:', result3.success ? '✅ PASSED' : '❌ FAILED (expected)');
if (originalOpenAI) {
  process.env.OPENAI_API_KEY = originalOpenAI;
} else {
  delete process.env.OPENAI_API_KEY;
}

// Test 4: All variables configured
console.log('\n\nTEST 4: All variables configured (should pass)');
console.log('-'.repeat(60));
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.TWILIO_ACCOUNT_SID = 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.TWILIO_AUTH_TOKEN = 'x'.repeat(32);
process.env.OPENAI_API_KEY = 'sk-' + 'x'.repeat(48);
process.env.GOOGLE_APPLICATION_CREDENTIALS = './credentials.json';
const result4 = validateEnvironment();
console.log('\nResult:', result4.success ? '✅ PASSED' : '❌ FAILED');

console.log('\n' + '='.repeat(60));
console.log('TEST SUITE COMPLETE');
console.log('='.repeat(60));
