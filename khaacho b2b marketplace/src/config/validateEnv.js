/**
 * Startup Environment Validation
 * Validates required environment variables before server starts
 * 
 * Production-safe: Exits with code 1 if validation fails
 * Development-friendly: Warns but continues for optional services
 */

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Validate Redis URL format
 * Supports multiple Redis URL formats:
 * - redis://localhost:6379
 * - redis://default:password@host:6379
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
      error: 'REDIS_URL must start with redis:// or rediss://',
      received: url.substring(0, 20) + '...',
    };
  }

  // Extract components after protocol
  const afterProtocol = url.substring(protocolMatch[0].length);
  
  // Check if there's content after protocol
  if (!afterProtocol || afterProtocol.length === 0) {
    return {
      valid: false,
      error: 'REDIS_URL is incomplete - missing host and port',
      example: 'redis://localhost:6379',
    };
  }

  // Validate basic structure (must have host, optionally port)
  // Formats: host:port, user:pass@host:port, :pass@host:port, host
  const validStructure = /^([^@]+@)?[^:@\/\s]+(:\d+)?(\/\d+)?(\?.*)?$/;
  if (!validStructure.test(afterProtocol)) {
    return {
      valid: false,
      error: 'REDIS_URL has invalid structure',
      example: 'redis://localhost:6379 or redis://user:pass@host:6379',
    };
  }

  // Additional validation: check for common mistakes
  if (url.includes(' ')) {
    return {
      valid: false,
      error: 'REDIS_URL contains spaces',
    };
  }

  if (url.includes('//localhost') && isProduction) {
    return {
      valid: true,
      warning: 'Using localhost in production - ensure Redis is on same host',
    };
  }

  return { valid: true };
}

/**
 * Required environment variables configuration
 */
const REQUIRED_VARS = [
  {
    name: 'DATABASE_URL',
    description: 'PostgreSQL connection string',
    pattern: /^postgresql:\/\/.+/,
    example: 'postgresql://user:password@host:5432/database',
    required: true,
  },
  {
    name: 'REDIS_URL',
    description: 'Redis connection string',
    customValidator: validateRedisURL,
    example: 'redis://localhost:6379 or redis://user:pass@host:6379',
    required: false,
    requiredInProduction: true,
  },
  {
    name: 'TWILIO_ACCOUNT_SID',
    description: 'Twilio Account SID',
    pattern: /^AC[a-z0-9]{32}$/i,
    example: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    required: false,
  },
  {
    name: 'TWILIO_AUTH_TOKEN',
    description: 'Twilio Auth Token',
    minLength: 32,
    example: 'your_twilio_auth_token',
    required: false,
  },
  {
    name: 'OPENAI_API_KEY',
    description: 'OpenAI API Key',
    pattern: /^sk-[a-zA-Z0-9-_]{20,}$/,
    example: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    required: false,
  },
  {
    name: 'GOOGLE_APPLICATION_CREDENTIALS',
    description: 'Google Cloud credentials file path',
    example: './path/to/service-account-key.json',
    required: false,
  },
];

/**
 * Validate a single environment variable
 * 
 * @param {Object} config - Variable configuration
 * @returns {Object} Validation result
 */
function validateVariable(config) {
  const value = process.env[config.name];
  const isRequired = config.required || (isProduction && config.requiredInProduction);
  
  // Check if variable exists
  if (!value) {
    return {
      valid: !isRequired,
      missing: isRequired,
      name: config.name,
      description: config.description,
      optional: !isRequired,
      severity: isRequired ? 'error' : 'warning',
    };
  }
  
  // Use custom validator if provided
  if (config.customValidator) {
    const customResult = config.customValidator(value);
    
    if (!customResult.valid) {
      return {
        valid: false,
        invalid: true,
        name: config.name,
        description: config.description,
        error: customResult.error,
        example: config.example,
        received: customResult.received,
        severity: 'error',
      };
    }
    
    // Check for warnings from custom validator
    if (customResult.warning) {
      return {
        valid: true,
        name: config.name,
        description: config.description,
        warning: customResult.warning,
        severity: 'warning',
      };
    }
  }
  
  // Validate pattern if specified
  if (config.pattern && !config.pattern.test(value)) {
    return {
      valid: false,
      invalid: true,
      name: config.name,
      description: config.description,
      error: 'Invalid format',
      example: config.example,
      severity: 'error',
    };
  }
  
  // Validate minimum length if specified
  if (config.minLength && value.length < config.minLength) {
    return {
      valid: false,
      invalid: true,
      name: config.name,
      description: config.description,
      error: `Must be at least ${config.minLength} characters`,
      severity: 'error',
    };
  }
  
  return {
    valid: true,
    name: config.name,
    description: config.description,
  };
}

/**
 * Validate all required environment variables
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
  };
  
  // Validate each variable
  for (const config of REQUIRED_VARS) {
    const result = validateVariable(config);
    
    if (result.valid) {
      results.valid.push(result);
      
      // Collect warnings from valid results
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
  
  // Display warnings (non-blocking)
  if (results.warnings.length > 0) {
    console.log('⚠️  Warnings (non-blocking):');
    for (const item of results.warnings) {
      console.log(`   ⚠️  ${item.name}: ${item.message}`);
    }
    console.log();
  }
  
  // Display missing required variables (blocking)
  if (results.missing.length > 0) {
    console.log('❌ Missing Required Variables:');
    for (const item of results.missing) {
      console.log(`   ❌ ${item.name} - ${item.description}`);
    }
    console.log();
  }
  
  // Display invalid variables (blocking)
  if (results.invalid.length > 0) {
    console.log('❌ Invalid Variables:');
    for (const item of results.invalid) {
      console.log(`   ❌ ${item.name} - ${item.error}`);
      if (item.received) {
        console.log(`      Received: ${item.received}`);
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
    
    if (results.results.invalid.length > 0) {
      console.log('\n🔧 Common Redis URL Formats:');
      console.log('   redis://localhost:6379');
      console.log('   redis://default:password@host:6379');
      console.log('   redis://:password@host:6379/0');
      console.log('   rediss://host:6379 (TLS)');
    }
    
    console.log('\n💡 Tip: In development, Redis is optional. Set NODE_ENV=development');
    console.log('    In production, Redis is required for job queues and caching.\n');
    
    // Exit with code 1 to prevent Render crash loops
    process.exit(1);
  }
  
  console.log('='.repeat(70));
  console.log('✅ STARTUP VALIDATION PASSED');
  console.log('='.repeat(70));
  
  // Log summary
  const { valid, warnings } = results.results;
  console.log(`\n📊 Summary: ${valid.length} configured, ${warnings.length} warnings\n`);
  
  return true;
}

module.exports = {
  validateEnvironment,
  validateOrExit,
  validateRedisURL, // Export for testing
};
