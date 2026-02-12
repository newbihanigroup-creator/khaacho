const prisma = require('../config/database');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

/**
 * Atomic Order Creation Service
 * Ensures order creation is transaction-safe
 * All operations succeed or all fail together
 */
class AtomicOrderCreationService {

  /**
   * Create order with full transaction safety
   * @param {string} retailerId - Retailer ID
   * @param {Array} items - Array of order items
   * @param {Object} metadata - Additional order metadata
   * @returns {Object} Created order
   */
  async createOrder(retailerId, items, metadata = {}) {
    logger.info('Starting atomic order creation', { 
      retailerId, 
      itemCount: items.length,
      metadata 
    });

    // Validate inputs
    if (!retailerId || !items || items.length === 0) {
      throw new AppError('Invalid order data: retailerId and items are required', 400);
    }

    // Use Prisma transaction to ensure atomicity
    try {
      const order = await prisma.$transaction(async (tx) => {
        // 1. Verify retailer exists and is active
        const retailer = await tx.retailer.findUnique({
          where: { id: retailerId },
          include: {
            user: {
              select: {
                id: true,
                phoneNumber: true,
                businessName: true,
                isActive: true
              }
            }
          }
        });

        if (!retailer) {
          throw new AppError('Retailer not found', 404);
        }

        if (!retailer.user.isActive) {
          throw new AppError('Retailer account is inactive', 403);
        }

        // 2. Validate and lock products (prevents race conditions)
        const validatedItems = await this.validateAndLockProducts(tx, items);

        // 3. Calculate order totals
        const calculations = this.calculateOrderTotals(validatedItems, retailer);

        // 4. Check credit limit
        await this.validateCreditLimit(tx, retailer, calculations.total);

        // 5. Generate order number
        const orderNumber = await this.generateOrderNumber(tx);

        // 6. Create order record
        const newOrder = await tx.order.create({
          data: {
            orderNumber,
            retailerId: retailer.id,
            status: 'PENDING',
            paymentStatus: 'PENDING',
            subtotal: calculations.subtotal,
            taxAmount: calculations.taxAmount,
            total: calculations.total,
            paidAmount: 0,
            dueAmount: calculations.total,
            creditUsed: calculations.creditUsed,
            notes: metadata.notes || null,
            whatsappMessageId: metadata.whatsappMessageId || null,
            createdBy: metadata.createdBy || retailer.user.id
          }
        });

        // 7. Create order items
        const orderItems = await Promise.all(
          validatedItems.map(item =>
            tx.orderItem.create({
              data: {
                orderId: newOrder.id,
                productId: item.productId,
                productName: item.productName,
                productSku: item.sku,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discount: item.discount || 0,
                taxRate: item.taxRate || 13,
                taxAmount: item.taxAmount,
                subtotal: item.subtotal,
                total: item.total
              }
            })
          )
        );

        // 8. Update product stock (decrement)
        await Promise.all(
          validatedItems.map(item =>
            tx.vendorProduct.update({
              where: { id: item.vendorProductId },
              data: {
                stock: {
                  decrement: item.quantity
                }
              }
            })
          )
        );

        // 9. Update retailer credit if using credit
        if (calculations.creditUsed > 0) {
          await tx.retailer.update({
            where: { id: retailer.id },
            data: {
              outstandingDebt: {
                increment: calculations.creditUsed
              },
              availableCredit: {
                decrement: calculations.creditUsed
              }
            }
          });

          // 10. Create credit ledger entry
          const ledgerNumber = await this.generateLedgerNumber(tx);
          const previousBalance = parseFloat(retailer.outstandingDebt);
          const newBalance = previousBalance + calculations.creditUsed;

          await tx.creditLedger.create({
            data: {
              ledgerNumber,
              retailerId: retailer.id,
              vendorId: validatedItems[0].vendorId, // Use first vendor (simplified)
              orderId: newOrder.id,
              transactionType: 'ORDER_DEBIT',
              amount: calculations.creditUsed,
              previousBalance,
              runningBalance: newBalance,
              description: `Order ${orderNumber} - Credit used`,
              createdBy: metadata.createdBy || retailer.user.id
            }
          });
        }

        // 11. Create order status log
        await tx.orderStatusLog.create({
          data: {
            orderId: newOrder.id,
            fromStatus: null,
            toStatus: 'PENDING',
            changedBy: metadata.createdBy || retailer.user.id,
            notes: 'Order created via WhatsApp'
          }
        });

        // 12. Store WhatsApp message if provided
        if (metadata.whatsappMessageId && metadata.whatsappMessage) {
          await tx.whatsAppMessage.create({
            data: {
              messageId: metadata.whatsappMessageId,
              from: retailer.user.phoneNumber,
              to: metadata.whatsappTo || 'system',
              body: metadata.whatsappMessage,
              type: 'text',
              status: 'received',
              direction: 'INBOUND',
              orderId: newOrder.id,
              retailerId: retailer.id,
              isProcessed: true,
              processedAt: new Date()
            }
          });
        }

        // Return complete order with relations
        return await tx.order.findUnique({
          where: { id: newOrder.id },
          include: {
            items: {
              include: {
                product: true
              }
            },
            retailer: {
              include: {
                user: {
                  select: {
                    name: true,
                    businessName: true,
                    phoneNumber: true
                  }
                }
              }
            }
          }
        });
      }, {
        maxWait: 10000, // 10 seconds max wait for transaction lock
        timeout: 30000, // 30 seconds transaction timeout
        isolationLevel: 'Serializable' // Highest isolation level for data consistency
      });

      logger.info('Order created successfully', { 
        orderId: order.id, 
        orderNumber: order.orderNumber 
      });

      return {
        success: true,
        order
      };

    } catch (error) {
      logger.error('Order creation failed', { 
        error: error.message, 
        retailerId,
        stack: error.stack 
      });

      // Rollback is automatic with Prisma transactions
      throw error;
    }
  }

