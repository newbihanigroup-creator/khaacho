#!/usr/bin/env node

/**
 * Startup Validation Script
 * 
 * Validates all required environment variables and database connectivity
 * Run this before deployment to ensure the app will start successfully
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

console.log('\n🔍 Validating Startup Configuration...\n');

let hasErrors = false;
let hasWarnings = false;

// ============================================================================
// 1. ENVIRONMENT VARIABLES VALIDATION
// ============================================================================

console.log('📋 Checking Environment Variables...\n');

const requiredVars = {
  DATABASE_URL: {
    required: true,
    pattern: /^postgresql:\/\/.+/,
    description: 'PostgreSQL connection string',
  },
  JWT_SECRET: {
    required: true,
    minLength: 32,
    description: 'JWT secret key (min 32 characters)',
  },
  NODE_ENV: {
    required: true,
    allowedValues: ['development', 'production', 'test'],
    description: 'Application environment',
  },
  PORT: {
    required: false,
    type: 'number',
    description: 'Server port (defaults to 3000)',
  },
  API_VERSION: {
    required: false,
    description: 'API version (defaults to v1)',
  },
};

const optionalVars = {
  REDIS_URL: 'Redis connection string (for background jobs)',
  REDIS_HOST: 'Redis host (alternative to REDIS_URL)',
  REDIS_PORT: 'Redis port (alternative to REDIS_URL)',
  WHATSAPP_VERIFY_TOKEN: 'WhatsApp webhook verification token',
  WHATSAPP_ACCESS_TOKEN: 'WhatsApp API access token',
  WHATSAPP_PHONE_NUMBER_ID: 'WhatsApp phone number ID',
};

// Check required variables
for (const [key, config] of Object.entries(requiredVars)) {
  const value = process.env[key];

  if (config.required && !value) {
    console.error(`  ❌ ${key} - MISSING (${config.description})`);
    hasErrors = true;
    continue;
  }

  if (!value) {
    console.log(`  ⚠️  ${key} - Not set (${config.description})`);
    hasWarnings = true;
    continue;
  }

  // Validate pattern
  if (config.pattern && !config.pattern.test(value)) {
    console.error(`  ❌ ${key} - Invalid format (${config.description})`);
    hasErrors = true;
    continue;
  }

  // Validate min length
  if (config.minLength && value.length < config.minLength) {
    console.error(`  ❌ ${key} - Too short (min ${config.minLength} characters)`);
    hasErrors = true;
    continue;
  }

  // Validate allowed values
  if (config.allowedValues && !config.allowedValues.includes(value)) {
    console.error(`  ❌ ${key} - Invalid value (must be one of: ${config.allowedValues.join(', ')})`);
    hasErrors = true;
    continue;
  }

  // Validate type
  if (config.type === 'number' && isNaN(Number(value))) {
    console.error(`  ❌ ${key} - Must be a number`);
    hasErrors = true;
    continue;
  }

  console.log(`  ✅ ${key} - OK`);
}

// Check Redis configuration
console.log('\n📋 Checking Redis Configuration...\n');
if (process.env.REDIS_URL) {
  console.log('  ✅ REDIS_URL - OK (using connection string)');
} else if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
  console.log('  ✅ REDIS_HOST and REDIS_PORT - OK');
} else {
  console.log('  ⚠️  Redis not configured - App will run in synchronous mode');
  console.log('     Background jobs will execute immediately instead of queued');
  hasWarnings = true;
}

// Check optional variables
console.log('\n📋 Checking Optional Variables...\n');
for (const [key, description] of Object.entries(optionalVars)) {
  if (process.env[key]) {
    console.log(`  ✅ ${key} - Set`);
  } else {
    console.log(`  ⚠️  ${key} - Not set (${description})`);
  }
}

// ============================================================================
// 2. DATABASE CONNECTIVITY TEST
// ============================================================================

console.log('\n📡 Testing Database Connection...\n');

async function testDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('  ❌ DATABASE_URL not set, skipping connection test');
    return false;
  }

  const prisma = new PrismaClient();

  try {
    // Test basic connectivity
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('  ✅ Database connection successful');

    // Check if migrations are applied
    try {
      const migrations = await prisma.$queryRaw`
        SELECT migration_name, finished_at 
        FROM "_prisma_migrations" 
        ORDER BY finished_at DESC 
        LIMIT 5
      `;
      
      if (migrations.length > 0) {
        console.log(`  ✅ Migrations applied (${migrations.length} recent migrations found)`);
      } else {
        console.log('  ⚠️  No migrations found - database may be empty');
        hasWarnings = true;
      }
    } catch (error) {
      console.log('  ⚠️  Migration table not found - run: npx prisma migrate deploy');
      hasWarnings = true;
    }

    // Check critical tables
    console.log('\n📋 Checking Critical Tables...\n');
    const criticalTables = ['User', 'Retailer', 'Vendor', 'Order', 'Product'];
    
    for (const table of criticalTables) {
      try {
        const modelName = table.charAt(0).toLowerCase() + table.slice(1);
        await prisma[modelName].count();
        console.log(`  ✅ ${table} table exists`);
      } catch (error) {
        console.error(`  ❌ ${table} table missing or inaccessible`);
        hasErrors = true;
      }
    }

    await prisma.$disconnect();
    return true;

  } catch (error) {
    console.error('  ❌ Database connection failed');
    console.error('     Error:', error.message);
    console.error('\n     Troubleshooting:');
    console.error('     1. Check DATABASE_URL format: postgresql://user:password@host:5432/database');
    console.error('     2. Verify database server is running');
    console.error('     3. Check credentials are correct');
    console.error('     4. Ensure network connectivity to database');
    
    await prisma.$disconnect();
    return false;
  }
}

// ============================================================================
// 3. PRISMA SCHEMA VALIDATION
// ============================================================================

console.log('\n📋 Checking Prisma Configuration...\n');

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');

if (fs.existsSync(schemaPath)) {
  console.log('  ✅ prisma/schema.prisma exists');
  
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  
  if (schemaContent.includes('env("DATABASE_URL")')) {
    console.log('  ✅ Schema uses env("DATABASE_URL")');
  } else {
    console.error('  ❌ Schema does not use env("DATABASE_URL")');
    hasErrors = true;
  }
  
  if (schemaContent.includes('provider = "postgresql"')) {
    console.log('  ✅ Schema configured for PostgreSQL');
  } else {
    console.error('  ❌ Schema not configured for PostgreSQL');
    hasErrors = true;
  }
} else {
  console.error('  ❌ prisma/schema.prisma not found');
  hasErrors = true;
}

// ============================================================================
// 4. RUN DATABASE TEST
// ============================================================================

testDatabase().then((success) => {
  // ============================================================================
  // 5. FINAL SUMMARY
  // ============================================================================

  console.log('\n' + '='.repeat(70));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(70) + '\n');

  if (hasErrors) {
    console.error('❌ VALIDATION FAILED - Critical errors found');
    console.error('\nThe application will NOT start successfully.');
    console.error('Please fix the errors above before deploying.\n');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('⚠️  VALIDATION PASSED WITH WARNINGS');
    console.log('\nThe application will start, but some features may not work optimally.');
    console.log('Review the warnings above.\n');
    process.exit(0);
  } else {
    console.log('✅ VALIDATION PASSED');
    console.log('\nAll checks passed! The application is ready to start.\n');
    process.exit(0);
  }
}).catch((error) => {
  console.error('\n❌ Validation script failed:', error.message);
  process.exit(1);
});
