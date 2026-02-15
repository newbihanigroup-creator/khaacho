/**
 * Database Deployment Script
 * Production-safe database migration deployment
 * 
 * This script:
 * 1. Generates Prisma Client
 * 2. Runs migrations with prisma migrate deploy
 * 3. Verifies tables exist
 * 4. Exits with code 1 if any step fails
 */

const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

console.log('\n' + '='.repeat(60));
console.log('DATABASE DEPLOYMENT');
console.log('='.repeat(60) + '\n');

const startTime = Date.now();

/**
 * Step 1: Generate Prisma Client
 */
console.log('[1/3] Generating Prisma Client...');
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma Client generated\n');
} catch (error) {
  console.error('❌ Failed to generate Prisma Client');
  console.error('Error:', error.message);
  process.exit(1);
}

/**
 * Step 2: Deploy migrations
 */
console.log('[2/3] Deploying database migrations...');
try {
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('✅ Migrations deployed\n');
} catch (error) {
  console.error('❌ Failed to deploy migrations');
  console.error('Error:', error.message);
  console.error('\nPlease check:');
  console.error('1. DATABASE_URL is set correctly');
  console.error('2. Database is accessible');
  console.error('3. Migration files exist in prisma/migrations/');
  process.exit(1);
}

/**
 * Step 3: Verify tables exist
 */
console.log('[3/3] Verifying database schema...');

const prisma = new PrismaClient();

async function verifySchema() {
  try {
    // Check if tables exist
    const result = await prisma.$queryRaw`
      SELECT COUNT(*) as table_count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `;
    
    const tableCount = Number(result[0].table_count);
    
    if (tableCount === 0) {
      throw new Error('No tables found in database');
    }
    
    console.log(`✅ Schema verified (${tableCount} tables found)\n`);
    
    await prisma.$disconnect();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('='.repeat(60));
    console.log('✅ DATABASE DEPLOYMENT COMPLETE');
    console.log('='.repeat(60));
    console.log(`Duration: ${duration}s\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Schema verification failed');
    console.error('Error:', error.message);
    
    await prisma.$disconnect();
    process.exit(1);
  }
}

verifySchema();
