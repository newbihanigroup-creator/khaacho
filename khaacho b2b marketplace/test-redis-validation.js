/**
 * Test Redis URL Validation
 * 
 * Run this to test the validation logic without starting the full server
 * Usage: node test-redis-validation.js
 */

const { validateRedisURL } = require('./src/config/validateEnv');

console.log('Testing Redis URL Validation\n');
console.log('='.repeat(70));

const testCases = [
  // Valid URLs
  { url: 'redis://localhost:6379', expected: true, description: 'Basic localhost' },
  { url: 'redis://default:password@host:6379', expected: true, description: 'With username and password' },
  { url: 'redis://:password@host:6379', expected: true, description: 'With password only' },
  { url: 'redis://host:6379/0', expected: true, description: 'With database selection' },
  { url: 'rediss://host:6379', expected: true, description: 'TLS connection' },
  { url: 'redis://host:6379?family=4', expected: true, description: 'With query parameters' },
  { url: 'redis://red-xxxxxxxxxxxxx:6379', expected: true, description: 'Render format' },
  { url: 'redis://10.0.0.1:6379', expected: true, description: 'IP address' },
  { url: 'redis://user:p%40ss@host:6379', expected: true, description: 'URL-encoded password' },
  
  // Invalid URLs
  { url: '', expected: false, description: 'Empty string' },
  { url: 'http://localhost:6379', expected: false, description: 'Wrong protocol (http)' },
  { url: 'tcp://localhost:6379', expected: false, description: 'Wrong protocol (tcp)' },
  { url: 'redis://', expected: false, description: 'Incomplete URL (no host)' },
  { url: 'redis://localhost', expected: true, description: 'Without port (defaults to 6379)' },
  { url: 'redis://localhost: 6379', expected: false, description: 'Space in URL' },
  { url: 'redis:// localhost:6379', expected: false, description: 'Space after protocol' },
  { url: null, expected: false, description: 'Null value' },
  { url: undefined, expected: false, description: 'Undefined value' },
  { url: 'localhost:6379', expected: false, description: 'Missing protocol' },
];

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  const result = validateRedisURL(testCase.url);
  const success = result.valid === testCase.expected;
  
  const status = success ? '✅ PASS' : '❌ FAIL';
  const icon = testCase.expected ? '✓' : '✗';
  
  console.log(`\n${index + 1}. ${status} - ${testCase.description}`);
  console.log(`   Input: ${testCase.url === null ? 'null' : testCase.url === undefined ? 'undefined' : `"${testCase.url}"`}`);
  console.log(`   Expected: ${testCase.expected ? 'Valid' : 'Invalid'}`);
  console.log(`   Got: ${result.valid ? 'Valid' : 'Invalid'}`);
  
  if (!result.valid && result.error) {
    console.log(`   Error: ${result.error}`);
  }
  
  if (result.warning) {
    console.log(`   Warning: ${result.warning}`);
  }
  
  if (success) {
    passed++;
  } else {
    failed++;
  }
});

console.log('\n' + '='.repeat(70));
console.log(`\nTest Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

if (failed === 0) {
  console.log('✅ All tests passed!\n');
  process.exit(0);
} else {
  console.log('❌ Some tests failed!\n');
  process.exit(1);
}