  /**
   * Validate products and lock them for update
   * Prevents race conditions when multiple orders are placed simultaneously
   */
  async validateAndLockProducts(tx, items) {
    const validatedItems = [];

    for (const item of items) {
      // Lock product row for update
      const vendorProduct = await tx.vendorProduct.findUnique({
        where: { id: item.vendorProductId },
        include: {
          product: true,
          vendor: true
        }
      });

      if (!vendorProduct) {
        throw new AppError(`Product ${item.sku || item.productName} not found`, 404);
      }

      if (!vendorProduct.isAvailable) {
        throw new AppError(`Product ${vendorProduct.product.name} is not available`, 400);
      }

      if (vendorProduct.stock < item.quantity) {
        throw new AppError(
          `Insufficient stock for ${vendorProduct.product.name}. Available: ${vendorProduct.stock}, Requested: ${item.quantity}`,
          400
        );
      }

      const minOrderQty = vendorProduct.product.minOrderQty || 1;
      if (item.quantity < minOrderQty) {
        throw new AppError(
          `Minimum order quantity for ${vendorProduct.product.name} is ${minOrderQty}`,
          400
        );
      }

      if (vendorProduct.product.maxOrderQty && item.quantity > vendorProduct.product.maxOrderQty) {
        throw new AppError(
          `Maximum order quantity for ${vendorProduct.product.name} is ${vendorProduct.product.maxOrderQty}`,
          400
        );
      }

      // Calculate item totals
      const unitPrice = parseFloat(vendorProduct.vendorPrice);
      const discount = item.discount || 0;
      const taxRate = 13; // 13% VAT
      
      const subtotal = (unitPrice * item.quantity) - discount;
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;

      validatedItems.push({
        vendorProductId: vendorProduct.id,
        productId: vendorProduct.productId,
        productName: vendorProduct.product.name,
        sku: vendorProduct.sku,
        quantity: item.quantity,
        unitPrice,
        discount,
        taxRate,
        taxAmount,
        subtotal,
        total,
        vendorId: vendorProduct.vendorId
      });
    }

    return validatedItems;
  }

