const prisma = require('../config/database');
const logger = require('../utils/logger');

class VendorInventoryService {
  async findAvailableVendors(productName, requestedQuantity) {
    try {
      console.log(`🔍 Finding vendors with available stock for: ${productName} (qty: ${requestedQuantity})`);
      
      // First, find the product
      const product = await prisma.product.findFirst({
        where: {
          OR: [
            { name: { contains: productName, mode: 'insensitive' } },
            { productCode: { contains: productName, mode: 'insensitive' } }
          ]
        }
      });

      if (!product) {
        console.log(`❌ Product not found: ${productName}`);
        return [];
      }

      // Find vendors with available inventory for this product
      const availableVendors = await prisma.vendorInventory.findMany({
        where: {
          productId: product.id,
          status: 'AVAILABLE',
          availableQuantity: { gte: requestedQuantity },
          isActive: true,
          vendor: {
            isApproved: true,
            deletedAt: null
          }
        },
        include: {
          vendor: {
            include: {
              user: {
                select: {
                  businessName: true,
                  phoneNumber: true
                }
              }
            }
          },
          product: {
            select: {
              name: true,
              category: true,
              unit: true
            }
          }
        },
        orderBy: [
          { price: 'asc' }, // Cheapest first
          { availableQuantity: 'desc' } // Most stock first
        ]
      });

      console.log(`✅ Found ${availableVendors.length} vendors with available stock`);
      
      return availableVendors.map(inv => ({
        vendorId: inv.vendorId,
        vendorName: inv.vendor.user.businessName,
        vendorPhone: inv.vendor.user.phoneNumber,
        price: inv.price,
        availableQuantity: inv.availableQuantity,
        productId: inv.productId,
        productName: inv.product.name,
        productCategory: inv.product.category,
        unit: inv.product.unit,
        canFulfill: inv.availableQuantity >= requestedQuantity,
        fulfillmentRatio: inv.availableQuantity / requestedQuantity
      }));

    } catch (error) {
      logger.error('Error finding available vendors', {
        productName,
        requestedQuantity,
        error: error.message
      });
      return [];
    }
  }

  async reduceStockOnOrderAcceptance(orderId, vendorId, productId, quantity) {
    try {
      console.log(`📦 Reducing stock for order ${orderId}, vendor ${vendorId}, product ${productId}, qty ${quantity}`);
      
      const result = await prisma.$transaction(async (tx) => {
        // Get current inventory
        const inventory = await tx.vendorInventory.findUnique({
          where: {
            vendorId_productId: {
              vendorId,
              productId
            }
          }
        });

        if (!inventory) {
          throw new Error('Inventory not found for vendor-product combination');
        }

        const newQuantity = inventory.availableQuantity - quantity;
        const newStatus = newQuantity <= 0 ? 'OUT_OF_STOCK' : 
                           newQuantity <= inventory.minStock ? 'LOW_STOCK' : 'AVAILABLE';

        // Update inventory
        const updatedInventory = await tx.vendorInventory.update({
          where: {
            vendorId_productId: {
              vendorId,
              productId
            }
          },
          data: {
            availableQuantity: Math.max(0, newQuantity),
            status: newStatus,
            lastUpdated: new Date(),
            updatedAt: new Date()
          }
        });

        console.log(`✅ Stock reduced: ${inventory.availableQuantity} → ${Math.max(0, newQuantity)}`);

        return {
          previousQuantity: inventory.availableQuantity,
          newQuantity: Math.max(0, newQuantity),
          status: newStatus,
          inventory: updatedInventory
        };
      });

      return result;

    } catch (error) {
      logger.error('Error reducing stock on order acceptance', {
        orderId,
        vendorId,
        productId,
        quantity,
        error: error.message
      });
      throw error;
    }
  }

  async updateVendorInventory(vendorId, productId, updates) {
    try {
      console.log(`📝 Updating vendor inventory: vendor ${vendorId}, product ${productId}`);
      
      const { price, availableQuantity, minStock, status } = updates;
      
      const updateData = {
        lastUpdated: new Date(),
        updatedAt: new Date()
      };

      if (price !== undefined) updateData.price = price;
      if (availableQuantity !== undefined) updateData.availableQuantity = availableQuantity;
      if (minStock !== undefined) updateData.minStock = minStock;
      if (status !== undefined) updateData.status = status;

      // Auto-update status based on stock level
      if (availableQuantity !== undefined && status === undefined) {
        updateData.status = availableQuantity <= 0 ? 'OUT_OF_STOCK' : 
                          availableQuantity <= minStock ? 'LOW_STOCK' : 'AVAILABLE';
      }

      const result = await prisma.vendorInventory.update({
        where: {
          vendorId_productId: {
            vendorId,
            productId
          }
        },
        data: updateData
      });

      console.log(`✅ Vendor inventory updated successfully`);
      return result;

    } catch (error) {
      logger.error('Error updating vendor inventory', {
        vendorId,
        productId,
        updates,
        error: error.message
      });
      throw error;
    }
  }

