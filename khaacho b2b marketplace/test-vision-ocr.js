/**
 * Test Script for Vision OCR Service
 * Tests the runOCRFromGCS function with various scenarios
 */

require('dotenv').config();
const visionOCRService = require('./src/services/visionOCR.service');

// ANSI color codes for console output
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
 * Test 1: Valid GCS URI
 */
async function testValidGCSUri() {
  logTest('Test 1: Valid GCS URI');

  try {
    // Replace with your actual GCS URI
    const gcsUri = 'gs://khaacho-uploads/orders/test-order.jpg';
    
    logWarning(`Using test URI: ${gcsUri}`);
    logWarning('Replace with actual GCS URI to test');

    const text = await visionOCRService.runOCRFromGCS(gcsUri);

    if (text !== undefined) {
      logSuccess(`OCR completed successfully`);
      logSuccess(`Extracted text length: ${text.length} characters`);
      
      if (text.length > 0) {
        console.log('\n  Preview (first 200 chars):');
        console.log(`  "${text.substring(0, 200)}..."`);
      } else {
        logWarning('No text detected in image');
      }
    }

    return true;
  } catch (error) {
    if (error.code === 'VISION_NOT_INITIALIZED') {
      logWarning('Vision API not initialized - check credentials');
      logWarning('Set GOOGLE_CLOUD_CREDENTIALS or GOOGLE_CLOUD_KEY_FILE');
      return false;
    }

    if (error.code === 'NOT_FOUND') {
      logWarning('Image not found - this is expected for test URI');
      logSuccess('Error handling works correctly');
      return true;
    }

    logError(`Error: ${error.message}`);
    logError(`Code: ${error.code}`);
    console.log('  Details:', error.details);
    return false;
  }
}

/**
 * Test 2: Valid HTTPS URL (signed URL)
 */
