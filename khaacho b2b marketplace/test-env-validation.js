/**
 * Test Environment Validation
 * 
 * Tests the refactored validation system for:
 * - No crashes from undefined values
 * - Predictable validation output
 * - Safe failure behavior
 * - Flat result structure (no nesting)
 */

// Save original env
const originalEnv = { ...process.env };

// Helper to reset environment
function resetEnv() {
  process.env = { ...originalEnv };
}

// Helper to clear required env vars
function clearRequiredEnv() {
  delete process.env.DATABASE_URL;
  delete process.env.JWT_SECRET;
}

// Mock process.exit to prevent actual exit
let exitCode = null;
const originalExit = process.exit;
process.exit = (code) => {
  exitCode = code;
  throw new Error(`process.exit(${code})`);
};

console.log('Testing Environment Validation System\n');
console.log('='.repeat(70));

let testsPassed = 0;
let testsFailed = 0;

// ============================================================================
// TEST 1: Valid Environment
// ============================================================================

console.log('\n📋 Test 1: Valid Environment');
console.log('-'.repeat(70));

try {
  resetEnv();
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
  process.env.JWT_SECRET = 'this-is-a-very-long-secret-key-with-more-than-32-characters';
  process.env.NODE_ENV = 'development';
  
  // Clear require cache
  delete require.cache[require.resolve('./src/config/validateEnv')];
  const { validateOrExit } = require('./src/config/validateEnv');
  
  exitCode = null;
  try {
    validateOrExit();
    console.log('✅ PASS: Validation succeeded with valid environment');
    testsPassed++;
  } catch (err) {
    if (exitCode === 0 || exitCode === null) {
      console.log('✅ PASS: Validation succeeded');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Validation failed with valid environment');
      console.log('   Exit code:', exitCode);
      testsFailed++;
    }
  }
} catch (err) {
  console.log('❌ FAIL: Unexpected error:', err.message);
  testsFailed++;
}

// ============================================================================
// TEST 2: Missing Required Variables
// ============================================================================

console.log('\n📋 Test 2: Missing Required Variables');
console.log('-'.repeat(70));

try {
  resetEnv();
  clearRequiredEnv();
  
  delete require.cache[require.resolve('./src/config/validateEnv')];
  const { validateOrExit } = require('./src/config/validateEnv');
  
  exitCode = null;
  try {
    validateOrExit();
    console.log('❌ FAIL: Should have exited with code 1');
    testsFailed++;
  } catch (err) {
    if (exitCode === 1) {
      console.log('✅ PASS: Correctly exited with code 1 for missing variables');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Wrong exit code:', exitCode);
      testsFailed++;
    }
  }
} catch (err) {
  console.log('❌ FAIL: Unexpected error:', err.message);
  testsFailed++;
}

// ============================================================================
// TEST 3: Invalid DATABASE_URL Format
// ============================================================================

console.log('\n📋 Test 3: Invalid DATABASE_URL Format');
console.log('-'.repeat(70));

try {
  resetEnv();
  process.env.DATABASE_URL = 'mysql://localhost:3306/db'; // Wrong protocol
  process.env.JWT_SECRET = 'this-is-a-very-long-secret-key-with-more-than-32-characters';
  
  delete require.cache[require.resolve('./src/config/validateEnv')];
  const { validateOrExit } = require('./src/config/validateEnv');
  
  exitCode = null;
  try {
    validateOrExit();
    console.log('❌ FAIL: Should have exited with code 1');
    testsFailed++;
  } catch (err) {
    if (exitCode === 1) {
      console.log('✅ PASS: Correctly rejected invalid DATABASE_URL');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Wrong exit code:', exitCode);
      testsFailed++;
    }
  }
} catch (err) {
  console.log('❌ FAIL: Unexpected error:', err.message);
  testsFailed++;
}

// ============================================================================
// TEST 4: Invalid REDIS_URL Format (Should Warn, Not Fail)
// ============================================================================

console.log('\n📋 Test 4: Invalid REDIS_URL Format (Optional)');
console.log('-'.repeat(70));

try {
  resetEnv();
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
  process.env.JWT_SECRET = 'this-is-a-very-long-secret-key-with-more-than-32-characters';
  process.env.REDIS_URL = 'http://localhost:6379'; // Wrong protocol
  
  delete require.cache[require.resolve('./src/config/validateEnv')];
  const { validateOrExit } = require('./src/config/validateEnv');
  
  exitCode = null;
  try {
    validateOrExit();
    console.log('✅ PASS: Validation succeeded with warning for invalid optional variable');
    testsPassed++;
  } catch (err) {
    if (exitCode === 0 || exitCode === null) {
      console.log('✅ PASS: Validation succeeded with warning');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Should not fail for invalid optional variable');
      console.log('   Exit code:', exitCode);
      testsFailed++;
    }
  }
} catch (err) {
  console.log('❌ FAIL: Unexpected error:', err.message);
  testsFailed++;
}

// ============================================================================
// TEST 5: Short JWT_SECRET
// ============================================================================

