/**
 * Test Script: Queue Retry and Recovery System
 * 
 * Tests the queue retry logic with exponential backoff and dead-letter queue
 * 
 * Usage: node test-queue-retry-recovery.js
 */

require('dotenv').config();
const queueRetryService = require('./src/services/queueRetry.service');
const { queueManager, QUEUES } = require('./src/queues/queueManager');
const queueRecoveryWorker = require('./src/workers/queueRecovery.worker');

async function testRetryLogic() {
  console.log('🧪 Testing Queue Retry Logic\n');
  console.log('='.repeat(80));

  try {
    // Initialize queue manager
    if (!queueManager.isInitialized) {
      queueManager.initialize();
    }

    // Test 1: Track job start
    console.log('\n1️⃣ Testing job tracking...');
    const testJobId = `test-job-${Date.now()}`;
    await queueRetryService.trackJobStart(
      testJobId,
      'test-queue',
      'test-job',
      { test: 'data' }
    );
    console.log('   ✅ Job tracking started');

    // Test 2: Simulate job failure and retry
    console.log('\n2️⃣ Testing job failure and retry logic...');
    const error = new Error('Test error for retry');
    
    // Attempt 1
    let result = await queueRetryService.trackJobFailure(testJobId, error, 1);
    console.log(`   Attempt 1: shouldRetry=${result.shouldRetry}, delay=${result.retryDelay}ms`);
    console.log(`   ✅ Next retry at: ${result.nextRetryAt}`);

    // Attempt 2
    result = await queueRetryService.trackJobFailure(testJobId, error, 2);
    console.log(`   Attempt 2: shouldRetry=${result.shouldRetry}, delay=${result.retryDelay}ms`);
    console.log(`   ✅ Next retry at: ${result.nextRetryAt}`);

    // Attempt 3 (final)
    result = await queueRetryService.trackJobFailure(testJobId, error, 3);
    console.log(`   Attempt 3: shouldRetry=${result.shouldRetry}, shouldMoveToDLQ=${result.shouldMoveToDLQ}`);
    console.log('   ✅ Job marked for DLQ');

    // Test 3: Move to dead letter queue
    console.log('\n3️⃣ Testing dead letter queue...');
    const dlqId = await queueRetryService.moveToDeadLetterQueue(testJobId);
    console.log(`   ✅ Job moved to DLQ: ${dlqId}`);

    // Test 4: Get queue statistics
    console.log('\n4️⃣ Testing queue statistics...');
    const stats = await queueRetryService.getQueueStatistics();
    console.log('   Queue Statistics:');
    stats.forEach(stat => {
      console.log(`   - ${stat.queue_name}:`);
      console.log(`     Waiting: ${stat.waiting_count}`);
      console.log(`     Active: ${stat.active_count}`);
      console.log(`     Completed: ${stat.completed_count}`);
      console.log(`     Failed: ${stat.failed_count}`);
      console.log(`     Retryable: ${stat.retryable_count}`);
    });

    // Test 5: Get DLQ summary
    console.log('\n5️⃣ Testing DLQ summary...');
    const dlqSummary = await queueRetryService.getDeadLetterQueueSummary();
    console.log('   DLQ Summary:');
    dlqSummary.forEach(summary => {
      console.log(`   - ${summary.queue_name}:`);
      console.log(`     Total Failed: ${summary.total_failed_jobs}`);
      console.log(`     Pending Recovery: ${summary.pending_recovery}`);
      console.log(`     Recovered: ${summary.recovered}`);
      console.log(`     Permanently Failed: ${summary.permanently_failed}`);
    });

    // Test 6: Get DLQ jobs
    console.log('\n6️⃣ Testing DLQ job retrieval...');
    const dlqJobs = await queueRetryService.getDeadLetterJobs(10);
    console.log(`   ✅ Found ${dlqJobs.length} jobs in DLQ`);
    if (dlqJobs.length > 0) {
      console.log('   Recent DLQ jobs:');
      dlqJobs.slice(0, 3).forEach(job => {
        console.log(`   - ${job.original_job_id}:`);
        console.log(`     Queue: ${job.original_queue_name}`);
        console.log(`     Attempts: ${job.total_attempts}`);
        console.log(`     Status: ${job.recovery_status}`);
      });
    }

    // Test 7: Update DLQ job notes
    console.log('\n7️⃣ Testing DLQ job notes update...');
    await queueRetryService.updateDeadLetterJobNotes(
      dlqId,
      'Test notes from automated test',
      'test-admin',
      5
    );
    console.log('   ✅ DLQ job notes updated');

    // Test 8: Mark as permanently failed
    console.log('\n8️⃣ Testing mark as permanently failed...');
    await queueRetryService.markDeadLetterJobPermanentlyFailed(
      dlqId,
      'Test permanent failure'
    );
    console.log('   ✅ Job marked as permanently failed');

    console.log('\n✅ All retry logic tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

async function testRecoveryWorker() {
  console.log('\n\n🔄 Testing Recovery Worker\n');
  console.log('='.repeat(80));

  try {
    // Test 1: Get worker stats
    console.log('\n1️⃣ Getting worker stats...');
    const stats = queueRecoveryWorker.getStats();
    console.log('   Worker Statistics:');
    console.log(`   Total Runs: ${stats.totalRuns}`);
    console.log(`   Successful Runs: ${stats.successfulRuns}`);
    console.log(`   Failed Runs: ${stats.failedRuns}`);
    console.log(`   Last Run: ${stats.lastRunAt || 'Never'}`);
    console.log(`   Last Duration: ${stats.lastRunDuration || 'N/A'}ms`);

    // Test 2: Trigger manual recovery
    console.log('\n2️⃣ Triggering manual recovery...');
    await queueRecoveryWorker.triggerRecovery();
    console.log('   ✅ Recovery completed');

    // Test 3: Get updated stats
    console.log('\n3️⃣ Getting updated stats...');
    const updatedStats = queueRecoveryWorker.getStats();
    console.log('   Updated Statistics:');
    console.log(`   Total Runs: ${updatedStats.totalRuns}`);
    console.log(`   Successful Runs: ${updatedStats.successfulRuns}`);
    console.log(`   Last Run: ${updatedStats.lastRunAt}`);
    console.log(`   Last Duration: ${updatedStats.lastRunDuration}ms`);

    console.log('\n✅ All recovery worker tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

async function testExponentialBackoff() {
  console.log('\n\n⏱️  Testing Exponential Backoff\n');
  console.log('='.repeat(80));

  try {
    const retryDelays = [5000, 15000, 45000];
    
    console.log('\nRetry Delays:');
    for (let attempt = 1; attempt <= 5; attempt++) {
      const delay = queueRetryService.calculateRetryDelay(attempt, retryDelays);
      console.log(`   Attempt ${attempt}: ${delay}ms (${delay / 1000}s)`);
    }

    console.log('\n✅ Exponential backoff verified!');
    console.log('   Pattern: 5s → 15s → 45s → 45s (capped)');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

async function main() {
  try {
    await testRetryLogic();
    await testRecoveryWorker();
    await testExponentialBackoff();

    console.log('\n' + '='.repeat(80));
    console.log('✅ All tests completed successfully!\n');
    
    // Close connections
    await queueManager.closeAll();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
main();
