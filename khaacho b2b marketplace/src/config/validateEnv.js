/**
 * Production-Safe Environment Validation
 * 
 * Single entry point: validateOrExit()
 * No nested structures, no unsafe destructuring
 * Guaranteed safe failure behavior
 */

const isProduction = process.env.NODE_ENV === 'production';
const isDebug = process.env.DEBUG === 'true';

// ============================================================================
// LAYER 1: SCHEMA DEFINITION
// ============================================================================

/**
 * Required environment variables
 * Add new variables here as needed
 */
const REQUIRED_ENV = [
  'DATABASE_URL',
  'JWT_SECRET',
];

/**
 * Optional environment variables (warnings only)
 */
const OPTIONAL_ENV = [
  'REDIS_URL',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'OPENAI_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
];

/**
 * Environment variables with default values
 */
const ENV_DEFAULTS = {
  NODE_ENV: 'development',
  PORT: '3000',
};

/**
 * Validation rules for specific variables
 */
const VALIDATION_RULES = {
  DATABASE_URL: {
    pattern: /^postgresql:\/\/.+/,
    message: 'Must be a valid PostgreSQL connection string (postgresql://...)',
  },
  REDIS_URL: {
    pattern: /^rediss?:\/\/.+/,
    message: 'Must be a valid Redis connection string (redis:// or rediss://)',
  },
  JWT_SECRET: {
    minLength: 32,
    message: 'Must be at least 32 characters for security',
  },
  TWILIO_ACCOUNT_SID: {
    pattern: /^AC[a-z0-9]{32}$/i,
    message: 'Must be a valid Twilio Account SID (AC...)',
  },
  TWILIO_AUTH_TOKEN: {
    minLength: 32,
    message: 'Must be at least 32 characters',
  },
  OPENAI_API_KEY: {
    pattern: /^sk-[a-zA-Z0-9-_]{20,}$/,
    message: 'Must be a valid OpenAI API key (sk-...)',
  },
  NODE_ENV: {
    allowedValues: ['development', 'production', 'test'],
    message: 'Must be one of: development, production, test',
  },
  PORT: {
    pattern: /^\d+$/,
    message: 'Must be a valid port number',
  },
};

// ============================================================================
// LAYER 2: VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate a single environment variable
 * 
 * @param {string} key - Variable name
 * @param {string|undefined} value - Variable value
 * @returns {Object} Validation result { valid: boolean, error: string|null }
 */
function validateVariable(key, value) {
  // Check if value exists
  if (!value || value.trim() === '') {
    return { valid: false, error: 'Missing or empty' };
  }

  // Get validation rules for this variable
  const rules = VALIDATION_RULES[key];
  if (!rules) {
    // No specific rules, just check it exists
    return { valid: true, error: null };
  }

  // Validate pattern
  if (rules.pattern) {
    if (!rules.pattern.test(value)) {
      return { valid: false, error: rules.message || 'Invalid format' };
    }
  }

  // Validate minimum length
  if (rules.minLength) {
    if (value.length < rules.minLength) {
      return { valid: false, error: rules.message || `Must be at least ${rules.minLength} characters` };
    }
  }

  // Validate allowed values
  if (rules.allowedValues) {
    if (!rules.allowedValues.includes(value)) {
      return { valid: false, error: rules.message || `Must be one of: ${rules.allowedValues.join(', ')}` };
    }
  }

  return { valid: true, error: null };
}

/**
 * Apply default values for missing environment variables
 * 
 * @returns {void}
 */
function applyDefaults() {
  for (const key in ENV_DEFAULTS) {
    if (!process.env[key]) {
      process.env[key] = ENV_DEFAULTS[key];
    }
  }
}

/**
 * Validate all environment variables
 * 
 * @returns {Object} Flat validation result { valid: boolean, missing: string[], invalid: string[], warnings: string[] }
 */
function validateEnvironment() {
  // Apply defaults first
  applyDefaults();

  const missing = [];
  const invalid = [];
  const warnings = [];
  const validVars = [];

  // Validate required variables
  for (const key of REQUIRED_ENV) {
    const value = process.env[key];
    
    if (!value || value.trim() === '') {
      missing.push(key);
    } else {
      const result = validateVariable(key, value);
      if (result.valid) {
        validVars.push(key);
      } else {
        invalid.push(`${key}: ${result.error}`);
      }
    }
  }

  // Check optional variables (warnings only)
  for (const key of OPTIONAL_ENV) {
    const value = process.env[key];
    
    if (!value || value.trim() === '') {
      // Only warn about Redis in production
      if (key === 'REDIS_URL' && isProduction) {
        warnings.push(`${key} not configured - background jobs will be disabled`);
      }
    } else {
      const result = validateVariable(key, value);
      if (result.valid) {
        validVars.push(key);
      } else {
        // Optional variables with invalid format are warnings, not errors
        warnings.push(`${key}: ${result.error}`);
      }
    }
  }

  // Check for defaults used
  for (const key in ENV_DEFAULTS) {
    if (process.env[key] === ENV_DEFAULTS[key]) {
      warnings.push(`${key} using default value: ${ENV_DEFAULTS[key]}`);
    }
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing: missing,
    invalid: invalid,
    warnings: warnings,
    validVars: validVars,
  };
}