  async getVendorInventory(vendorId, options = {}) {
    try {
      const { 
        productId, 
        status, 
        lowStockOnly = false,
        limit = 100,
        offset = 0 
      } = options;

      const where = { vendorId };
      
      if (productId) where.productId = productId;
      if (status) where.status = status;
      if (lowStockOnly) where.status = 'LOW_STOCK';
      
      const inventories = await prisma.vendorInventory.findMany({
        where,
        include: {
          vendor: {
            include: {
              user: {
                select: {
                  businessName: true
                }
              }
            }
          },
          product: {
            select: {
              name: true,
              category: true,
              unit: true,
              hsnCode: true
            }
          }
        },
        orderBy: [
          { lastUpdated: 'desc' },
          { productName: 'asc' }
        ],
        take: limit,
        skip: offset
      });

      return inventories.map(inv => ({
        ...inv,
        vendorName: inv.vendor.user.businessName,
        productName: inv.product.name,
        productCategory: inv.product.category,
        daysSinceLastUpdate: Math.floor((Date.now() - inv.lastUpdated.getTime()) / (1000 * 60 * 60 * 24))
      }));

    } catch (error) {
      logger.error('Error getting vendor inventory', {
        vendorId,
        error: error.message
      });
      return [];
    }
  }

  async getInventoryDashboard() {
    try {
      console.log('📊 Generating inventory dashboard...');
      
      // Get overall inventory statistics
      const totalStats = await prisma.vendorInventory.groupBy({
        by: ['status'],
        _count: {
          id: true
        },
        _sum: {
          availableQuantity: true
        }
      });

      // Get low stock items
      const lowStockItems = await prisma.vendorInventory.findMany({
        where: {
          status: 'LOW_STOCK'
        },
        include: {
          vendor: {
            include: {
              user: {
                select: {
                  businessName: true
                }
              }
            }
          },
          product: {
            select: {
              name: true,
              category: true
            }
          }
        },
        orderBy: {
          availableQuantity: 'asc'
        },
        take: 20
      });

      // Get out of stock items
      const outOfStockItems = await prisma.vendorInventory.findMany({
        where: {
          status: 'OUT_OF_STOCK'
        },
        include: {
          vendor: {
            include: {
              user: {
                select: {
                  businessName: true
                }
              }
            }
          },
          product: {
            select: {
              name: true,
              category: true
            }
          }
        },
        orderBy: {
          lastUpdated: 'desc'
        },
        take: 20
      });

      // Get most ordered products
      const mostOrderedProducts = await prisma.order.groupBy({
        by: ['productId'],
        _count: {
          id: true
        },
        where: {
          productId: {
            not: null
          }
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: 10
      });

      // Get product details for most ordered
      const productIds = mostOrderedProducts.map(p => p.productId);
      const productDetails = await prisma.product.findMany({
        where: {
          id: { in: productIds }
        },
        select: {
          id: true,
          name: true,
          category: true
        }
      });

      const mostOrderedWithDetails = mostOrderedProducts.map(item => {
        const product = productDetails.find(p => p.id === item.productId);
        return {
          productId: item.productId,
          productName: product?.name || 'Unknown',
          productCategory: product?.category || 'Unknown',
          orderCount: item._count.id
        };
      });

      const dashboard = {
        summary: {
          totalInventoryItems: totalStats.reduce((sum, stat) => sum + stat._count.id, 0),
          availableItems: totalStats.find(s => s.status === 'AVAILABLE')?._count.id || 0,
          lowStockItems: totalStats.find(s => s.status === 'LOW_STOCK')?._count.id || 0,
          outOfStockItems: totalStats.find(s => s.status === 'OUT_OF_STOCK')?._count.id || 0,
          totalAvailableQuantity: totalStats.reduce((sum, stat) => sum + (stat._sum.availableQuantity || 0), 0)
        },
        lowStockItems: lowStockItems.map(item => ({
          inventoryId: item.id,
          vendorName: item.vendor.user.businessName,
          productName: item.product.name,
          productCategory: item.product.category,
          availableQuantity: item.availableQuantity,
          minStock: item.minStock,
          daysSinceLastUpdate: Math.floor((Date.now() - item.lastUpdated.getTime()) / (1000 * 60 * 60 * 24))
        })),
        outOfStockItems: outOfStockItems.map(item => ({
          inventoryId: item.id,
          vendorName: item.vendor.user.businessName,
          productName: item.product.name,
          productCategory: item.product.category,
          availableQuantity: item.availableQuantity,
          lastUpdated: item.lastUpdated,
          daysSinceLastUpdate: Math.floor((Date.now() - item.lastUpdated.getTime()) / (1000 * 60 * 60 * 24))
        })),
        mostOrderedProducts: mostOrderedWithDetails,
        generatedAt: new Date()
      };

      console.log('✅ Inventory dashboard generated');
      return dashboard;

    } catch (error) {
      logger.error('Error generating inventory dashboard', { error: error.message });
      throw error;
    }
  }

  async getPriceComparison(productId) {
    try {
      console.log(`💰 Getting price comparison for product: ${productId}`);
      
      const priceComparisons = await prisma.vendorInventory.findMany({
        where: {
          productId,
          status: 'AVAILABLE',
          availableQuantity: { gt: 0 },
          isActive: true,
          vendor: {
            isApproved: true
          }
        },
        include: {
          vendor: {
            include: {
              user: {
                select: {
                  businessName: true
                }
              }
            }
          },
          product: {
            select: {
              name: true,
              unit: true
            }
          }
        },
        orderBy: {
          price: 'asc'
        },
        take: 20
      });

      return priceComparisons.map(item => ({
        vendorId: item.vendorId,
        vendorName: item.vendor.user.businessName,
        price: item.price,
        availableQuantity: item.availableQuantity,
        productName: item.product.name,
        unit: item.product.unit,
        pricePerUnit: item.price,
        stockPosition: item.availableQuantity > 10 ? 'Good' : 
                      item.availableQuantity > 5 ? 'Limited' : 'Critical'
      }));

    } catch (error) {
      logger.error('Error getting price comparison', {
        productId,
        error: error.message
      });
      return [];
    }
  }

  async markOutOfStock(vendorId, productId) {
    try {
      console.log(`🚫 Marking product out of stock: vendor ${vendorId}, product ${productId}`);
      
      const result = await prisma.vendorInventory.update({
        where: {
          vendorId_productId: {
            vendorId,
            productId
          }
        },
        data: {
          status: 'OUT_OF_STOCK',
          availableQuantity: 0,
          lastUpdated: new Date(),
          updatedAt: new Date()
        }
      });

      console.log('✅ Product marked as out of stock');
      return result;

    } catch (error) {
      logger.error('Error marking product out of stock', {
        vendorId,
        productId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Restore stock on order cancellation (transactional)
   */
  async restoreStockOnCancellation(orderId, vendorId, productId, quantity) {
    try {
      console.log(`♻️ Restoring stock for cancelled order ${orderId}, vendor ${vendorId}, product ${productId}, qty ${quantity}`);
      
      const result = await prisma.$transaction(async (tx) => {
        // Get current inventory
        const inventory = await tx.vendorInventory.findUnique({
          where: {
            vendorId_productId: {
              vendorId,
              productId
            }
          }
        });

        if (!inventory) {
          throw new Error('Inventory not found for vendor-product combination');
        }

        const newQuantity = inventory.availableQuantity + quantity;
        const newStatus = newQuantity <= 0 ? 'OUT_OF_STOCK' : 
                           newQuantity <= inventory.minStock ? 'LOW_STOCK' : 'AVAILABLE';

        // Update inventory - restore stock
        const updatedInventory = await tx.vendorInventory.update({
          where: {
            vendorId_productId: {
              vendorId,
              productId
            }
          },
          data: {
            availableQuantity: newQuantity,
            status: newStatus,
            lastUpdated: new Date(),
            updatedAt: new Date()
          }
        });

        console.log(`✅ Stock restored: ${inventory.availableQuantity} → ${newQuantity}`);

        return {
          previousQuantity: inventory.availableQuantity,
          newQuantity,
          status: newStatus,
          inventory: updatedInventory
        };
      }, {
        isolationLevel: 'Serializable' // Prevent race conditions
      });

      return result;

    } catch (error) {
      logger.error('Error restoring stock on cancellation', {
        orderId,
        vendorId,
        productId,
        quantity,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Adjust stock with transaction safety (prevents negative stock)
   */
  async adjustStock(vendorId, productId, adjustment, reason = 'Manual adjustment') {
    try {
      console.log(`📊 Adjusting stock: vendor ${vendorId}, product ${productId}, adjustment ${adjustment}`);
      
      const result = await prisma.$transaction(async (tx) => {
        // Lock the row for update
        const inventory = await tx.vendorInventory.findUnique({
          where: {
            vendorId_productId: {
              vendorId,
              productId
            }
          }
        });

        if (!inventory) {
          throw new Error('Inventory not found');
        }

        const newQuantity = inventory.availableQuantity + adjustment;

        // Prevent negative stock
        if (newQuantity < 0) {
          throw new Error(`Cannot adjust stock: would result in negative quantity (current: ${inventory.availableQuantity}, adjustment: ${adjustment})`);
        }

        const newStatus = newQuantity <= 0 ? 'OUT_OF_STOCK' : 
                           newQuantity <= inventory.minStock ? 'LOW_STOCK' : 'AVAILABLE';

        // Update inventory
        const updatedInventory = await tx.vendorInventory.update({
          where: {
            vendorId_productId: {
              vendorId,
              productId
            }
          },
          data: {
            availableQuantity: newQuantity,
            status: newStatus,
            lastUpdated: new Date(),
            updatedAt: new Date()
          }
        });

        console.log(`✅ Stock adjusted: ${inventory.availableQuantity} → ${newQuantity} (${reason})`);

        return {
          previousQuantity: inventory.availableQuantity,
          newQuantity,
          adjustment,
          status: newStatus,
          reason,
          inventory: updatedInventory
        };
      }, {
        isolationLevel: 'Serializable'
      });

      return result;

    } catch (error) {
      logger.error('Error adjusting stock', {
        vendorId,
        productId,
        adjustment,
        reason,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get low stock alerts
   */
  async getLowStockAlerts(vendorId = null) {
    try {
      console.log('🚨 Getting low stock alerts...');
      
      const where = {
        OR: [
          { status: 'LOW_STOCK' },
          { status: 'OUT_OF_STOCK' }
        ],
        isActive: true
      };

      if (vendorId) {
        where.vendorId = vendorId;
      }

      const alerts = await prisma.vendorInventory.findMany({
        where,
        include: {
          vendor: {
            include: {
              user: {
                select: {
                  businessName: true,
                  phoneNumber: true
                }
              }
            }
          },
          product: {
            select: {
              name: true,
              category: true,
              unit: true
            }
          }
        },
        orderBy: [
          { status: 'asc' }, // OUT_OF_STOCK first
          { availableQuantity: 'asc' }
        ]
      });

      return alerts.map(alert => ({
        inventoryId: alert.id,
        vendorId: alert.vendorId,
        vendorName: alert.vendor.user.businessName,
        vendorPhone: alert.vendor.user.phoneNumber,
        productId: alert.productId,
        productName: alert.product.name,
        productCategory: alert.product.category,
        unit: alert.product.unit,
        currentStock: alert.availableQuantity,
        minStock: alert.minStock,
        status: alert.status,
        alertLevel: alert.status === 'OUT_OF_STOCK' ? 'CRITICAL' : 'WARNING',
        shortfall: Math.max(0, alert.minStock - alert.availableQuantity),
        lastUpdated: alert.lastUpdated,
        daysSinceUpdate: Math.floor((Date.now() - alert.lastUpdated.getTime()) / (1000 * 60 * 60 * 24))
      }));

    } catch (error) {
      logger.error('Error getting low stock alerts', { error: error.message });
      throw error;
    }
  }

  /**
   * Bulk stock update (transactional)
   */
  async bulkUpdateStock(updates) {
    try {
      console.log(`📦 Bulk updating ${updates.length} inventory items...`);
      
      const results = await prisma.$transaction(async (tx) => {
        const updateResults = [];

        for (const update of updates) {
          const { vendorId, productId, availableQuantity, price, minStock } = update;

          const inventory = await tx.vendorInventory.findUnique({
            where: {
              vendorId_productId: {
                vendorId,
                productId
              }
            }
          });

          if (!inventory) {
            updateResults.push({
              vendorId,
              productId,
              success: false,
              error: 'Inventory not found'
            });
            continue;
          }

          const updateData = {
            lastUpdated: new Date(),
            updatedAt: new Date()
          };

          if (availableQuantity !== undefined) {
            updateData.availableQuantity = availableQuantity;
            updateData.status = availableQuantity <= 0 ? 'OUT_OF_STOCK' : 
                              availableQuantity <= (minStock || inventory.minStock) ? 'LOW_STOCK' : 'AVAILABLE';
          }
          if (price !== undefined) updateData.price = price;
          if (minStock !== undefined) updateData.minStock = minStock;

          const updated = await tx.vendorInventory.update({
            where: {
              vendorId_productId: {
                vendorId,
                productId
              }
            },
            data: updateData
          });

          updateResults.push({
            vendorId,
            productId,
            success: true,
            previousQuantity: inventory.availableQuantity,
            newQuantity: updated.availableQuantity,
            status: updated.status
          });
        }

        return updateResults;
      }, {
        isolationLevel: 'Serializable'
      });

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Bulk update complete: ${successCount}/${updates.length} successful`);

      return {
        total: updates.length,
        successful: successCount,
        failed: updates.length - successCount,
        results
      };

    } catch (error) {
      logger.error('Error in bulk stock update', { error: error.message });
      throw error;
    }
  }
}

module.exports = new VendorInventoryService();
