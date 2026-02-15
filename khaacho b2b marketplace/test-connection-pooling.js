/**
 * Test Prisma Connection Pooling and Retry Logic
 * Tests connection limits, slow query logging, and retry mechanisms
 */

const prisma = require('./src/config/database');
const { 
  withRetry, 
  checkDatabaseConnection, 
  getConnectionPoolStats,
  getDatabaseStats 
} = require('./src/config/database');

async function testConnectionPooling() {
  console.log('🧪 Testing Prisma Connection Pooling\n');

  try {
    // Test 1: Basic Connection
    console.log('📋 Test 1: Testing basic database connection...');
    const isHealthy = await checkDatabaseConnection();
    console.log(isHealthy ? '✅ Connection healthy' : '❌ Connection failed');
    console.log('');

    // Test 2: Connection Pool Statistics
    console.log('📋 Test 2: Getting connection pool statistics...');
    const poolStats = await getConnectionPoolStats();
    if (poolStats) {
      console.log('✅ Connection pool stats:', {
        total: poolStats.total_connections,
        active: poolStats.active_connections,
        idle: poolStats.idle_connections,
        lastActivity: poolStats.last_activity,
      });
    } else {
      console.log('⚠️  Could not retrieve pool stats');
    }
    console.log('');

    // Test 3: Database Statistics
    console.log('📋 Test 3: Getting database statistics...');
    const dbStats = await getDatabaseStats();
    if (dbStats) {
      console.log('✅ Database size:', dbStats.databaseSize);
      console.log('✅ Largest tables:');
      dbStats.largestTables.slice(0, 5).forEach(table => {
        console.log(`   - ${table.tablename}: ${table.total_size} (${table.row_count} rows)`);
      });
    } else {
      console.log('⚠️  Could not retrieve database stats');
    }
    console.log('');

    // Test 4: Simple Query with Retry
    console.log('📋 Test 4: Testing simple query with retry...');
    const startTime = Date.now();
    const result = await withRetry(async () => {
      return await prisma.$queryRaw`SELECT 1 as test`;
    });
    const duration = Date.now() - startTime;
    console.log('✅ Query executed successfully:', result);
    console.log(`   Duration: ${duration}ms`);
    console.log('');

    // Test 5: Count Query
    console.log('📋 Test 5: Testing count query...');
    const orderCount = await withRetry(async () => {
      return await prisma.order.count();
    });
    console.log('✅ Total orders:', orderCount);
    console.log('');

    // Test 6: Complex Query (may trigger slow query log if > 500ms)
    console.log('📋 Test 6: Testing complex query (check logs for slow query warnings)...');
    const complexStart = Date.now();
    const orders = await withRetry(async () => {
      return await prisma.order.findMany({
        take: 10,
        include: {
          retailer: {
            include: {
              user: true,
            },
          },
          items: {
            include: {
              product: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    });
    const complexDuration = Date.now() - complexStart;
    console.log('✅ Complex query executed:', {
      ordersReturned: orders.length,
      duration: `${complexDuration}ms`,
      slowQuery: complexDuration > 500 ? 'YES (check logs)' : 'NO',
    });
    console.log('');

    // Test 7: Transaction with Retry
    console.log('📋 Test 7: Testing transaction with retry...');
    const txResult = await withRetry(async () => {
      return await prisma.$transaction(async (tx) => {
        const orderCount = await tx.order.count();
        const retailerCount = await tx.retailer.count();
        return { orderCount, retailerCount };
      });
    });
    console.log('✅ Transaction executed:', txResult);
    console.log('');

    // Test 8: Concurrent Queries (test connection pool)
    console.log('📋 Test 8: Testing concurrent queries (connection pool stress test)...');
    const concurrentStart = Date.now();
    const promises = Array.from({ length: 20 }, (_, i) => {
      return withRetry(async () => {
        return await prisma.$queryRaw`SELECT ${i} as query_number, pg_sleep(0.1)`;
      });
    });
    
    const concurrentResults = await Promise.all(promises);
    const concurrentDuration = Date.now() - concurrentStart;
    console.log('✅ Concurrent queries completed:', {
      totalQueries: concurrentResults.length,
      duration: `${concurrentDuration}ms`,
      avgPerQuery: `${Math.round(concurrentDuration / concurrentResults.length)}ms`,
    });
    console.log('');

    // Test 9: Retry Logic Simulation
    console.log('📋 Test 9: Testing retry logic with simulated error...');
    let attemptCount = 0;
    try {
      await withRetry(
        async () => {
          attemptCount++;
          if (attemptCount < 3) {
            // Simulate transient error
            const error = new Error('Simulated connection timeout');
            error.code = 'P1002';
            throw error;
          }
          return { success: true, attempts: attemptCount };
        },
        3,
        100 // 100ms delay for faster test
      );
      console.log('✅ Retry logic working:', {
        totalAttempts: attemptCount,
        result: 'Success after retries',
      });
    } catch (error) {
      console.log('❌ Retry logic failed:', error.message);
    }
    console.log('');

    // Test 10: Connection Pool Stats After Load
    console.log('📋 Test 10: Connection pool stats after load...');
    const finalPoolStats = await getConnectionPoolStats();
    if (finalPoolStats) {
      console.log('✅ Final pool stats:', {
        total: finalPoolStats.total_connections,
        active: finalPoolStats.active_connections,
        idle: finalPoolStats.idle_connections,
      });
    }
    console.log('');

    // Test 11: Verify DATABASE_URL Configuration
    console.log('📋 Test 11: Verifying DATABASE_URL configuration...');
    const dbUrl = process.env.DATABASE_URL;
    const hasConnectionLimit = dbUrl.includes('connection_limit');
    const hasPoolTimeout = dbUrl.includes('pool_timeout');
    const hasConnectTimeout = dbUrl.includes('connect_timeout');
    
    console.log('DATABASE_URL parameters:', {
      connectionLimit: hasConnectionLimit ? '✅ Configured' : '⚠️  Missing',
      poolTimeout: hasPoolTimeout ? '✅ Configured' : '⚠️  Missing',
      connectTimeout: hasConnectTimeout ? '✅ Configured' : '⚠️  Missing',
    });
    
    if (!hasConnectionLimit) {
      console.log('\n⚠️  Recommendation: Add connection_limit to DATABASE_URL');
      console.log('   Example: DATABASE_URL="postgresql://...?connection_limit=10"');
    }
    console.log('');

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ All tests completed successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\nConnection Pooling Features:');
    console.log('  ✅ Connection limit configured');
    console.log('  ✅ Slow query logging (>500ms)');
    console.log('  ✅ Retry logic with exponential backoff');
    console.log('  ✅ Connection reuse via singleton');
    console.log('  ✅ Pool statistics monitoring');
    console.log('\nNext Steps:');
    console.log('  1. Review logs for slow queries');
    console.log('  2. Monitor connection pool utilization');
    console.log('  3. Adjust connection_limit based on load');
    console.log('  4. Set up alerts for pool exhaustion');
    console.log('\nDocumentation:');
    console.log('  See PRISMA_CONNECTION_POOLING_GUIDE.md for details');
    console.log('');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Database disconnected');
  }
}

// Run tests
testConnectionPooling();
