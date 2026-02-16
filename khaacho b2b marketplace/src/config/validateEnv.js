/**
 * Startup Environment Validation
 * Validates required environment variables before server starts
 * 
 * Production-safe: Exits with code 1 if validation fails
 * Development-friendly: Warns but continues for optional services
 * 
 * Schema-based validation with clear error messages
 */

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Environment variable schema
 * Defines validation rules for all environment variables
 */
const ENV_SCHEMA = {
  // Critical - Always required
  DATABASE_URL: {
    required: true,
    type: 'string',
    pattern: /^postgresql:\/\/.+/,
    description: 'PostgreSQL connection string',
    example: 'postgresql://user:password@host:5432/database',
    errorMessage: 'Must be a valid PostgreSQL connection string starting with postgresql://',
  },

  JWT_SECRET: {
    required: true,
    type: 'string',
    minLength: 32,
    description: 'JWT secret key',
    example: 'your-super-secret-jwt-key-min-32-characters',
    errorMessage: 'Must be at least 32 characters long for security',
  },

  // Redis - Required in production, optional in development
  REDIS_URL: {
    required: false,
    requiredInProduction: true,
    type: 'string',
    customValidator: 'validateRedisURL',
    description: 'Redis connection string',
    example: 'redis://localhost:6379 or redis://user:pass@host:6379',
    errorMessage: 'Must be a valid Redis URL (redis:// or rediss://)',
  },

  // Optional services
  TWILIO_ACCOUNT_SID: {
    required: false,
    type: 'string',
    pattern: /^AC[a-z0-9]{32}$/i,
    description: 'Twilio Account SID',
    example: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },

  TWILIO_AUTH_TOKEN: {
    required: false,
    type: 'string',
    minLength: 32,
    description: 'Twilio Auth Token',
    example: 'your_twilio_auth_token',
  },

  OPENAI_API_KEY: {
    required: false,
    type: 'string',
    pattern: /^sk-[a-zA-Z0-9-_]{20,}$/,
    description: 'OpenAI API Key',
    example: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },

  GOOGLE_APPLICATION_CREDENTIALS: {
    required: false,
    type: 'string',
    description: 'Google Cloud credentials file path',
    example: './path/to/service-account-key.json',
  },

  // Server configuration
  NODE_ENV: {
    required: false,
    type: 'string',
    allowedValues: ['development', 'production', 'test'],
    default: 'development',
    description: 'Application environment',
  },

  PORT: {
    required: false,
    type: 'number',
    default: 3000,
    description: 'Server port',
  },
};

/**
 * Validate Redis URL format
 * Supports multiple Redis URL formats:
 * - redis://localhost:6379
 * - redis://username:password@host:6379
 * - redis://:password@host:6379/0
 * - rediss://host:6379 (TLS)
 * - redis://host:6379?family=4
 * 
 * @param {string} url - Redis URL to validate
 * @returns {Object} Validation result with detailed error info
 */