// ============================================================================
// LAYER 3: OUTPUT FORMATTING
// ============================================================================

/**
 * Print validation results in a structured format
 * 
 * @param {Object} result - Validation result
 * @returns {void}
 */
function printValidationResults(result) {
  const envName = isProduction ? 'PRODUCTION' : 'DEVELOPMENT';
  
  console.log('\n' + '='.repeat(70));
  console.log(`STARTUP ENVIRONMENT VALIDATION (${envName})`);
  console.log('='.repeat(70) + '\n');

  // Valid variables
  if (result.validVars && result.validVars.length > 0) {
    console.log('✅ Valid Variables:');
    for (const varName of result.validVars) {
      console.log(`   ✅ ${varName}`);
    }
    console.log();
  }

  // Warnings (non-blocking)
  if (result.warnings && result.warnings.length > 0) {
    console.log('⚠️  Warnings (non-blocking):');
    for (const warning of result.warnings) {
      console.log(`   ⚠️  ${warning}`);
    }
    console.log();
  }

  // Missing variables (blocking)
  if (result.missing && result.missing.length > 0) {
    console.log('❌ Missing Required Variables:');
    for (const varName of result.missing) {
      console.log(`   ❌ ${varName}`);
      
      // Show example if available
      const rules = VALIDATION_RULES[varName];
      if (rules && rules.message) {
        console.log(`      ${rules.message}`);
      }
    }
    console.log();
  }

  // Invalid variables (blocking)
  if (result.invalid && result.invalid.length > 0) {
    console.log('❌ Invalid Variables:');
    for (const error of result.invalid) {
      console.log(`   ❌ ${error}`);
    }
    console.log();
  }
}

/**
 * Print diagnostic information
 * 
 * @returns {void}
 */
function printDiagnostics() {
  console.log('🔍 Diagnostic Information:');
  console.log(`   Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`   Node Version: ${process.version}`);
  console.log(`   Platform: ${process.platform}`);
  console.log();
}

/**
 * Print action required message
 * 
 * @returns {void}
 */
function printActionRequired() {
  console.log('📋 Action Required:');
  console.log('   1. Check your .env file or environment variables');
  console.log('   2. Compare with .env.example for reference');
  console.log('   3. Ensure all required variables are set correctly');
  console.log();
  console.log('💡 Common Issues:');
  console.log('   - REDIS_URL must be redis://host:port (not redis-cli command)');
  console.log('   - DATABASE_URL must start with postgresql://');
  console.log('   - JWT_SECRET must be at least 32 characters');
  console.log();
}

// ============================================================================
// LAYER 4: EXIT CONTROLLER
// ============================================================================

/**
 * Main validation entry point
 * Validates environment and exits if invalid
 * 
 * This is the ONLY exported function
 * 
 * @returns {void} Never returns if validation fails (calls process.exit)
 */
function validateOrExit() {
  try {
    // Run validation
    const result = validateEnvironment();
    
    // Safe access with defaults
    const valid = result?.valid ?? false;
    const missing = result?.missing ?? [];
    const invalid = result?.invalid ?? [];
    const warnings = result?.warnings ?? [];

    // Print results
    printValidationResults(result);

    // Check if validation passed
    if (!valid) {
      console.log('='.repeat(70));
      console.log('❌ STARTUP VALIDATION FAILED');
      console.log('='.repeat(70));
      console.log();
      
      printDiagnostics();
      printActionRequired();

      // Show debug info if enabled
      if (isDebug) {
        console.log('🐛 Debug Information:');
        console.log('   Missing:', missing);
        console.log('   Invalid:', invalid);
        console.log('   Warnings:', warnings);
        console.log();
      }

      // Exit safely
      process.exit(1);
    }

    // Success
    console.log('='.repeat(70));
    console.log('✅ STARTUP VALIDATION PASSED');
    console.log('='.repeat(70));
    console.log();
    console.log(`📊 Summary: ${result.validVars.length} valid, ${warnings.length} warnings`);
    console.log();

  } catch (error) {
    // Catch any unexpected errors during validation
    console.error('\n' + '='.repeat(70));
    console.error('💥 CRITICAL ERROR DURING VALIDATION');
    console.error('='.repeat(70));
    console.error('\nAn unexpected error occurred during environment validation.');
    console.error('This should never happen. Please report this issue.');
    console.error();
    
    if (isDebug) {
      console.error('Error details:', error);
      console.error('Stack trace:', error.stack);
    } else {
      console.error('Error:', error.message);
      console.error('Run with DEBUG=true for more details');
    }
    
    console.error();
    
    // Exit safely even on unexpected errors
    process.exit(1);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Export only the main entry point
 * No other functions should be exported to prevent misuse
 */
module.exports = {
  validateOrExit,
};
