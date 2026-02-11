const vendorInventoryService = require('../services/vendorInventory.service');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

class VendorInventoryController {
  async getVendorInventory(req, res, next) {
    try {
      const { vendorId } = req.params;
      const { 
        productId, 
        status, 
        lowStockOnly, 
        limit = 100, 
        offset = 0 
      } = req.query;

      const inventory = await vendorInventoryService.getVendorInventory(vendorId, {
        productId,
        status,
        lowStockOnly: lowStockOnly === 'true',
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return ApiResponse.success(res, {
        vendorId,
        inventory,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          count: inventory.length
        }
      }, 'Vendor inventory retrieved successfully');
    } catch (error) {
      logger.error('Error getting vendor inventory', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async updateVendorInventory(req, res, next) {
    try {
      const { vendorId } = req.params;
      const { productId, price, availableQuantity, minStock, status } = req.body;

      if (!productId) {
        return ApiResponse.error(res, 'Product ID is required', 400);
      }

      const updates = {};
      if (price !== undefined) updates.price = price;
      if (availableQuantity !== undefined) updates.availableQuantity = availableQuantity;
      if (minStock !== undefined) updates.minStock = minStock;
      if (status !== undefined) updates.status = status;

      const result = await vendorInventoryService.updateVendorInventory(
        vendorId, 
        productId, 
        updates
      );

      return ApiResponse.success(res, result, 'Vendor inventory updated successfully');
    } catch (error) {
      logger.error('Error updating vendor inventory', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async markOutOfStock(req, res, next) {
    try {
      const { vendorId, productId } = req.params;

      const result = await vendorInventoryService.markOutOfStock(vendorId, productId);

      return ApiResponse.success(res, result, 'Product marked as out of stock');
    } catch (error) {
      logger.error('Error marking product out of stock', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getPriceComparison(req, res, next) {
    try {
      const { productId } = req.params;

      const priceComparison = await vendorInventoryService.getPriceComparison(productId);

      return ApiResponse.success(res, {
        productId,
        priceComparison,
        totalVendors: priceComparison.length
      }, 'Price comparison retrieved successfully');
    } catch (error) {
      logger.error('Error getting price comparison', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getInventoryDashboard(req, res, next) {
    try {
      console.log('📊 Generating inventory dashboard...');
      
      const dashboard = await vendorInventoryService.getInventoryDashboard();

      return ApiResponse.success(res, dashboard, 'Inventory dashboard retrieved successfully');
    } catch (error) {
      logger.error('Error generating inventory dashboard', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getLowStockAlerts(req, res, next) {
    try {
      const { limit = 20 } = req.query;

      const lowStockItems = await vendorInventoryService.getVendorInventory(req.user.vendorProfile?.id, {
        status: 'LOW_STOCK',
        limit: parseInt(limit)
      });

      return ApiResponse.success(res, {
        lowStockItems,
        totalLowStock: lowStockItems.length,
        alertLevel: lowStockItems.length > 10 ? 'CRITICAL' : 'WARNING'
      }, 'Low stock alerts retrieved successfully');
    } catch (error) {
      logger.error('Error getting low stock alerts', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async bulkUpdateInventory(req, res, next) {
    try {
      const { vendorId } = req.params;
      const { updates } = req.body;

      if (!Array.isArray(updates)) {
        return ApiResponse.error(res, 'Updates must be an array', 400);
      }

      const results = [];
      
      for (const update of updates) {
        try {
          const result = await vendorInventoryService.updateVendorInventory(
            vendorId,
            update.productId,
            {
              price: update.price,
              availableQuantity: update.availableQuantity,
              minStock: update.minStock,
              status: update.status
            }
          );
          
          results.push({
            productId: update.productId,
            success: true,
            result
          });
        } catch (error) {
          results.push({
            productId: update.productId,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      
      return ApiResponse.success(res, {
        vendorId,
        totalUpdates: updates.length,
        successfulUpdates: successCount,
        failedUpdates: updates.length - successCount,
        results
      }, `Bulk update completed: ${successCount}/${updates.length} successful`);
    } catch (error) {
      logger.error('Error in bulk inventory update', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }
}

module.exports = new VendorInventoryController();