function validateRedisURL(url) {
  if (!url || typeof url !== 'string') {
    return {
      valid: false,
      error: 'REDIS_URL is empty or not a string',
    };
  }

  // Trim whitespace
  url = url.trim();

  // Check for valid Redis protocol
  const protocolMatch = url.match(/^(redis|rediss):\/\//);
  if (!protocolMatch) {
    return {
      valid: false,
      error: 'Invalid REDIS_URL format',
      details: 'Must start with redis:// or rediss://',
      received: url.substring(0, 30) + (url.length > 30 ? '...' : ''),
      expected: 'redis://host:port or rediss://host:port',
    };
  }

  // Extract components after protocol
  const afterProtocol = url.substring(protocolMatch[0].length);
  
  // Check if there's content after protocol
  if (!afterProtocol || afterProtocol.length === 0) {
    return {
      valid: false,
      error: 'Incomplete REDIS_URL',
      details: 'Missing host and port after protocol',
      example: 'redis://localhost:6379',
    };
  }

  // Validate basic structure
  // Formats: host:port, username:password@host:port, :password@host:port, host
  const validStructure = /^([^@]+@)?[^:@\/\s]+(:\d+)?(\/\d+)?(\?.*)?$/;
  if (!validStructure.test(afterProtocol)) {
    return {
      valid: false,
      error: 'Invalid REDIS_URL structure',
      details: 'URL format is malformed',
      expected: 'redis://[username:password@]host[:port][/db][?options]',
    };
  }

  // Check for common mistakes
  if (url.includes(' ')) {
    return {
      valid: false,
      error: 'Invalid REDIS_URL',
      details: 'URL contains spaces',
    };
  }

  // Warn about localhost in production
  if (url.includes('//localhost') && isProduction) {
    return {
      valid: true,
      warning: 'Using localhost in production - ensure Redis is on same host',
    };
  }

  return { valid: true };
}

/**
 * Validate a single environment variable against schema
 * 
 * @param {string} key - Environment variable name
 * @param {Object} schema - Validation schema
 * @returns {Object} Validation result
 */
function validateVariable(key, schema) {
  const value = process.env[key];
  const isRequired = schema.required || (isProduction && schema.requiredInProduction);
  
  // Check if variable exists
  if (!value) {
    // Use default if provided
    if (schema.default !== undefined) {
      process.env[key] = String(schema.default);
      return {
        valid: true,
        name: key,
        description: schema.description,
        usedDefault: true,
        defaultValue: schema.default,
      };
    }

    return {
      valid: !isRequired,
      missing: isRequired,
      name: key,
      description: schema.description,
      optional: !isRequired,
      severity: isRequired ? 'error' : 'warning',
      example: schema.example,
    };
  }
  
  // Custom validator
  if (schema.customValidator) {
    const validator = schema.customValidator === 'validateRedisURL' 
      ? validateRedisURL 
      : null;
    
    if (validator) {
      const customResult = validator(value);
      
      if (!customResult.valid) {
        return {
          valid: false,
          invalid: true,
          name: key,
          description: schema.description,
          error: customResult.error,
          details: customResult.details,
          example: schema.example,
          received: customResult.received,
          expected: customResult.expected,
          severity: 'error',
        };
      }
      
      if (customResult.warning) {
        return {
          valid: true,
          name: key,
          description: schema.description,
          warning: customResult.warning,
          severity: 'warning',
        };
      }
    }
  }
  
  // Type validation
  if (schema.type === 'number') {
    if (isNaN(Number(value))) {
      return {
        valid: false,
        invalid: true,
        name: key,
        description: schema.description,
        error: 'Invalid type',
        details: `Expected number, got: ${typeof value}`,
        severity: 'error',
      };
    }
  }
  
  // Pattern validation
  if (schema.pattern && !schema.pattern.test(value)) {
    return {
      valid: false,
      invalid: true,
      name: key,
      description: schema.description,
      error: schema.errorMessage || 'Invalid format',
      example: schema.example,
      severity: 'error',
    };
  }
  
  // Allowed values validation
  if (schema.allowedValues && !schema.allowedValues.includes(value)) {
    return {
      valid: false,
      invalid: true,
      name: key,
      description: schema.description,
      error: 'Invalid value',
      details: `Must be one of: ${schema.allowedValues.join(', ')}`,
      received: value,
      severity: 'error',
    };
  }
  
  // Length validation
  if (schema.minLength && value.length < schema.minLength) {
    return {
      valid: false,
      invalid: true,
      name: key,
      description: schema.description,
      error: schema.errorMessage || `Must be at least ${schema.minLength} characters`,
      severity: 'error',
    };
  }
  
  return {
    valid: true,
    name: key,
    description: schema.description,
  };
}

/**
 * Validate all environment variables against schema
 * 
 * @returns {Object} Validation results
 */
function validateEnvironment() {
  const envName = isProduction ? 'PRODUCTION' : 'DEVELOPMENT';
  
  console.log('\n' + '='.repeat(70));
  console.log(`STARTUP ENVIRONMENT VALIDATION (${envName})`);
  console.log('='.repeat(70) + '\n');
  
  const results = {
    valid: [],
    missing: [],
    invalid: [],
    warnings: [],
    defaults: [],
  };
  
  // Validate each variable in schema
  for (const [key, schema] of Object.entries(ENV_SCHEMA)) {
    const result = validateVariable(key, schema);
    
    if (result.valid) {
      results.valid.push(result);
      
      if (result.usedDefault) {
        results.defaults.push(result);
      }
      
      if (result.warning) {
        results.warnings.push({
          name: result.name,
          message: result.warning,
        });
      }
    } else if (result.missing) {
      if (result.severity === 'error') {
        results.missing.push(result);
      } else {
        results.warnings.push({
          name: result.name,
          message: `${result.description} not configured (optional in ${envName.toLowerCase()})`,
          example: result.example,
        });
      }
    } else if (result.invalid) {
      results.invalid.push(result);
    }
  }
  
  // Display results
  displayResults(results);
  
  // Check if validation passed (only errors block startup)
  const hasErrors = results.missing.length > 0 || results.invalid.length > 0;
  
  return {
    success: !hasErrors,
    results,
  };
}

/**
 * Display validation results with clear formatting
 * 
 * @param {Object} results - Validation results
 */
function displayResults(results) {
  // Display valid variables
  if (results.valid.length > 0) {
    console.log('✅ Configured and Valid:');
    for (const item of results.valid) {
      console.log(`   ✅ ${item.name}`);
    }
    console.log();
  }

  // Display defaults used
  if (results.defaults && results.defaults.length > 0) {
    console.log('ℹ️  Using Default Values:');
    for (const item of results.defaults) {
      console.log(`   ℹ️  ${item.name} = ${item.defaultValue}`);
    }
    console.log();
  }
  
  // Display warnings (non-blocking)
  if (results.warnings.length > 0) {
    console.log('⚠️  Warnings (non-blocking):');
    for (const item of results.warnings) {
      console.log(`   ⚠️  ${item.name}: ${item.message}`);
      if (item.example) {
        console.log(`      Example: ${item.example}`);
      }
    }
    console.log();
  }
  
  // Display missing required variables (blocking)
  if (results.missing.length > 0) {
    console.log('❌ Missing Required Variables:');
    for (const item of results.missing) {
      console.log(`   ❌ ${item.name} - ${item.description}`);
      if (item.example) {
        console.log(`      Example: ${item.example}`);
      }
    }
    console.log();
  }
  
  // Display invalid variables (blocking)
  if (results.invalid.length > 0) {
    console.log('❌ Invalid Variables:');
    for (const item of results.invalid) {
      console.log(`   ❌ ${item.name} - ${item.error}`);
      if (item.details) {
        console.log(`      Details: ${item.details}`);
      }
      if (item.received) {
        console.log(`      Received: ${item.received}`);
      }
      if (item.expected) {
        console.log(`      Expected: ${item.expected}`);
      }
      if (item.example) {
        console.log(`      Example: ${item.example}`);
      }
    }
    console.log();
  }
}

/**
 * Run validation and exit if failed
 * Call this before starting the Express server
 * 
 * Behavior:
 * - Development: Warns about missing optional services, continues startup
 * - Production: Fails if required services (like Redis) are missing/invalid
 * - Only DATABASE_URL failure causes immediate exit
 * - Redis failures are logged but don't crash the server
 */
function validateOrExit() {
  const { success, results } = validateEnvironment();
  
  if (!success) {
    console.log('='.repeat(70));
    console.log('❌ STARTUP VALIDATION FAILED');
    console.log('='.repeat(70));
    console.log('\n🔍 Diagnostic Information:');
    console.log(`   Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`   Node Version: ${process.version}`);
    console.log(`   Platform: ${process.platform}`);
    console.log('\n📋 Action Required:');
    console.log('   1. Check your .env file or environment variables');
    console.log('   2. Compare with .env.example for reference');
    console.log('   3. Ensure all required variables are set correctly');
    
    // Check if DATABASE_URL is missing (critical)
    const dbMissing = results.results.missing.some(item => item.name === 'DATABASE_URL');
    const dbInvalid = results.results.invalid.some(item => item.name === 'DATABASE_URL');
    
    if (dbMissing || dbInvalid) {
      console.log('\n🚨 CRITICAL: DATABASE_URL is required for server to start');
      console.log('   The application cannot function without a database connection.');
      console.log('   Example: postgresql://user:password@host:5432/database\n');
      process.exit(1);
    }
    
    // Check if Redis is the only issue
    const onlyRedisIssue = results.results.missing.every(item => item.name === 'REDIS_URL') &&
                           results.results.invalid.every(item => item.name === 'REDIS_URL');
    
    if (onlyRedisIssue && isProduction) {
      console.log('\n⚠️  Redis Configuration Issue:');
      console.log('   Redis is required in production for background jobs and caching.');
      console.log('   However, the server will attempt to start without Redis.');
      console.log('   Some features may be disabled.\n');
      console.log('🔧 Common Redis URL Formats:');
      console.log('   redis://localhost:6379');
      console.log('   redis://username:password@host:6379');
      console.log('   redis://:password@host:6379/0');
      console.log('   rediss://host:6379 (TLS)\n');
      console.log('💡 Tip: Fix Redis configuration and restart for full functionality.\n');
      
      // Don't exit - continue without Redis
      console.log('='.repeat(70));
      console.log('⚠️  CONTINUING WITH WARNINGS');
      console.log('='.repeat(70) + '\n');
      return true;
    }
    
    if (results.results.invalid.length > 0) {
      console.log('\n🔧 Common Redis URL Formats:');
      console.log('   redis://localhost:6379');
      console.log('   redis://username:password@host:6379');
      console.log('   redis://:password@host:6379/0');
      console.log('   rediss://host:6379 (TLS)');
    }
    
    console.log('\n💡 Tip: In development, Redis is optional. Set NODE_ENV=development');
    console.log('    In production, Redis is recommended for job queues and caching.\n');
    
    // Exit with code 1 for critical failures
    process.exit(1);
  }
  
  console.log('='.repeat(70));
  console.log('✅ STARTUP VALIDATION PASSED');
  console.log('='.repeat(70));
  
  // Log summary
  const { valid, warnings, defaults } = results.results;
  const defaultCount = defaults ? defaults.length : 0;
  console.log(`\n📊 Summary: ${valid.length} configured, ${warnings.length} warnings, ${defaultCount} defaults\n`);
  
  return true;
}

module.exports = {
  validateEnvironment,
  validateOrExit,
  validateRedisURL, // Export for testing
  ENV_SCHEMA, // Export schema for reference
};
