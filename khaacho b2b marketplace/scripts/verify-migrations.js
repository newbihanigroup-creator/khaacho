#!/usr/bin/env node

/**
 * Migration Verification Script
 * 
 * Checks if all Prisma migrations have been applied to the database
 * Run this after deployment to verify migration status
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function verifyMigrations() {
  console.log('🔍 Verifying Prisma migrations...\n');

  try {
    // Check database connection
    console.log('📡 Testing database connection...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection successful\n');

    // Get applied migrations from database
    console.log('📋 Checking applied migrations...');
    const appliedMigrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, applied_steps_count
      FROM "_prisma_migrations"
      ORDER BY finished_at ASC
    `;

    console.log(`✅ Found ${appliedMigrations.length} applied migrations in database\n`);

    // Get migration files from filesystem
    const migrationsDir = path.join(__dirname, '../prisma/migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql') && !file.startsWith('.'))
      .sort();

    console.log(`📁 Found ${migrationFiles.length} migration files in prisma/migrations/\n`);

    // Check for failed migrations
    const failedMigrations = await prisma.$queryRaw`
      SELECT migration_name, logs
      FROM "_prisma_migrations"
      WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
    `;

    if (failedMigrations.length > 0) {
      console.log('❌ FAILED MIGRATIONS DETECTED:\n');
      failedMigrations.forEach(migration => {
        console.log(`  - ${migration.migration_name}`);
        if (migration.logs) {
          console.log(`    Error: ${migration.logs}`);
        }
      });
      console.log('');
      process.exit(1);
    }

    // List all applied migrations
    console.log('✅ Applied Migrations:');
    appliedMigrations.forEach((migration, index) => {
      const date = new Date(migration.finished_at).toISOString();
      console.log(`  ${index + 1}. ${migration.migration_name} (${date})`);
    });
    console.log('');

    // Check for pending migrations
    const appliedNames = appliedMigrations.map(m => m.migration_name);
    const pendingMigrations = migrationFiles.filter(file => {
      const migrationName = file.replace('.sql', '');
      return !appliedNames.includes(migrationName);
    });

    if (pendingMigrations.length > 0) {
      console.log('⚠️  PENDING MIGRATIONS (not yet applied):');
      pendingMigrations.forEach(migration => {
        console.log(`  - ${migration}`);
      });
      console.log('\nRun: npx prisma migrate deploy\n');
      process.exit(1);
    }

    // Verify critical tables exist
    console.log('🔍 Verifying critical tables...');
    const criticalTables = [
      'User',
      'Retailer',
      'Vendor',
      'Order',
      'OrderItem',
      'Product',
      'CreditLedger',
      'VendorInventory'
    ];

    for (const table of criticalTables) {
      try {
        await prisma[table.charAt(0).toLowerCase() + table.slice(1)].count();
        console.log(`  ✅ ${table} table exists`);
      } catch (error) {
        console.log(`  ❌ ${table} table missing or inaccessible`);
        console.log(`     Error: ${error.message}`);
        process.exit(1);
      }
    }

    console.log('\n✅ All migrations verified successfully!');
    console.log('✅ Database schema is up to date');
    console.log('✅ All critical tables exist\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Migration verification failed:');
    console.error(error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check DATABASE_URL is set correctly');
    console.error('2. Verify database is accessible');
    console.error('3. Run: npx prisma migrate deploy');
    console.error('4. Check Render build logs for migration errors\n');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifyMigrations();
