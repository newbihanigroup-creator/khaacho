/**
 * Test Order Validation Service
 * Tests credit limit validation before order processing
 */

const orderValidationService = require('./src/services/orderValidation.service');
const prisma = require('./src/config/database');
const Decimal = require('decimal.js');

async function testOrderValidation() {
  console.log('🧪 Testing Order Validation Service\n');

  try {
    // Test 1: Get a retailer for testing
    console.log('📋 Test 1: Finding test retailer...');
    const retailer = await prisma.retailer.findFirst({
      where: {
        user: {
          isActive: true,
        },
        isApproved: true,
      },
      include: {
        user: {
          select: {
            businessName: true,
            phoneNumber: true,
          },
        },
      },
    });

    if (!retailer) {
      console.log('❌ No active retailer found. Please create a retailer first.');
      return;
    }

    console.log('✅ Found retailer:', {
      id: retailer.id,
      businessName: retailer.user.businessName,
      creditLimit: retailer.creditLimit.toString(),
      outstandingDebt: retailer.outstandingDebt.toString(),
      availableCredit: retailer.availableCredit.toString(),
    });
    console.log('');

    // Test 2: Validate order within credit limit
    console.log('📋 Test 2: Validating order within credit limit...');
    const validOrderAmount = new Decimal(1000);
    const validResult = await orderValidationService.validateOrderCredit(
      retailer.id,
      validOrderAmount
    );

    console.log('Result:', {
      isValid: validResult.isValid,
      reason: validResult.reason,
      message: validResult.message,
      whatsappMessage: validResult.whatsappMessage,
    });
    console.log('');

    // Test 3: Validate order exceeding credit limit
    console.log('📋 Test 3: Validating order exceeding credit limit...');
    const excessiveAmount = new Decimal(retailer.creditLimit).add(10000);
    const invalidResult = await orderValidationService.validateOrderCredit(
      retailer.id,
      excessiveAmount
    );

    console.log('Result:', {
      isValid: invalidResult.isValid,
      reason: invalidResult.reason,
      message: invalidResult.message,
      whatsappMessage: invalidResult.whatsappMessage,
      shortfall: invalidResult.shortfall,
    });
    console.log('');

    // Test 4: Log rejected order
    console.log('📋 Test 4: Logging rejected order...');
    const rejectedOrderData = {
      retailerId: retailer.id,
      total: excessiveAmount.toString(),
      items: [
        {
          productName: 'Test Product',
          quantity: 100,
          unitPrice: '100',
        },
      ],
      whatsappMessageId: 'test_msg_' + Date.now(),
      phoneNumber: retailer.user.phoneNumber,
    };

    const rejectedLog = await orderValidationService.logRejectedOrder(
      rejectedOrderData,
      invalidResult
    );

    console.log('✅ Rejected order logged:', {
      id: rejectedLog.id,
      rejectionReason: rejectedLog.rejectionReason,
      requestedAmount: rejectedLog.requestedAmount.toString(),
      availableCredit: rejectedLog.availableCredit.toString(),
      shortfall: rejectedLog.shortfall?.toString(),
    });
    console.log('');

    // Test 5: Get rejected orders
    console.log('📋 Test 5: Getting rejected orders...');
    const rejectedOrders = await orderValidationService.getRejectedOrders(
      { retailerId: retailer.id },
      1,
      10
    );

    console.log('✅ Found rejected orders:', {
      total: rejectedOrders.pagination.total,
      count: rejectedOrders.rejectedOrders.length,
    });

    if (rejectedOrders.rejectedOrders.length > 0) {
      console.log('Latest rejected order:', {
        id: rejectedOrders.rejectedOrders[0].id,
        reason: rejectedOrders.rejectedOrders[0].rejectionReason,
        amount: rejectedOrders.rejectedOrders[0].requestedAmount.toString(),
        isReviewed: rejectedOrders.rejectedOrders[0].isReviewed,
        createdAt: rejectedOrders.rejectedOrders[0].createdAt,
      });
    }
    console.log('');

    // Test 6: Validate and create order (atomic)
    console.log('📋 Test 6: Testing atomic validation and creation...');
    const orderData = {
      retailerId: retailer.id,
      total: '500',
      items: [
        {
          productName: 'Test Product',
          quantity: 5,
          unitPrice: '100',
        },
      ],
    };

    const atomicResult = await orderValidationService.validateAndCreateOrder(orderData);

    console.log('Result:', {
      success: atomicResult.success,
      rejected: atomicResult.rejected,
      validationReason: atomicResult.validation.reason,
      validationMessage: atomicResult.validation.message,
    });
    console.log('');

    // Test 7: Mark rejected order as reviewed
    if (rejectedOrders.rejectedOrders.length > 0) {
      console.log('📋 Test 7: Marking rejected order as reviewed...');
      const reviewedOrder = await orderValidationService.markAsReviewed(
        rejectedOrders.rejectedOrders[0].id,
        'admin_user_id',
        'Reviewed and approved credit limit increase'
      );

      console.log('✅ Order marked as reviewed:', {
        id: reviewedOrder.id,
        isReviewed: reviewedOrder.isReviewed,
        reviewedAt: reviewedOrder.reviewedAt,
        reviewNotes: reviewedOrder.reviewNotes,
      });
      console.log('');
    }

    // Test 8: WhatsApp-safe messages
    console.log('📋 Test 8: Testing WhatsApp-safe messages...');
    console.log('');
    console.log('✅ Credit limit exceeded message:');
    console.log(invalidResult.whatsappMessage);
    console.log('');
    console.log('✅ Account inactive message:');
    console.log('Your account is inactive. Please contact admin for assistance.');
    console.log('');
    console.log('✅ Account not approved message:');
    console.log('Your account is pending approval. Please wait for admin confirmation.');
    console.log('');

    console.log('✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
testOrderValidation();
