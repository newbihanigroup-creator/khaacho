/**
 * Self-Healing System Test
 * Tests automatic detection and recovery of stuck orders
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

// Test configuration
const config = {
  headers: {
    'Content-Type': 'application/json',
  },
};

async function testSelfHealing() {
  console.log('🧪 Testing Self-Healing System\n');

  try {
    // Test 1: Detect stuck orders
    console.log('1️⃣ Detecting stuck orders...');
    const stuckResponse = await axios.get(
      `${BASE_URL}/self-healing/stuck-orders`,
      config
    );
    console.log('✅ Stuck orders detected:', stuckResponse.data.count);
    if (stuckResponse.data.count > 0) {
      console.log('   Sample:', stuckResponse.data.stuckOrders[0]);
    }
    console.log('');

    // Test 2: Run healing cycle
    console.log('2️⃣ Running healing cycle...');
    const cycleResponse = await axios.post(
      `${BASE_URL}/self-healing/run-cycle`,
      {},
      config
    );
    console.log('✅ Healing cycle completed');
    console.log('   Healed:', cycleResponse.data.result.healed);
    console.log('   Failed:', cycleResponse.data.result.failed);
    console.log('');

    // Test 3: Get healing statistics
    console.log('3️⃣ Getting healing statistics (last 7 days)...');
    const statsResponse = await axios.get(
      `${BASE_URL}/self-healing/statistics?days=7`,
      config
    );
    console.log('✅ Statistics retrieved');
    if (statsResponse.data.statistics.length > 0) {
      console.log('   Sample stat:', statsResponse.data.statistics[0]);
    }
    console.log('');

    // Test 4: Get pending notifications
    console.log('4️⃣ Getting pending admin notifications...');
    const notificationsResponse = await axios.get(
      `${BASE_URL}/self-healing/notifications`,
      config
    );
    console.log('✅ Notifications retrieved:', notificationsResponse.data.count);
    if (notificationsResponse.data.count > 0) {
      console.log('   Sample notification:');
      const notif = notificationsResponse.data.notifications[0];
      console.log('   - Type:', notif.notification_type);
      console.log('   - Severity:', notif.severity);
      console.log('   - Title:', notif.title);
    }
    console.log('');

    // Test 5: Manual healing (if stuck orders exist)
    if (stuckResponse.data.count > 0) {
      const stuckOrder = stuckResponse.data.stuckOrders[0];
      console.log('5️⃣ Testing manual healing...');
      console.log('   Order ID:', stuckOrder.order_id);
      console.log('   Issue:', stuckOrder.issue_type);
      console.log('   Recommended action:', stuckOrder.recommended_action);

      try {
        const healResponse = await axios.post(
          `${BASE_URL}/self-healing/heal/${stuckOrder.order_id}`,
          {
            issueType: stuckOrder.issue_type,
            recoveryAction: stuckOrder.recommended_action,
          },
          config
        );
        console.log('✅ Manual healing completed');
        console.log('   Result:', healResponse.data.result);
      } catch (error) {
        console.log('⚠️  Manual healing failed (expected if order already healed)');
      }
      console.log('');
    }

    console.log('✅ All self-healing tests completed successfully!\n');

    // Summary
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    console.log('Stuck Orders Detected:', stuckResponse.data.count);
    console.log('Orders Healed:', cycleResponse.data.result.healed);
    console.log('Healing Failed:', cycleResponse.data.result.failed);
    console.log('Pending Notifications:', notificationsResponse.data.count);
    console.log('Statistics Records:', statsResponse.data.statistics.length);
    console.log('═══════════════════════════════════════════════════\n');

    // Display healing statistics
    if (statsResponse.data.statistics.length > 0) {
      console.log('📈 HEALING STATISTICS (Last 7 Days)');
      console.log('═══════════════════════════════════════════════════');
      statsResponse.data.statistics.forEach((stat) => {
        console.log(`\n${stat.issue_type} - ${stat.recovery_action}`);
        console.log(`  Status: ${stat.recovery_status}`);
        console.log(`  Total Cases: ${stat.total_cases}`);
        console.log(`  Successful: ${stat.successful_recoveries}`);
        console.log(`  Failed: ${stat.failed_recoveries}`);
        if (stat.avg_recovery_time_minutes) {
          console.log(
            `  Avg Recovery Time: ${parseFloat(stat.avg_recovery_time_minutes).toFixed(2)} minutes`
          );
        }
      });
      console.log('═══════════════════════════════════════════════════\n');
    }

    // Display notifications
    if (notificationsResponse.data.count > 0) {
      console.log('🔔 PENDING ADMIN NOTIFICATIONS');
      console.log('═══════════════════════════════════════════════════');
      notificationsResponse.data.notifications.slice(0, 5).forEach((notif) => {
        console.log(`\n[${notif.severity}] ${notif.title}`);
        console.log(`  Type: ${notif.notification_type}`);
        console.log(`  Message: ${notif.message}`);
        console.log(`  Created: ${new Date(notif.created_at).toLocaleString()}`);
      });
      console.log('═══════════════════════════════════════════════════\n');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run tests
testSelfHealing();
