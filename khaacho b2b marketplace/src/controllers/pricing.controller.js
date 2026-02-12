const pricingService = require('../services/pricing.service');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

class PricingController {
  /**
   * Set vendor pricing
   */
  async setVendorPricing(req, res, next) {
    try {
      const pricingData = req.body;
      
      const pricing = await pricingService.setVendorPricing(pricingData);
      
      return ApiResponse.success(res, pricing, 'Vendor pricing set successfully', 201);
    } catch (error) {
      logger.error('Error setting vendor pricing', { error: error.message });
      next(error);
    }
  }

  /**
   * Get best price for product and quantity
   */
  async getBestPrice(req, res, next) {
    try {
      const { productId } = req.params;
      const { quantity = 1, vendorId } = req.query;
      
      const bestPrice = await pricingService.getBestPrice(
        productId,
        parseInt(quantity),
        vendorId
      );
      
      if (!bestPrice) {
        return ApiResponse.error(res, 'No pricing found for this product', 404);
      }
      
      return ApiResponse.success(res, bestPrice, 'Best price retrieved successfully');
    } catch (error) {
      logger.error('Error getting best price', { error: error.message });
      next(error);
    }
  }

  /**
   * Get all prices for product (comparison)
   */
  async getAllPrices(req, res, next) {
    try {
      const { productId } = req.params;
      const { quantity = 1 } = req.query;
      
      const prices = await pricingService.getAllPricesForProduct(
        productId,
        parseInt(quantity)
      );
      
      return ApiResponse.success(res, {
        productId,
        quantity: parseInt(quantity),
        prices,
        count: prices.length
      }, 'All prices retrieved successfully');
    } catch (error) {
      logger.error('Error getting all prices', { error: error.message });
      next(error);
    }
  }

  /**
   * Get vendor pricing for a product
   */
  async getVendorPricing(req, res, next) {
    try {
      const { vendorId, productId } = req.params;
      
      const pricing = await pricingService.getVendorPricing(vendorId, productId);
      
      if (!pricing) {
        return ApiResponse.error(res, 'Pricing not found', 404);
      }
      
      return ApiResponse.success(res, pricing, 'Vendor pricing retrieved successfully');
    } catch (error) {
      logger.error('Error getting vendor pricing', { error: error.message });
      next(error);
    }
  }

  /**
   * Get all pricing for a vendor
   */
  async getAllVendorPricing(req, res, next) {
    try {
      const { vendorId } = req.params;
      const { isActive, limit, offset } = req.query;
      
      const pricing = await pricingService.getAllVendorPricing(vendorId, {
        isActive: isActive !== undefined ? isActive === 'true' : true,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined
      });
      
      return ApiResponse.success(res, {
        vendorId,
        pricing,
        count: pricing.length
      }, 'Vendor pricing retrieved successfully');
    } catch (error) {
      logger.error('Error getting all vendor pricing', { error: error.message });
      next(error);
    }
  }

  /**
   * Update bulk pricing tiers
   */
  async updateBulkTiers(req, res, next) {
    try {
      const { pricingId } = req.params;
      const { tiers } = req.body;
      
      if (!Array.isArray(tiers)) {
        return ApiResponse.error(res, 'Tiers must be an array', 400);
      }
      
      const result = await pricingService.updateBulkTiers(pricingId, tiers);
      
      return ApiResponse.success(res, result, 'Bulk tiers updated successfully');
    } catch (error) {
      logger.error('Error updating bulk tiers', { error: error.message });
      next(error);
    }
  }

  /**
   * Get price history
   */
  async getPriceHistory(req, res, next) {
    try {
      const { productId } = req.params;
      const { vendorId, limit, offset, startDate, endDate } = req.query;
      
      const history = await pricingService.getPriceHistory(productId, {
        vendorId,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });
      
      return ApiResponse.success(res, {
        productId,
        history,
        count: history.length
      }, 'Price history retrieved successfully');
    } catch (error) {
      logger.error('Error getting price history', { error: error.message });
      next(error);
    }
  }

  /**
   * Get price comparison
   */
  async getPriceComparison(req, res, next) {
    try {
      const { productId } = req.params;
      
      const comparison = await pricingService.getPriceComparison(productId);
      
      if (!comparison) {
        return ApiResponse.error(res, 'No pricing data available for comparison', 404);
      }
      
      return ApiResponse.success(res, comparison, 'Price comparison retrieved successfully');
    } catch (error) {
      logger.error('Error getting price comparison', { error: error.message });
      next(error);
    }
  }

  /**
   * Deactivate pricing
   */
  async deactivatePricing(req, res, next) {
    try {
      const { pricingId } = req.params;
      
      const result = await pricingService.deactivatePricing(pricingId);
      
      return ApiResponse.success(res, result, 'Pricing deactivated successfully');
    } catch (error) {
      logger.error('Error deactivating pricing', { error: error.message });
      next(error);
    }
  }

