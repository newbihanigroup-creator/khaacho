/**
 * Self-Healing System Verification Script
 * Verifies all components are properly integrated
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Self-Healing System Integration\n');

let passCount = 0;
let failCount = 0;

function check(description, condition) {
  if (condition) {
    console.log(`✅ ${description}`);
    passCount++;
  } else {
    console.log(`❌ ${description}`);
    failCount++;
  }
}

// Check files exist
console.log('📁 Checking Files...');
check(
  'Migration file exists',
  fs.existsSync('prisma/migrations/045_self_healing_system.sql')
);
check(
  'Service file exists',
  fs.existsSync('src/services/selfHealing.service.js')
);
check(
  'Controller file exists',
  fs.existsSync('src/controllers/selfHealing.controller.js')
);
check(
  'Routes file exists',
  fs.existsSync('src/routes/selfHealing.routes.js')
);
check(
  'Worker file exists',
  fs.existsSync('src/workers/selfHealing.worker.js')
);
check(
  'Test file exists',
  fs.existsSync('test-self-healing.js')
);
console.log('');

// Check documentation
console.log('📚 Checking Documentation...');
check(
  'Complete guide exists',
  fs.existsSync('SELF_HEALING_COMPLETE.md')
);
check(
  'Quick start guide exists',
  fs.existsSync('SELF_HEALING_QUICK_START.md')
);
check(
  'Summary exists',
  fs.existsSync('SELF_HEALING_SUMMARY.md')
);
console.log('');

// Check integration
console.log('🔗 Checking Integration...');

// Check routes integration
const routesFile = fs.readFileSync('src/routes/index.js', 'utf8');
check(
  'Routes imported in index.js',
  routesFile.includes("require('./selfHealing.routes')")
);
check(
  'Routes mounted in index.js',
  routesFile.includes("router.use('/self-healing', selfHealingRoutes)")
);

// Check server integration
const serverFile = fs.readFileSync('src/server.js', 'utf8');
check(
  'Worker imported in server.js',
  serverFile.includes("require('./workers/selfHealing.worker')")
);
check(
  'Worker started in server.js',
  serverFile.includes('selfHealingWorker.start()')
);
console.log('');

// Check migration content
console.log('🗄️ Checking Migration...');
const migrationFile = fs.readFileSync(
  'prisma/migrations/045_self_healing_system.sql',
  'utf8'
);
check(
  'healing_actions table created',
  migrationFile.includes('CREATE TABLE IF NOT EXISTS healing_actions')
);
check(
  'admin_notifications table created',
  migrationFile.includes('CREATE TABLE IF NOT EXISTS admin_notifications')
);
check(
  'healing_metrics table created',
  migrationFile.includes('CREATE TABLE IF NOT EXISTS healing_metrics')
);
check(
  'stuck_orders_view created',
  migrationFile.includes('CREATE OR REPLACE VIEW stuck_orders_view')
);
check(
  'detect_stuck_orders function created',
  migrationFile.includes('CREATE OR REPLACE FUNCTION detect_stuck_orders()')
);
check(
  'auto_heal_order function created',
  migrationFile.includes('CREATE OR REPLACE FUNCTION auto_heal_order(')
);
console.log('');

// Check service implementation
console.log('⚙️ Checking Service Implementation...');
const serviceFile = fs.readFileSync(
  'src/services/selfHealing.service.js',
  'utf8'
);
check(
  'detectStuckOrders method exists',
  serviceFile.includes('async detectStuckOrders()')
);
check(
  'initiateHealing method exists',
  serviceFile.includes('async initiateHealing(')
);
check(
  'executeHealing method exists',
  serviceFile.includes('async executeHealing(')
);
check(
  'reassignVendor method exists',
  serviceFile.includes('async reassignVendor(')
);
check(
  'retryWorkflow method exists',
  serviceFile.includes('async retryWorkflow(')
);
check(
  'cancelOrder method exists',
  serviceFile.includes('async cancelOrder(')
);
check(
  'requestManualIntervention method exists',
  serviceFile.includes('async requestManualIntervention(')
);
check(
  'runHealingCycle method exists',
  serviceFile.includes('async runHealingCycle()')
);
console.log('');

// Check controller implementation
console.log('🎮 Checking Controller Implementation...');
const controllerFile = fs.readFileSync(
  'src/controllers/selfHealing.controller.js',
  'utf8'
);
check(
  'detectStuckOrders endpoint exists',
  controllerFile.includes('async detectStuckOrders(')
);
check(
  'healOrder endpoint exists',
  controllerFile.includes('async healOrder(')
);
check(
  'runHealingCycle endpoint exists',
  controllerFile.includes('async runHealingCycle(')
);
check(
  'getStatistics endpoint exists',
  controllerFile.includes('async getStatistics(')
);
check(
  'getPendingNotifications endpoint exists',
  controllerFile.includes('async getPendingNotifications(')
);
console.log('');

// Check routes implementation
console.log('🛣️ Checking Routes Implementation...');
const routesFileContent = fs.readFileSync(
  'src/routes/selfHealing.routes.js',
  'utf8'
);
check(
  'GET /stuck-orders route exists',
  routesFileContent.includes("'/stuck-orders'")
);
check(
  'POST /heal/:orderId route exists',
  routesFileContent.includes("'/heal/:orderId'")
);
check(
  'POST /run-cycle route exists',
  routesFileContent.includes("'/run-cycle'")
);
check(
  'GET /statistics route exists',
  routesFileContent.includes("'/statistics'")
);
check(
  'GET /notifications route exists',
  routesFileContent.includes("'/notifications'")
);
console.log('');

// Check worker implementation
console.log('⏰ Checking Worker Implementation...');
const workerFile = fs.readFileSync(
  'src/workers/selfHealing.worker.js',
  'utf8'
);
check(
  'Cron schedule configured',
  workerFile.includes("cron.schedule('*/5 * * * *'")
);
check(
  'runHealingCycle function exists',
  workerFile.includes('async function runHealingCycle()')
);
check(
  'updateDailyMetrics function exists',
  workerFile.includes('async function updateDailyMetrics(')
);
check(
  'Worker start function exists',
  workerFile.includes('function start()')
);
check(
  'Startup delay configured',
  workerFile.includes('setTimeout(')
);
console.log('');

// Summary
console.log('═══════════════════════════════════════════════════');
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log(`📊 Total: ${passCount + failCount}`);
console.log('═══════════════════════════════════════════════════\n');

if (failCount === 0) {
  console.log('🎉 All checks passed! Self-healing system is properly integrated.\n');
  console.log('Next steps:');
  console.log('1. Apply migration: npx prisma migrate deploy');
  console.log('2. Start server: npm start');
  console.log('3. Run tests: node test-self-healing.js');
  console.log('4. Monitor logs: tail -f logs/combined-*.log | grep "Self-healing"\n');
} else {
  console.log('⚠️  Some checks failed. Please review the errors above.\n');
  process.exit(1);
}
