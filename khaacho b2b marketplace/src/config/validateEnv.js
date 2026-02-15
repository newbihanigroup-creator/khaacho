/**
 * Startup Environment Validation
 * Validates required environment variables before server starts
 * 
 * Production-safe: Exits with code 1 if validation fails
 */

/**
 * Required environment variables configuration
 */
const REQUIRED_VARS = [
  {
    name: 'DATABASE_URL',
    description: 'PostgreSQL connection string',
    pattern: /^postgresql:\/\/.+/,
    example: 'postgresql://user:password@host:5432/database',
  },
  {
    name: 'REDIS_URL',
    description: 'Redis connection string',
    optional: true,
    pattern: /^rediss?:\/\/.+/,
    example: 'redis://localhost:6379',
  },
  {
    name: 'TWILIO_ACCOUNT_SID',
    description: 'Twilio Account SID',
    optional: true,
    pattern: /^AC[a-z0-9]{32}$/i,
    example: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  {
    name: 'TWILIO_AUTH_TOKEN',
    description: 'Twilio Auth Token',
    optional: true,
    minLength: 32,
    example: 'your_twilio_auth_token',
  },
  {
    name: 'OPENAI_API_KEY',
    description: 'OpenAI API Key',
    optional: true,
    pattern: /^sk-[a-zA-Z0-9]{48}$/,
    example: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  {
    name: 'GOOGLE_APPLICATION_CREDENTIALS',
    description: 'Google Cloud credentials file path',
    optional: true,
    example: './path/to/service-account-key.json',
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
  
  // Check if variable exists
  if (!value) {
    return {
      valid: config.optional || false,
      missing: !config.optional,
      name: config.name,
      description: config.description,
      optional: config.optional || false,
    };
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
  console.log('\n' + '='.repeat(60));
  console.log('STARTUP ENVIRONMENT VALIDATION');
  console.log('='.repeat(60) + '\n');
  
  const results = {
    valid: [],
    missing: [],
    invalid: [],
    optional: [],
  };
  
  // Validate each variable
  for (const config of REQUIRED_VARS) {
    const result = validateVariable(config);
    
    if (result.valid) {
      results.valid.push(result);
    } else if (result.missing) {
      results.missing.push(result);
    } else if (result.invalid) {
      results.invalid.push(result);
    }
    
    if (result.optional && !process.env[config.name]) {
      results.optional.push(result);
    }
  }
  
  // Display results
  displayResults(results);
  
  // Check if validation passed
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
    console.log('✅ Configured:');
    for (const item of results.valid) {
      console.log(`   ✅ ${item.name} - ${item.description}`);
    }
    console.log();
  }
  
  // Display optional missing variables
  if (results.optional.length > 0) {
    console.log('⚠️  Optional (not configured):');
    for (const item of results.optional) {
      console.log(`   ⚠️  ${item.name} - ${item.description}`);
    }
    console.log();
  }
  
  // Display missing required variables
  if (results.missing.length > 0) {
    console.log('❌ Missing Required Variables:');
    for (const item of results.missing) {
      console.log(`   ❌ ${item.name} - ${item.description}`);
    }
    console.log();
  }
  
  // Display invalid variables
  if (results.invalid.length > 0) {
    console.log('❌ Invalid Variables:');
    for (const item of results.invalid) {
      console.log(`   ❌ ${item.name} - ${item.error}`);
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
 */
function validateOrExit() {
  const { success, results } = validateEnvironment();
  
  if (!success) {
    console.log('='.repeat(60));
    console.log('❌ STARTUP VALIDATION FAILED');
    console.log('='.repeat(60));
    console.log('\nPlease set the missing/invalid environment variables.');
    console.log('See .env.example for reference.\n');
    
    // Exit with code 1
    process.exit(1);
  }
  
  console.log('='.repeat(60));
  console.log('✅ STARTUP VALIDATION PASSED');
  console.log('='.repeat(60) + '\n');
  
  return true;
}

module.exports = {
  validateEnvironment,
  validateOrExit,
};