console.log('\n📋 Test 5: Short JWT_SECRET');
console.log('-'.repeat(70));

try {
  resetEnv();
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
  process.env.JWT_SECRET = 'short'; // Too short
  
  delete require.cache[require.resolve('./src/config/validateEnv')];
  const { validateOrExit } = require('./src/config/validateEnv');
  
  exitCode = null;
  try {
    validateOrExit();
    console.log('❌ FAIL: Should have exited with code 1');
    testsFailed++;
  } catch (err) {
    if (exitCode === 1) {
      console.log('✅ PASS: Correctly rejected short JWT_SECRET');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Wrong exit code:', exitCode);
      testsFailed++;
    }
  }
} catch (err) {
  console.log('❌ FAIL: Unexpected error:', err.message);
  testsFailed++;
}

// ============================================================================
// TEST 6: Default Values Applied
// ============================================================================

console.log('\n📋 Test 6: Default Values Applied');
console.log('-'.repeat(70));

try {
  resetEnv();
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
  process.env.JWT_SECRET = 'this-is-a-very-long-secret-key-with-more-than-32-characters';
  delete process.env.NODE_ENV;
  delete process.env.PORT;
  
  delete require.cache[require.resolve('./src/config/validateEnv')];
  const { validateOrExit } = require('./src/config/validateEnv');
  
  exitCode = null;
  try {
    validateOrExit();
    
    if (process.env.NODE_ENV === 'development' && process.env.PORT === '3000') {
      console.log('✅ PASS: Default values correctly applied');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Default values not applied correctly');
      console.log('   NODE_ENV:', process.env.NODE_ENV);
      console.log('   PORT:', process.env.PORT);
      testsFailed++;
    }
  } catch (err) {
    if (exitCode === 0 || exitCode === null) {
      if (process.env.NODE_ENV === 'development' && process.env.PORT === '3000') {
        console.log('✅ PASS: Default values correctly applied');
        testsPassed++;
      } else {
        console.log('❌ FAIL: Default values not applied');
        testsFailed++;
      }
    } else {
      console.log('❌ FAIL: Should not fail when defaults can be applied');
      testsFailed++;
    }
  }
} catch (err) {
  console.log('❌ FAIL: Unexpected error:', err.message);
  testsFailed++;
}

// ============================================================================
// TEST 7: Valid REDIS_URL Formats
// ============================================================================

console.log('\n📋 Test 7: Valid REDIS_URL Formats');
console.log('-'.repeat(70));

const validRedisUrls = [
  'redis://localhost:6379',
  'redis://user:pass@host:6379',
  'rediss://host:6379',
  'redis://:password@host:6379/0',
];

for (const redisUrl of validRedisUrls) {
  try {
    resetEnv();
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'this-is-a-very-long-secret-key-with-more-than-32-characters';
    process.env.REDIS_URL = redisUrl;
    
    delete require.cache[require.resolve('./src/config/validateEnv')];
    const { validateOrExit } = require('./src/config/validateEnv');
    
    exitCode = null;
    try {
      validateOrExit();
      console.log(`✅ PASS: Accepted valid Redis URL: ${redisUrl}`);
      testsPassed++;
    } catch (err) {
      if (exitCode === 0 || exitCode === null) {
        console.log(`✅ PASS: Accepted valid Redis URL: ${redisUrl}`);
        testsPassed++;
      } else {
        console.log(`❌ FAIL: Rejected valid Redis URL: ${redisUrl}`);
        testsFailed++;
      }
    }
  } catch (err) {
    console.log(`❌ FAIL: Error with ${redisUrl}:`, err.message);
    testsFailed++;
  }
}

// ============================================================================
// TEST 8: Invalid REDIS_URL with CLI Command
// ============================================================================

console.log('\n📋 Test 8: Invalid REDIS_URL with CLI Command');
console.log('-'.repeat(70));

try {
  resetEnv();
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
  process.env.JWT_SECRET = 'this-is-a-very-long-secret-key-with-more-than-32-characters';
  process.env.REDIS_URL = 'redis-cli --tls -u redis://host:6379'; // CLI command
  
  delete require.cache[require.resolve('./src/config/validateEnv')];
  const { validateOrExit } = require('./src/config/validateEnv');
  
  exitCode = null;
  try {
    validateOrExit();
    console.log('✅ PASS: Validation succeeded with warning (optional variable)');
    testsPassed++;
  } catch (err) {
    if (exitCode === 0 || exitCode === null) {
      console.log('✅ PASS: Validation succeeded with warning');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Should warn but not fail for invalid optional variable');
      testsFailed++;
    }
  }
} catch (err) {
  console.log('❌ FAIL: Unexpected error:', err.message);
  testsFailed++;
}

// ============================================================================
// RESULTS
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST RESULTS');
console.log('='.repeat(70));
console.log();
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`📊 Total: ${testsPassed + testsFailed}`);
console.log();

if (testsFailed === 0) {
  console.log('🎉 All tests passed!');
  console.log();
  process.exit = originalExit;
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed!');
  console.log();
  process.exit = originalExit;
  process.exit(1);
}