  /**
   * Calculate price for quantity (preview)
   */
  async calculatePrice(req, res, next) {
    try {
      const { vendorId, productId } = req.params;
      const { quantity } = req.query;
      
      if (!quantity) {
        return ApiResponse.error(res, 'Quantity is required', 400);
      }
      
      const pricing = await pricingService.getVendorPricing(vendorId, productId);
      
      if (!pricing) {
        return ApiResponse.error(res, 'Pricing not found', 404);
      }
      
      const calculation = pricingService.calculatePriceForQuantity(
        pricing.base_price,
        pricing.tiers || [],
        parseInt(quantity)
      );
      
      return ApiResponse.success(res, {
        vendorId,
        productId,
        quantity: parseInt(quantity),
        basePrice: pricing.base_price,
        ...calculation
      }, 'Price calculated successfully');
    } catch (error) {
      logger.error('Error calculating price', { error: error.message });
      next(error);
    }
  }

  /**
   * Bulk set pricing for multiple products
   */
  async bulkSetPricing(req, res, next) {
    try {
      const { vendorId } = req.params;
      const { pricingList } = req.body;
      
      if (!Array.isArray(pricingList)) {
        return ApiResponse.error(res, 'pricingList must be an array', 400);
      }
      
      const results = [];
      
      for (const pricingData of pricingList) {
        try {
          const pricing = await pricingService.setVendorPricing({
            vendorId,
            ...pricingData
          });
          results.push({
            productId: pricingData.productId,
            success: true,
            pricing
          });
        } catch (error) {
          results.push({
            productId: pricingData.productId,
            success: false,
            error: error.message
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      
      return ApiResponse.success(res, {
        total: pricingList.length,
        successful: successCount,
        failed: pricingList.length - successCount,
        results
      }, 'Bulk pricing operation completed');
    } catch (error) {
      logger.error('Error in bulk set pricing', { error: error.message });
      next(error);
    }
  }

  /**
   * Get pricing dashboard
   */
  async getPricingDashboard(req, res, next) {
    try {
      const { vendorId } = req.query;
      
      // Get summary statistics
      let query = `
        SELECT 
          COUNT(DISTINCT vp.id) as total_products_priced,
          COUNT(DISTINCT vp.vendor_id) as total_vendors,
          AVG(vp.base_price)::DECIMAL(12, 2) as average_base_price,
          COUNT(CASE WHEN vp.has_bulk_pricing = true THEN 1 END) as products_with_bulk_pricing,
          COUNT(CASE WHEN vp.is_promotional = true THEN 1 END) as promotional_products
        FROM vendor_pricing vp
        WHERE vp.is_active = true
      `;
      
      if (vendorId) {
        query += ` AND vp.vendor_id = $1::uuid`;
      }
      
      const summary = vendorId 
        ? await prisma.$queryRawUnsafe(query, vendorId)
        : await prisma.$queryRawUnsafe(query);
      
      // Get most expensive products
      const mostExpensive = await prisma.$queryRaw`
        SELECT 
          p.name as product_name,
          p.product_code,
          vp.base_price,
          u.business_name as vendor_name
        FROM vendor_pricing vp
        JOIN products p ON vp.product_id = p.id
        JOIN vendors v ON vp.vendor_id = v.id
        JOIN users u ON v.user_id = u.id
        WHERE vp.is_active = true
          ${vendorId ? prisma.Prisma.sql`AND vp.vendor_id = ${vendorId}::uuid` : prisma.Prisma.empty}
        ORDER BY vp.base_price DESC
        LIMIT 10
      `;
      
      // Get promotional products
      const promotional = await prisma.$queryRaw`
        SELECT 
          p.name as product_name,
          p.product_code,
          vp.base_price,
          vp.promotional_label,
          u.business_name as vendor_name
        FROM vendor_pricing vp
        JOIN products p ON vp.product_id = p.id
        JOIN vendors v ON vp.vendor_id = v.id
        JOIN users u ON v.user_id = u.id
        WHERE vp.is_active = true
          AND vp.is_promotional = true
          ${vendorId ? prisma.Prisma.sql`AND vp.vendor_id = ${vendorId}::uuid` : prisma.Prisma.empty}
        ORDER BY vp.created_at DESC
        LIMIT 10
      `;
      
      return ApiResponse.success(res, {
        summary: summary[0],
        mostExpensive,
        promotional
      }, 'Pricing dashboard retrieved successfully');
    } catch (error) {
      logger.error('Error getting pricing dashboard', { error: error.message });
      next(error);
    }
  }
}

module.exports = new PricingController();
