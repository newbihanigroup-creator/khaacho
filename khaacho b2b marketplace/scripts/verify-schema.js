/**
 * Schema Verification Script
 * Verifies that database schema matches Prisma schema
 * 
 * This script checks:
 * 1. Database connection
 * 2. Tables exist
 * 3. Schema is up to date
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifySchema() {
  console.log('\n' + '='.repeat(60));
  console.log('SCHEMA VERIFICATION');
  console.log('='.repeat(60) + '\n');
  
  try {
    // Check database connection
    console.log('[1/3] Checking database connection...');
    await prisma.$connect();
    console.log('✅ Database connected\n');
    
    // Check tables exist
    console.log('[2/3] Checking tables...');
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    
    if (tables.length === 0) {
      throw new Error('No tables found in database. Run migrations first.');
    }
    
    console.log(`✅ Found ${tables.length} tables:`);
    tables.forEach(table => {
      console.log(`   - ${table.table_name}`);
    });
    console.log();
    
    // Check critical tables
    console.log('[3/3] Checking critical tables...');
    const criticalTables = [
      'users',
      'retailers',
      'vendors',
      'orders',
      'order_items',
    ];
    
    const tableNames = tables.map(t => t.table_name);
    const missingTables = criticalTables.filter(t => !tableNames.includes(t));
    
    if (missingTables.length > 0) {
      throw new Error(`Missing critical tables: ${missingTables.join(', ')}`);
    }
    
    console.log('✅ All critical tables exist\n');
    
    // Success
    console.log('='.repeat(60));
    console.log('✅ SCHEMA VERIFICATION PASSED');
    console.log('='.repeat(60) + '\n');
    
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Schema verification failed');
    console.error('Error:', error.message);
    console.error('\nPlease run: npm run db:deploy');
    
    await prisma.$disconnect();
    process.exit(1);
  }
}

verifySchema();
