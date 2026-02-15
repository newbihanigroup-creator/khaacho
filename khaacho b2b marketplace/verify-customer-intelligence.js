/**
 * Customer Intelligence Deployment Verification
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Customer Intelligence Deployment...\n');

const checks = {
  passed: 0,
  failed: 0,
};

function pass(message) {
  console.log(`✅ ${message}`);
  checks.passed++;
}

function fail(message) {
  console.log(`❌ ${message}`);
  checks.failed++;
}

// Check 1: Migration exists
console.log('📦 Checking Migration...');
if (fs.existsSync('prisma/migrations/043_customer_intelligence.sql')) {
  pass('Migration file exists');
} else {
  fail('Migration file missing');
}

// Check 2: Service exists
console.log('\n🔧 Checking Service...');
if (fs.existsSync('src/services/customerIntelligence.service.js')) {
  pass('Service file exists');
  
  const serviceContent = fs.readFileSync('src/services/customerIntelligence.service.js', 'utf8');
  
  if (serviceContent.includes('getCustomerMemory')) {
    pass('getCustomerMemory method exists');
  } else {
    fail('getCustomerMemory method missing');
  }
  
  if (serviceContent.includes('generateQuickReorderSuggestion')) {
    pass('generateQuickReorderSuggestion method exists');
  } else {
    fail('generateQuickReorderSuggestion method missing');
  }
  
  if (serviceContent.includes('sendQuickReorderSuggestion')) {
    pass('sendQuickReorderSuggestion method exists');
  } else {
    fail('sendQuickReorderSuggestion method missing');
  }
} else {
  fail('Service file missing');
}

// Check 3: Controller exists
console.log('\n🎮 Checking Controller...');
if (fs.existsSync('src/controllers/customerIntelligence.controller.js')) {
  pass('Controller file exists');
} else {
  fail('Controller file missing');
}

// Check 4: Routes exist
console.log('\n🛣️  Checking Routes...');
if (fs.existsSync('src/routes/customerIntelligence.routes.js')) {
  pass('Routes file exists');
} else {
  fail('Routes file missing');
}

// Check 5: Worker exists
console.log('\n⚙️  Checking Worker...');
if (fs.existsSync('src/workers/customerIntelligence.worker.js')) {
  pass('Worker file exists');
  
  const workerContent = fs.readFileSync('src/workers/customerIntelligence.worker.js', 'utf8');
  
  if (workerContent.includes('sendQuickReorderSuggestions')) {
    pass('sendQuickReorderSuggestions job exists');
  } else {
    fail('sendQuickReorderSuggestions job missing');
  }
  
  if (workerContent.includes('refreshAnalytics')) {
    pass('refreshAnalytics job exists');
  } else {
    fail('refreshAnalytics job missing');
  }
  
  if (workerContent.includes('cleanupExpiredContexts')) {
    pass('cleanupExpiredContexts job exists');
  } else {
    fail('cleanupExpiredContexts job missing');
  }
} else {
  fail('Worker file missing');
}

// Check 6: Routes integrated
console.log('\n🔗 Checking Route Integration...');
const indexRoutes = fs.readFileSync('src/routes/index.js', 'utf8');

if (indexRoutes.includes("require('./customerIntelligence.routes')")) {
  pass('Routes imported in index.js');
} else {
  fail('Routes not imported in index.js');
}

if (indexRoutes.includes("router.use('/customer-intelligence', customerIntelligenceRoutes)")) {
  pass('Routes mounted in index.js');
} else {
  fail('Routes not mounted in index.js');
}

// Check 7: Worker initialized
console.log('\n🚀 Checking Worker Initialization...');
const serverFile = fs.readFileSync('src/server.js', 'utf8');

if (serverFile.includes("require('./workers/customerIntelligence.worker')")) {
  pass('Worker imported in server.js');
} else {
  fail('Worker not imported in server.js');
}

if (serverFile.includes('customerIntelligenceWorker.start()')) {
  pass('Worker started in server.js');
} else {
  fail('Worker not started in server.js');
}

// Check 8: Test file exists
console.log('\n🧪 Checking Test File...');
if (fs.existsSync('test-customer-intelligence.js')) {
  pass('Test file exists');
} else {
  fail('Test file missing');
}

// Check 9: Documentation exists
console.log('\n📚 Checking Documentation...');
const docs = [
  'CUSTOMER_INTELLIGENCE_COMPLETE.md',
  'CUSTOMER_INTELLIGENCE_QUICK_START.md',
  'CUSTOMER_INTELLIGENCE_SUMMARY.md',
];

docs.forEach(doc => {
  if (fs.existsSync(doc)) {
    pass(`Documentation exists: ${doc}`);
  } else {
    fail(`Documentation missing: ${doc}`);
  }
});

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 VERIFICATION SUMMARY');
console.log('='.repeat(60));
console.log(`✅ Passed: ${checks.passed}`);
console.log(`❌ Failed: ${checks.failed}`);
console.log('='.repeat(60));

if (checks.failed === 0) {
  console.log('\n🎉 All checks passed! Customer Intelligence is ready for deployment.');
  console.log('\n📋 Next Steps:');
  console.log('1. Apply migration: npx prisma migrate deploy');
  console.log('2. Restart server: npm start');
  console.log('3. Run tests: node test-customer-intelligence.js');
  console.log('4. Monitor worker logs');
  console.log('5. Check first suggestions sent');
  console.log('');
  console.log('📊 Key Features:');
  console.log('✅ Remembers previous orders');
  console.log('✅ Suggests repeat orders');
  console.log('✅ Detects frequent buyers (DAILY/WEEKLY/MONTHLY)');
  console.log('✅ Quick reorder with "Order same as last week?"');
  console.log('✅ WhatsApp integration');
  console.log('✅ Automatic worker (every 2 hours)');
  console.log('✅ Response handling (YES/NO/MODIFY)');
  console.log('✅ Analytics and metrics');
  console.log('');
  process.exit(0);
} else {
  console.log('\n⚠️  Some checks failed. Please fix issues before deployment.');
  process.exit(1);
}