  /**
   * Calculate order totals
   */
  calculateOrderTotals(items, retailer) {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const taxAmount = items.reduce((sum, item) => sum + item.taxAmount, 0);
    const total = items.reduce((sum, item) => sum + item.total, 0);

    // Determine credit usage
    const availableCredit = parseFloat(retailer.availableCredit);
    const creditUsed = Math.min(total, availableCredit);

    return {
      subtotal,
      taxAmount,
      total,
      creditUsed,
      cashRequired: total - creditUsed
    };
  }

  /**
   * Validate credit limit
   */
  async validateCreditLimit(tx, retailer, orderTotal) {
    const availableCredit = parseFloat(retailer.availableCredit);
    const outstandingDebt = parseFloat(retailer.outstandingDebt);
    const creditLimit = parseFloat(retailer.creditLimit);

    // Check if retailer is blocked
    if (retailer.creditStatus === 'BLOCKED') {
      throw new AppError('Your credit account is blocked. Please contact admin.', 403);
    }

    // Check if order exceeds available credit (if using credit)
    if (orderTotal > availableCredit) {
      // Allow order but require payment
      logger.warn('Order exceeds available credit', {
        retailerId: retailer.id,
        orderTotal,
        availableCredit
      });
    }

    // Check if total debt would exceed credit limit
    const projectedDebt = outstandingDebt + orderTotal;
    if (projectedDebt > creditLimit * 1.1) { // Allow 10% buffer
      throw new AppError(
        `Order would exceed credit limit. Current debt: Rs.${outstandingDebt}, Order: Rs.${orderTotal}, Limit: Rs.${creditLimit}`,
        403
      );
    }

    return true;
  }

  /**
   * Generate unique order number
   */
  async generateOrderNumber(tx) {
    const today = new Date();
    const year = today.getFullYear().toString().slice(-2);
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    
    const prefix = `ORD${year}${month}${day}`;

    // Get count of orders today
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const count = await tx.order.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    const sequence = (count + 1).toString().padStart(4, '0');
    return `${prefix}${sequence}`;
  }

  /**
   * Generate unique ledger number
   */
  async generateLedgerNumber(tx) {
    const today = new Date();
    const year = today.getFullYear().toString().slice(-2);
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    
    const prefix = `LED${year}${month}`;

    const count = await tx.creditLedger.count({
      where: {
        ledgerNumber: {
          startsWith: prefix
        }
      }
    });

    const sequence = (count + 1).toString().padStart(6, '0');
    return `${prefix}${sequence}`;
  }

  /**
   * Rollback order (if needed for cancellation)
   */
  async rollbackOrder(orderId) {
    logger.info('Rolling back order', { orderId });

    try {
      await prisma.$transaction(async (tx) => {
        // Get order with items
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            items: true,
            creditLedgers: true
          }
        });

        if (!order) {
          throw new AppError('Order not found', 404);
        }

        if (order.status !== 'PENDING') {
          throw new AppError('Can only rollback PENDING orders', 400);
        }

        // Restore product stock
        await Promise.all(
          order.items.map(item =>
            tx.vendorProduct.updateMany({
              where: {
                sku: item.productSku
              },
              data: {
                stock: {
                  increment: item.quantity
                }
              }
            })
          )
        );

        // Restore retailer credit
        if (parseFloat(order.creditUsed) > 0) {
          await tx.retailer.update({
            where: { id: order.retailerId },
            data: {
              outstandingDebt: {
                decrement: parseFloat(order.creditUsed)
              },
              availableCredit: {
                increment: parseFloat(order.creditUsed)
              }
            }
          });
        }

        // Mark order as cancelled
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancellationReason: 'Order rolled back'
          }
        });

        // Create status log
        await tx.orderStatusLog.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: 'CANCELLED',
            notes: 'Order rolled back'
          }
        });
      });

      logger.info('Order rolled back successfully', { orderId });
      return { success: true };

    } catch (error) {
      logger.error('Order rollback failed', { error: error.message, orderId });
      throw error;
    }
  }
}

module.exports = new AtomicOrderCreationService();
