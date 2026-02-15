/**
 * Test Order Optimization Service
 * 
 * Tests the order optimization algorithm
 * Run with: node test-order-optimization.js
 */

require('dotenv').config();
const orderOptimizationService = require('./src/services/orderOptimization.service');
const prisma = require('./src/config/database');

async function testOrderOptimization() {
  console.log('🧪 Testing Order Optimization Service\n');
  console.log('═'.repeat(70));
  console.log('');

  try {
    // Check database connection
    await prisma.$connect();
    console.log('✅ Database connected\n');

    // Get sample products for testing
    console.log('📦 Finding products for testing...\n');
    
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        vendorProducts: {
          some: {
            isAvailable: true,
            deletedAt: null,
          },
        },
      },
      take: 5,
      select: {
        id: true,
        name: true,
        productCode: true,
        unit: true,
      },
    });

    if (products.length === 0) {
      console.log('⚠️  No products found with available vendors');
      console.log('Please ensure you have products and vendors in the database\n');
      process.exit(1);
    }

    console.log(`✅ Found ${products.length} products for testing:\n`);
    products.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} (${product.productCode})`);
    });
    console.log('');

    // Create test order items
    const items = products.map(product => ({
      productId: product.id,
      quantity: Math.floor(Math.random() * 50) + 10, // Random quantity 10-60
      unit: product.unit,
    }));

    console.log('═'.repeat(70));
    console.log('TEST 1: Balanced Strategy (Default)');
    console.log('═'.repeat(70));
    console.log('');

    const startTime1 = Date.now();
    const balancedPlan = await orderOptimizationService.optimizeOrder(items, {
      strategy: 'balanced',
    });
    const duration1 = Date.now() - startTime1;

    console.log(`✅ Optimization completed in ${duration1}ms\n`);
    displayPlan(balancedPlan, 'Balanced');

    console.log('\n' + '═'.repeat(70));
    console.log('TEST 2: Cheapest Strategy');
    console.log('═'.repeat(70));
    console.log('');

    const startTime2 = Date.now();
    const cheapestPlan = await orderOptimizationService.optimizeOrder(items, {
      strategy: 'cheapest',
    });
    const duration2 = Date.now() - startTime2;

    console.log(`✅ Optimization completed in ${duration2}ms\n`);
    displayPlan(cheapestPlan, 'Cheapest');

    console.log('\n' + '═'.repeat(70));
    console.log('TEST 3: Most Reliable Strategy');
    console.log('═'.repeat(70));
    console.log('');

    const startTime3 = Date.now();
    const reliablePlan = await orderOptimizationService.optimizeOrder(items, {
      strategy: 'most_reliable',
    });
    const duration3 = Date.now() - startTime3;

    console.log(`✅ Optimization completed in ${duration3}ms\n`);
    displayPlan(reliablePlan, 'Most Reliable');

    console.log('\n' + '═'.repeat(70));
    console.log('TEST 4: Strategy Comparison');
    console.log('═'.repeat(70));
    console.log('');

    const comparison = await orderOptimizationService.compareStrategies(items);
    
    console.log('📊 Strategy Comparison:\n');
    console.log('Strategy          | Total Cost | Avg Reliability | Suppliers | Savings');
    console.log('─'.repeat(70));
    
    Object.entries(comparison.strategies).forEach(([strategy, result]) => {
      if (result.error) {
        console.log(`${strategy.padEnd(17)} | ERROR: ${result.error}`);
      } else {
        console.log(
          `${strategy.padEnd(17)} | ` +
          `Rs. ${result.totalCost.toFixed(2).padEnd(10)} | ` +
          `${result.avgReliabilityScore.toFixed(2).padEnd(15)} | ` +
          `${result.suppliersUsed.toString().padEnd(9)} | ` +
          `${result.savingsPercentage.toFixed(2)}%`
        );
      }
    });

    console.log('');
    console.log(`✅ Recommended Strategy: ${comparison.recommendation}`);

    console.log('\n' + '═'.repeat(70));
    console.log('TEST 5: Validation');
    console.log('═'.repeat(70));
    console.log('');

    const validation = orderOptimizationService.validateAllocationPlan(balancedPlan);
    
    console.log(`Validation Result: ${validation.valid ? '✅ VALID' : '❌ INVALID'}\n`);
    
    if (validation.issues.length > 0) {
      console.log('Issues Found:');
      validation.issues.forEach((issue, index) => {
        console.log(`\n${index + 1}. [${issue.severity.toUpperCase()}] ${issue.message}`);
        if (issue.items) {
          console.log(`   Affected items: ${issue.items.length}`);
        }
        if (issue.suppliers) {
          console.log(`   Affected suppliers: ${issue.suppliers.length}`);
        }
      });
    } else {
      console.log('✅ No issues found');
    }

    console.log('\n' + '═'.repeat(70));
    console.log('📊 Summary');
    console.log('═'.repeat(70));
    console.log('');

    console.log('Performance:');
    console.log(`  Balanced:      ${duration1}ms`);
    console.log(`  Cheapest:      ${duration2}ms`);
    console.log(`  Most Reliable: ${duration3}ms`);
    console.log('');

    console.log('Cost Comparison:');
    console.log(`  Balanced:      Rs. ${balancedPlan.totalCost.toFixed(2)}`);
    console.log(`  Cheapest:      Rs. ${cheapestPlan.totalCost.toFixed(2)}`);
    console.log(`  Most Reliable: Rs. ${reliablePlan.totalCost.toFixed(2)}`);
    console.log(`  Difference:    Rs. ${Math.abs(cheapestPlan.totalCost - reliablePlan.totalCost).toFixed(2)}`);
    console.log('');

    console.log('Reliability Comparison:');
    console.log(`  Balanced:      ${balancedPlan.avgReliabilityScore.toFixed(2)}`);
    console.log(`  Cheapest:      ${cheapestPlan.avgReliabilityScore.toFixed(2)}`);
    console.log(`  Most Reliable: ${reliablePlan.avgReliabilityScore.toFixed(2)}`);
    console.log('');

    console.log('💡 Usage Example:');
    console.log(`
