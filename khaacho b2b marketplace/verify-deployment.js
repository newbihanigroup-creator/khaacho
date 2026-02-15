/**
 * Deployment Verification Script
 * 
 * Verifies all 4 new systems are properly integrated and ready for deployment
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Deployment Readiness...\n');

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0
};

function pass(message) {
  console.log(`✅ ${message}`);
  checks.passed++;
}

function fail(message) {
  console.log(`❌ ${message}`);
  checks.failed++;
}

function warn(message) {
  console.log(`⚠️  ${message}`);
  checks.warnings++;
}

// Check 1: Migrations exist
console.log('📦 Checking Migrations...');
const migrations = [
  'prisma/migrations/039_safe_mode_system.sql',
  'prisma/migrations/040_vendor_scoring_system.sql',
  'prisma/migrations/041_order_batching_system.sql',
  'prisma/migrations/042_enhanced_order_parsing.sql'
];

migrations.forEach(migration => {
  if (fs.existsSync(migration)) {
    pass(`Migration exists: ${path.basename(migration)}`);
  } else {
    fail(`Migration missing: ${path.basename(migration)}`);
  }
});

// Check 2: Services exist
console.log('\n🔧 Checking Services...');
const services = [
  'src/services/safeMode.service.js',
  'src/services/vendorScoring.service.js',
  'src/services/orderBatching.service.js',
  'src/services/multiModalOrderParser.service.js'
];

services.forEach(service => {
  if (fs.existsSync(service)) {
    pass(`Service exists: ${path.basename(service)}`);
  } else {
    fail(`Service missing: ${path.basename(service)}`);
  }
});

// Check 3: Controllers exist
console.log('\n🎮 Checking Controllers...');
const controllers = [
  'src/controllers/safeMode.controller.js',
  'src/controllers/vendorScoring.controller.js',
  'src/controllers/orderBatching.controller.js',
  'src/controllers/multiModalOrderParser.controller.js'
];

controllers.forEach(controller => {
  if (fs.existsSync(controller)) {
    pass(`Controller exists: ${path.basename(controller)}`);
  } else {
    fail(`Controller missing: ${path.basename(controller)}`);
  }
});

// Check 4: Routes exist
console.log('\n🛣️  Checking Routes...');
const routes = [
  'src/routes/safeMode.routes.js',
  'src/routes/vendorScoring.routes.js',
  'src/routes/orderBatching.routes.js',
  'src/routes/multiModalOrderParser.routes.js'
];

routes.forEach(route => {
  if (fs.existsSync(route)) {
    pass(`Route exists: ${path.basename(route)}`);
  } else {
    fail(`Route missing: ${path.basename(route)}`);
  }
});

// Check 5: Workers exist
console.log('\n⚙️  Checking Workers...');
const workers = [
  'src/workers/safeModeQueue.worker.js',
  'src/workers/vendorScoring.worker.js',
  'src/workers/orderBatching.worker.js'
];

workers.forEach(worker => {
  if (fs.existsSync(worker)) {
    pass(`Worker exists: ${path.basename(worker)}`);
  } else {
    fail(`Worker missing: ${path.basename(worker)}`);
  }
});

// Check 6: Routes integrated in index.js
console.log('\n🔗 Checking Route Integration...');
const indexRoutes = fs.readFileSync('src/routes/index.js', 'utf8');

const routeImports = [
  "require('./safeMode.routes')",
  "require('./vendorScoring.routes')",
  "require('./orderBatching.routes')",
  "require('./multiModalOrderParser.routes')"
];

const routeMounts = [
  "router.use('/admin/safe-mode', safeModeRoutes)",
  "router.use('/vendor-scoring', vendorScoringRoutes)",
  "router.use('/order-batching', orderBatchingRoutes)",
  "router.use('/order-parser', multiModalOrderParserRoutes)"
];

routeImports.forEach((importStr, idx) => {
  if (indexRoutes.includes(importStr)) {
    pass(`Route imported: ${['safeMode', 'vendorScoring', 'orderBatching', 'multiModalOrderParser'][idx]}`);
  } else {
    fail(`Route not imported: ${['safeMode', 'vendorScoring', 'orderBatching', 'multiModalOrderParser'][idx]}`);
  }
});

routeMounts.forEach((mountStr, idx) => {
  if (indexRoutes.includes(mountStr)) {
    pass(`Route mounted: ${['safe-mode', 'vendor-scoring', 'order-batching', 'order-parser'][idx]}`);
  } else {
    fail(`Route not mounted: ${['safe-mode', 'vendor-scoring', 'order-batching', 'order-parser'][idx]}`);
  }
});

// Check 7: Workers started in server.js
console.log('\n🚀 Checking Worker Initialization...');
const serverFile = fs.readFileSync('src/server.js', 'utf8');

const workerStarts = [
  "require('./workers/safeModeQueue.worker')",
  "require('./workers/vendorScoring.worker')",
  "require('./workers/orderBatching.worker')"
];

workerStarts.forEach((workerStr, idx) => {
  if (serverFile.includes(workerStr)) {
    pass(`Worker initialized: ${['safeModeQueue', 'vendorScoring', 'orderBatching'][idx]}`);
  } else {
    fail(`Worker not initialized: ${['safeModeQueue', 'vendorScoring', 'orderBatching'][idx]}`);
  }
});

// Check 8: Test files exist
console.log('\n🧪 Checking Test Files...');
const tests = [
  'test-safe-mode.js',
  'test-vendor-scoring.js',
  'test-order-batching.js',
  'test-multi-modal-parser.js'
];

tests.forEach(test => {
  if (fs.existsSync(test)) {
    pass(`Test exists: ${test}`);
  } else {
    warn(`Test missing: ${test}`);
  }
});

// Check 9: Documentation exists
console.log('\n📚 Checking Documentation...');
const docs = [
  'SAFE_MODE_COMPLETE.md',
  'VENDOR_SCORING_COMPLETE.md',
  'ORDER_BATCHING_COMPLETE.md',
  'MULTI_MODAL_PARSER_COMPLETE.md',
  'FINAL_SYSTEMS_IMPLEMENTATION_SUMMARY.md'
];

docs.forEach(doc => {
  if (fs.existsSync(doc)) {
    pass(`Documentation exists: ${doc}`);
  } else {
    warn(`Documentation missing: ${doc}`);
  }
});

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 VERIFICATION SUMMARY');
console.log('='.repeat(60));
console.log(`✅ Passed: ${checks.passed}`);
console.log(`❌ Failed: ${checks.failed}`);
console.log(`⚠️  Warnings: ${checks.warnings}`);
console.log('='.repeat(60));

if (checks.failed === 0) {
  console.log('\n🎉 All critical checks passed! Ready for deployment.');
  console.log('\n📋 Next Steps:');
  console.log('1. Apply migrations: npx prisma migrate deploy');
  console.log('2. Restart server: npm start');
  console.log('3. Run tests: node test-safe-mode.js');
  console.log('4. Monitor logs for worker initialization');
  console.log('5. Test API endpoints');
  process.exit(0);
} else {
  console.log('\n⚠️  Some checks failed. Please fix issues before deployment.');
  process.exit(1);
}