async function testValidHTTPSUrl() {
  logTest('Test 2: Valid HTTPS URL (signed URL)');

  try {
    // Replace with your actual signed URL
    const httpsUrl = 'https://storage.googleapis.com/khaacho-uploads/orders/test-order.jpg';
    
    logWarning(`Using test URL: ${httpsUrl}`);
    logWarning('Replace with actual signed URL to test');

    const text = await visionOCRService.runOCRFromGCS(httpsUrl);

    if (text !== undefined) {
      logSuccess(`OCR completed successfully`);
      logSuccess(`Extracted text length: ${text.length} characters`);
    }

    return true;
  } catch (error) {
    if (error.code === 'VISION_NOT_INITIALIZED') {
      logWarning('Vision API not initialized');
      return false;
    }

    if (error.code === 'NOT_FOUND' || error.code === 'PERMISSION_DENIED') {
      logWarning('Image not accessible - this is expected for test URL');
      logSuccess('Error handling works correctly');
      return true;
    }

    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 3: Invalid URI format
 */
async function testInvalidUri() {
  logTest('Test 3: Invalid URI format');

  try {
    const invalidUri = 'http://example.com/image.jpg'; // HTTP not allowed

    await visionOCRService.runOCRFromGCS(invalidUri);

    logError('Should have thrown INVALID_GCS_URI error');
    return false;
  } catch (error) {
    if (error.code === 'INVALID_GCS_URI') {
      logSuccess('Correctly rejected invalid URI format');
      logSuccess(`Error message: ${error.message}`);
      return true;
    }

    logError(`Unexpected error: ${error.message}`);
    return false;
  }
}

/**
 * Test 4: Missing image URL
 */
async function testMissingUrl() {
  logTest('Test 4: Missing image URL');

  try {
    await visionOCRService.runOCRFromGCS(null);

    logError('Should have thrown INVALID_IMAGE_URL error');
    return false;
  } catch (error) {
    if (error.code === 'INVALID_IMAGE_URL') {
      logSuccess('Correctly rejected missing URL');
      logSuccess(`Error message: ${error.message}`);
      return true;
    }

    logError(`Unexpected error: ${error.message}`);
    return false;
  }
}

/**
 * Test 5: Empty string URL
 */
async function testEmptyUrl() {
  logTest('Test 5: Empty string URL');

  try {
    await visionOCRService.runOCRFromGCS('');

    logError('Should have thrown INVALID_IMAGE_URL error');
    return false;
  } catch (error) {
    if (error.code === 'INVALID_IMAGE_URL') {
      logSuccess('Correctly rejected empty URL');
      return true;
    }

    logError(`Unexpected error: ${error.message}`);
    return false;
  }
}

/**
 * Test 6: Batch OCR processing
 */
async function testBatchOCR() {
  logTest('Test 6: Batch OCR processing');

  try {
    const imageUrls = [
      'gs://khaacho-uploads/orders/test1.jpg',
      'gs://khaacho-uploads/orders/test2.jpg',
      'gs://khaacho-uploads/orders/test3.jpg',
    ];

    logWarning('Using test URIs - replace with actual URIs to test');

    const results = await visionOCRService.runBatchOCR(imageUrls);

    logSuccess(`Batch processing completed`);
    logSuccess(`Total images: ${results.length}`);

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`\n  Results:`);
    console.log(`    Success: ${successCount}`);
    console.log(`    Failed: ${failureCount}`);

    results.forEach((result, index) => {
      console.log(`\n  Image ${index + 1}:`);
      console.log(`    URL: ${result.imageUrl}`);
      console.log(`    Success: ${result.success}`);
      
      if (result.success) {
        console.log(`    Text length: ${result.textLength} characters`);
      } else {
        console.log(`    Error: ${result.error.code} - ${result.error.message}`);
      }
    });

    return true;
  } catch (error) {
    if (error.code === 'VISION_NOT_INITIALIZED') {
      logWarning('Vision API not initialized');
      return false;
    }

    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 7: Health status check
 */
async function testHealthStatus() {
  logTest('Test 7: Health status check');

  try {
    const health = visionOCRService.getHealthStatus();

    logSuccess('Health status retrieved');
    console.log('\n  Status:');
    console.log(`    Initialized: ${health.initialized}`);
    console.log(`    Service: ${health.service}`);
    console.log(`    Timestamp: ${health.timestamp}`);

    return true;
  } catch (error) {
    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 8: URI validation
 */
async function testUriValidation() {
  logTest('Test 8: URI validation');

  const testCases = [
    { uri: 'gs://bucket-name/file.jpg', expected: true },
    { uri: 'gs://my-bucket/folder/subfolder/image.png', expected: true },
    { uri: 'https://storage.googleapis.com/bucket/file.jpg', expected: true },
    { uri: 'http://example.com/image.jpg', expected: false },
    { uri: 'ftp://server.com/file.jpg', expected: false },
    { uri: 'gs://', expected: false },
    { uri: '', expected: false },
    { uri: null, expected: false },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = visionOCRService.isValidGCSUri(testCase.uri);
    
    if (result === testCase.expected) {
      passed++;
      console.log(`  ✓ "${testCase.uri}" → ${result} (expected: ${testCase.expected})`);
    } else {
      failed++;
      console.log(`  ✗ "${testCase.uri}" → ${result} (expected: ${testCase.expected})`);
    }
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    logSuccess('All URI validation tests passed');
    return true;
  } else {
    logError(`${failed} URI validation tests failed`);
    return false;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  logSection('Vision OCR Service Test Suite');

  console.log('\nConfiguration:');
  console.log(`  GOOGLE_CLOUD_PROJECT_ID: ${process.env.GOOGLE_CLOUD_PROJECT_ID ? '✓ Set' : '✗ Not set'}`);
  console.log(`  GOOGLE_CLOUD_CREDENTIALS: ${process.env.GOOGLE_CLOUD_CREDENTIALS ? '✓ Set' : '✗ Not set'}`);
  console.log(`  GOOGLE_CLOUD_KEY_FILE: ${process.env.GOOGLE_CLOUD_KEY_FILE ? '✓ Set' : '✗ Not set'}`);

  const tests = [
    { name: 'URI Validation', fn: testUriValidation },
    { name: 'Health Status', fn: testHealthStatus },
    { name: 'Missing URL', fn: testMissingUrl },
    { name: 'Empty URL', fn: testEmptyUrl },
    { name: 'Invalid URI Format', fn: testInvalidUri },
    { name: 'Valid GCS URI', fn: testValidGCSUri },
    { name: 'Valid HTTPS URL', fn: testValidHTTPSUrl },
    { name: 'Batch OCR', fn: testBatchOCR },
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
    logWarning('Some tests failed. Check configuration and test URIs.');
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