const orderOptimizationService = require('./src/services/orderOptimization.service');

const items = [
  { productId: 'uuid', quantity: 10, unit: 'kg' },
  { productId: 'uuid', quantity: 5, unit: 'L' },
];

// Optimize with balanced strategy
const plan = await orderOptimizationService.optimizeOrder(items, {
  strategy: 'balanced',
  maxSuppliersPerProduct: 10,
});

console.log('Total Cost:', plan.totalCost);
console.log('Suppliers:', plan.suppliersUsed);
console.log('Avg Reliability:', plan.avgReliabilityScore);

// Use the allocation
plan.suppliers.forEach(supplier => {
  console.log(\`Order from \${supplier.vendorName}:\`);
  supplier.items.forEach(item => {
    console.log(\`  - \${item.productName}: \${item.quantity} \${item.unit} @ Rs. \${item.price}\`);
  });
});
`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('\n✅ Database disconnected');
  }

  console.log('\n✅ All tests completed!\n');
}

function displayPlan(plan, strategyName) {
  console.log(`📋 ${strategyName} Strategy Results:\n`);
  
  console.log('Summary:');
  console.log(`  Total Cost:        Rs. ${plan.totalCost.toFixed(2)}`);
  console.log(`  Total Items:       ${plan.totalItems}`);
  console.log(`  Suppliers Used:    ${plan.suppliersUsed}`);
  console.log(`  Avg Reliability:   ${plan.avgReliabilityScore.toFixed(2)}`);
  console.log(`  Savings:           Rs. ${plan.savings.toFixed(2)} (${plan.savingsPercentage.toFixed(2)}%)`);
  
  if (plan.unallocatedItems.length > 0) {
    console.log(`  ⚠️  Unallocated:     ${plan.unallocatedItems.length} items`);
  }
  
  console.log('');
  
  if (plan.suppliers.length > 0) {
    console.log('Supplier Allocation:');
    console.log('─'.repeat(70));
    
    plan.suppliers.forEach((supplier, index) => {
      console.log(`\n${index + 1}. ${supplier.vendorName} (${supplier.vendorCode})`);
      console.log(`   Reliability: ${supplier.reliabilityScore.toFixed(2)}`);
      console.log(`   Subtotal: Rs. ${supplier.subtotal.toFixed(2)}`);
      console.log(`   Items:`);
      
      supplier.items.forEach(item => {
        console.log(
          `     - ${item.productName}: ${item.quantity} ${item.unit} ` +
          `@ Rs. ${item.price.toFixed(2)} = Rs. ${item.cost.toFixed(2)}`
        );
      });
    });
  }
  
  if (plan.unallocatedItems.length > 0) {
    console.log('\n⚠️  Unallocated Items:');
    plan.unallocatedItems.forEach(item => {
      console.log(`  - Product ${item.productId}: ${item.quantity} units (${item.reason})`);
    });
  }
}

// Run tests
testOrderOptimization();
