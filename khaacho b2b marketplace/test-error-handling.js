/**
 * Error Handling System Test
 * Tests the centralized error handling middleware
 */

const express = require('express');
const { errorHandler, notFoundHandler, asyncHandler } = require('./src/api/middleware/errorHandler');
const { 
  AppError, 
  ValidationError, 
  NotFoundError, 
  UnauthorizedError,
  DatabaseError 
} = require('./src/shared/errors');

const app = express();
app.use(express.json());

// Test routes

// 1. Test AppError (operational error)
app.get('/test/app-error', asyncHandler(async (req, res) => {
  throw new ValidationError('Email is required', { field: 'email' });
}));

// 2. Test NotFoundError
app.get('/test/not-found', asyncHandler(async (req, res) => {
  throw new NotFoundError('User', '123');
}));

// 3. Test UnauthorizedError
app.get('/test/unauthorized', asyncHandler(async (req, res) => {
  throw new UnauthorizedError('Invalid credentials');
}));

// 4. Test Prisma error simulation
app.get('/test/prisma-error', asyncHandler(async (req, res) => {
  const error = new Error('Unique constraint failed');
  error.code = 'P2002';
  error.meta = { target: ['email'] };
  throw error;
}));

// 5. Test validation error
app.get('/test/validation-error', asyncHandler(async (req, res) => {
  const error = new Error('Validation failed');
  error.name = 'ValidationError';
  error.errors = {
    email: 'Email is required',
    password: 'Password must be at least 8 characters',
  };
  throw error;
}));

// 6. Test JWT error
app.get('/test/jwt-error', asyncHandler(async (req, res) => {
  const error = new Error('jwt malformed');
  error.name = 'JsonWebTokenError';
  throw error;
}));

// 7. Test unexpected error (should not expose stack trace)
app.get('/test/unexpected-error', asyncHandler(async (req, res) => {
  throw new Error('Something went wrong in the code');
}));

// 8. Test async error (should be caught)
app.get('/test/async-error', asyncHandler(async (req, res) => {
  await new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error('Async operation failed')), 100);
  });
}));

// 9. Test successful response
app.get('/test/success', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: { message: 'This route works!' },
  });
}));

// Apply error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Start test server
const PORT = 3001;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('ERROR HANDLING TEST SERVER');
  console.log('='.repeat(60));
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('\nTest endpoints:');
  console.log('1. AppError:         GET http://localhost:3001/test/app-error');
  console.log('2. NotFoundError:    GET http://localhost:3001/test/not-found');
  console.log('3. Unauthorized:     GET http://localhost:3001/test/unauthorized');
  console.log('4. Prisma Error:     GET http://localhost:3001/test/prisma-error');
  console.log('5. Validation Error: GET http://localhost:3001/test/validation-error');
  console.log('6. JWT Error:        GET http://localhost:3001/test/jwt-error');
  console.log('7. Unexpected Error: GET http://localhost:3001/test/unexpected-error');
  console.log('8. Async Error:      GET http://localhost:3001/test/async-error');
  console.log('9. Success:          GET http://localhost:3001/test/success');
  console.log('10. 404 Not Found:   GET http://localhost:3001/invalid-route');
  console.log('\nPress Ctrl+C to stop');
  console.log('='.repeat(60) + '\n');
});

// Automated tests
async function runAutomatedTests() {
  const axios = require('axios');
  const baseURL = `http://localhost:${PORT}`;
  
  console.log('\nRunning automated tests...\n');
  
  const tests = [
    {
      name: 'AppError (ValidationError)',
      url: '/test/app-error',
      expectedStatus: 400,
      expectedCode: 'VALIDATION_ERROR',
    },
    {
      name: 'NotFoundError',
      url: '/test/not-found',
      expectedStatus: 404,
      expectedCode: 'NOT_FOUND',
    },
    {
      name: 'UnauthorizedError',
      url: '/test/unauthorized',
      expectedStatus: 401,
      expectedCode: 'UNAUTHORIZED',
    },
    {
      name: 'Prisma Error (P2002)',
      url: '/test/prisma-error',
      expectedStatus: 409,
      expectedCode: 'DUPLICATE_ENTRY',
    },
    {
      name: 'Validation Error',
      url: '/test/validation-error',
      expectedStatus: 400,
      expectedCode: 'VALIDATION_ERROR',
    },
    {
      name: 'JWT Error',
      url: '/test/jwt-error',
      expectedStatus: 401,
      expectedCode: 'INVALID_TOKEN',
    },
    {
      name: 'Unexpected Error',
      url: '/test/unexpected-error',
      expectedStatus: 500,
      expectedCode: 'INTERNAL_ERROR',
    },
    {
      name: 'Async Error',
      url: '/test/async-error',
      expectedStatus: 500,
      expectedCode: 'INTERNAL_ERROR',
    },
    {
      name: 'Success Response',
      url: '/test/success',
      expectedStatus: 200,
      expectedSuccess: true,
    },
    {
      name: '404 Not Found',
      url: '/invalid-route',
      expectedStatus: 404,
      expectedCode: 'ROUTE_NOT_FOUND',
    },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const response = await axios.get(`${baseURL}${test.url}`, {
        validateStatus: () => true, // Don't throw on any status
      });
      
      const statusMatch = response.status === test.expectedStatus;
      const codeMatch = !test.expectedCode || response.data.error?.code === test.expectedCode;
      const successMatch = test.expectedSuccess === undefined || response.data.success === test.expectedSuccess;
      
      // Check that stack trace is NOT exposed
      const noStackTrace = !response.data.stack && !response.data.error?.stack;
      
      if (statusMatch && codeMatch && successMatch && noStackTrace) {
        console.log(`✅ ${test.name}`);
        console.log(`   Status: ${response.status}, Code: ${response.data.error?.code || 'N/A'}`);
        console.log(`   Message: ${response.data.error?.message || response.data.data?.message}`);
        passed++;
      } else {
        console.log(`❌ ${test.name}`);
        console.log(`   Expected: ${test.expectedStatus} / ${test.expectedCode}`);
        console.log(`   Got: ${response.status} / ${response.data.error?.code}`);
        console.log(`   Stack exposed: ${!noStackTrace}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} - Request failed: ${error.message}`);
      failed++;
    }
    console.log();
  }
  
  console.log('='.repeat(60));
  console.log('TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Passed: ${passed}/${tests.length}`);
  console.log(`Failed: ${failed}/${tests.length}`);
  console.log('='.repeat(60));
  
  process.exit(failed === 0 ? 0 : 1);
}

// Wait 1 second then run tests
setTimeout(runAutomatedTests, 1000);
