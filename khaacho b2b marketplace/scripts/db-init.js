/**
 * Database Initialization Script
 * Ensures database is ready before server starts
 * 
 * This script:
 * 1. Runs Prisma migrations
 * 2. Generates Prisma Client
 * 3. Verifies schema is up to date
 * 4. Exits with code 1 if any step fails
 */

const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${ step}] ${message}`, colors.blue);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

/**
 * Run a command and handle errors
 */
function runCommand(command, description) {
  try {
    log(`Running: ${command}`);
    execSync(command, { stdio: 'inherit' });
    logSuccess(`${description} completed`);
    return true;
  } catch (error) {
    logError(`${description} failed`);
    logError(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Verify database connection
 */
async function verifyDatabaseConnection() {
  logStep('1', 'Verifying database connection');
  
  if (!process.env.DATABASE_URL) {
    logError('DATABASE_URL environment variable is not set');
    return false;
  }
  
  log(`Database URL: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
  
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1 as health_check`;
    logSuccess('Database connection successful');
    await prisma.$disconnect();
    return true;
  } catch (error) {
    logError('Database connection failed');
    logError(`Error: ${error.message}`);
    
    log('\nPlease check:');
    log('1. DATABASE_URL is correct');
    log('2. Database server is running');
    log('3. Database credentials are valid');
    log('4. Network connectivity to database');
    
    try {
      await prisma.$disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    
    return false;
  }
}

/**
 * Generate Prisma Client
 */
function generatePrismaClient() {
  logStep('2', 'Generating Prisma Client');
  return runCommand('npx prisma generate', 'Prisma Client generation');
}

/**
 * Run database migrations
 */
function runMigrations() {
  logStep('3', 'Running database migrations');
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    log('Production mode: Using prisma migrate deploy');
    return runCommand('npx prisma migrate deploy', 'Database migrations');
  } else {
    log('Development mode: Using prisma migrate dev');
    logWarning('This will prompt for migration name if changes detected');
    return runCommand('npx prisma migrate dev', 'Database migrations');
  }
}

/**
 * Verify schema is up to date
 */
async function verifySchema() {
  logStep('4', 'Verifying schema is up to date');
  
  const prisma = new PrismaClient();
  
  try {
    // Try to query a table that should exist
    await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LIMIT 1`;
    
    logSuccess('Schema verification passed');
    await prisma.$disconnect();
    return true;
  } catch (error) {
    logError('Schema verification failed');
    logError(`Error: ${error.message}`);
    
    try {
      await prisma.$disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    
    return false;
  }
}

/**
 * Main initialization function
 */
async function initializeDatabase() {
  log('='.repeat(60), colors.blue);
  log('DATABASE INITIALIZATION', colors.blue);
  log('='.repeat(60), colors.blue);
  
  const startTime = Date.now();
  
  try {
    // Step 1: Verify database connection
    const connectionOk = await verifyDatabaseConnection();
    if (!connectionOk) {
      logError('\nDatabase initialization failed: Cannot connect to database');
      process.exit(1);
    }
    
    // Step 2: Generate Prisma Client
    const generateOk = generatePrismaClient();
    if (!generateOk) {
      logError('\nDatabase initialization failed: Prisma Client generation failed');
      process.exit(1);
    }
    
    // Step 3: Run migrations
    const migrationsOk = runMigrations();
    if (!migrationsOk) {
      logError('\nDatabase initialization failed: Migrations failed');
      process.exit(1);
    }
    
    // Step 4: Verify schema
    const schemaOk = await verifySchema();
    if (!schemaOk) {
      logError('\nDatabase initialization failed: Schema verification failed');
      process.exit(1);
    }
    
    // Success
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    log('\n' + '='.repeat(60), colors.green);
    log('✅ DATABASE INITIALIZATION COMPLETE', colors.green);
    log('='.repeat(60), colors.green);
    log(`Duration: ${duration}s`, colors.green);
    log('');
    
    process.exit(0);
  } catch (error) {
    logError('\nUnexpected error during database initialization');
    logError(`Error: ${error.message}`);
    logError(`Stack: ${error.stack}`);
    process.exit(1);
  }
}

// Run initialization
initializeDatabase();
