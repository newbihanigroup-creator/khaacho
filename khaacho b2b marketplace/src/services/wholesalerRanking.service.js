const prisma = require('../config/database');
const logger = require('../utils/logger');

/**
 * Wholesaler Ranking Service
 * Ranks and retrieves top wholesalers for products based on multiple metrics
 */

class WholesalerRankingService {
  constructor() {
    // Ranking weights (must sum to 1.0)
    this.weights = {
      reliability: parseFloat(process.env.RANKING_WEIGHT_RELIABILITY) || 0.40,
      price: parseFloat(process.env.RANKING_WEIGHT_PRICE) || 0.30,
      fulfillment: parseFloat(process.env.RANKING_WEIGHT_FULFILLMENT) || 0.20,
      response: parseFloat(process.env.RANKING_WEIGHT_RESPONSE) || 0.10,
    };
  }

  /**
   * Get top wholesalers for a specific product
   * 
   * @param {string} productId - Product ID
   * @param {number} limit - Maximum number of wholesalers to return (default: 5)
   * @returns {Promise<Array>} - Array of top wholesalers with ranking scores
   * @throws {Error} - Structured error with code and details
   */
  async getTopWholesalersForProduct(productId, limit = 5) {
    const startTime = Date.now();

    try {
      // Validate inputs
      if (!productId || typeof productId !== 'string') {
        throw this.createError(
          'INVALID_PRODUCT_ID',
          'Product ID is required and must be a string',
          { productId }
        );
      }

      if (typeof limit !== 'number' || limit < 1 || limit > 50) {
        throw this.createError(
          'INVALID_LIMIT',
          'Limit must be a number between 1 and 50',
          { limit }
        );
      }

      logger.info('Getting top wholesalers for product', {
        productId,
        limit,
      });

      // Execute query with dynamic ranking calculation
      const wholesalers = await this.queryTopWholesalers(productId, limit);

      const duration = Date.now() - startTime;

      logger.info('Top wholesalers retrieved', {
        productId,
        count: wholesalers.length,
        duration,
      });

      return wholesalers;

    } catch (error) {
      const duration = Date.now() - startTime;

      // If already a structured error, re-throw
      if (error.code && error.isRankingError) {
        logger.error('Failed to get top wholesalers', {
          productId,
          errorCode: error.code,
          errorMessage: error.message,
          duration,
        });
        throw error;
      }

      // Generic error
      logger.error('Unexpected error getting top wholesalers', {
        productId,
        error: error.message,
        stack: error.stack,
        duration,
      });

      throw this.createError(
        'QUERY_FAILED',
        `Failed to get top wholesalers: ${error.message}`,
        { productId, originalError: error.message }
      );
    }
  }

  /**
   * Query top wholesalers with dynamic ranking
   * 
   * @param {string} productId - Product ID
   * @param {number} limit - Maximum results
   * @returns {Promise<Array>} - Ranked wholesalers
   */
  async queryTopWholesalers(productId, limit) {
    try {
      const { reliability, price, fulfillment, response } = this.weights;

      const wholesalers = await prisma.$queryRaw`
        WITH wholesaler_data AS (
          SELECT 
            w.id as wholesaler_id,
            w.business_name,
            w.contact_person,
            w.phone_number,
            w.email,
            w.address,
            w.city,
            w.status,
            
            -- Product-specific data
            pw.price,
            pw.available_quantity,
            pw.minimum_order_quantity,
            pw.is_available,
            pw.last_updated as price_last_updated,
            
            -- Metrics
            COALESCE(wm.reliability_score, 0) as reliability_score,
            COALESCE(wm.fulfillment_rate, 0) as fulfillment_rate,
            COALESCE(wm.average_response_time, 24) as avg_response_hours,
            COALESCE(wm.total_orders, 0) as total_orders,
            COALESCE(wm.successful_orders, 0) as successful_orders,
            COALESCE(wm.cancelled_orders, 0) as cancelled_orders,
            COALESCE(wm.average_rating, 0) as average_rating,
            COALESCE(wm.total_reviews, 0) as total_reviews,
            
            -- Price normalization (for ranking)
            MIN(pw.price) OVER () as min_price,
            MAX(pw.price) OVER () as max_price
            
          FROM wholesalers w
          INNER JOIN product_wholesalers pw ON w.id = pw.wholesaler_id
          LEFT JOIN wholesaler_metrics wm ON w.id = wm.wholesaler_id
          
          WHERE pw.product_id = ${productId}
            AND w.status = 'ACTIVE'
            AND w.is_approved = true
            AND pw.is_available = true
            AND pw.available_quantity > 0
        ),
        ranked_wholesalers AS (
          SELECT 
            *,
            -- Normalize scores to 0-1 range
            CASE 
              WHEN reliability_score > 0 THEN reliability_score / 100.0
              ELSE 0
            END as norm_reliability,
            
            CASE 
              WHEN fulfillment_rate > 0 THEN fulfillment_rate / 100.0
              ELSE 0
            END as norm_fulfillment,
            
            -- Price score (lower price = higher score)
            CASE 
              WHEN max_price > min_price THEN 
                1.0 - ((price - min_price) / (max_price - min_price))
              ELSE 1.0
            END as norm_price,
            
            -- Response time score (faster = higher score)
            CASE 
              WHEN avg_response_hours <= 1 THEN 1.0
              WHEN avg_response_hours <= 4 THEN 0.9
              WHEN avg_response_hours <= 12 THEN 0.7
              WHEN avg_response_hours <= 24 THEN 0.5
              ELSE 0.3
            END as norm_response
            
          FROM wholesaler_data
        )
        SELECT 
          wholesaler_id,
          business_name,
          contact_person,
          phone_number,
          email,
          address,
          city,
          status,
          price,
          available_quantity,
          minimum_order_quantity,
          is_available,
          price_last_updated,
          reliability_score,
          fulfillment_rate,
          avg_response_hours,
          total_orders,
          successful_orders,
          cancelled_orders,
          average_rating,
          total_reviews,
          norm_reliability,
          norm_fulfillment,
          norm_price,
          norm_response,
          
          -- Calculate final ranking score
          (
            (norm_reliability * ${reliability}) +
            (norm_price * ${price}) +
            (norm_fulfillment * ${fulfillment}) +
            (norm_response * ${response})
          ) as ranking_score
          
        FROM ranked_wholesalers
        ORDER BY ranking_score DESC, total_orders DESC, average_rating DESC
        LIMIT ${limit}
      `;

      // Transform results
      return wholesalers.map(w => ({
        wholesalerId: w.wholesaler_id,
        businessName: w.business_name,
        contactPerson: w.contact_person,
        phoneNumber: w.phone_number,
        email: w.email,
        address: w.address,
        city: w.city,
        status: w.status,
        
        // Product-specific
        price: Number(w.price),
        availableQuantity: Number(w.available_quantity),
        minimumOrderQuantity: Number(w.minimum_order_quantity),
        isAvailable: w.is_available,
        priceLastUpdated: w.price_last_updated,
        
        // Metrics
        reliabilityScore: Number(w.reliability_score),
        fulfillmentRate: Number(w.fulfillment_rate),
        averageResponseHours: Number(w.avg_response_hours),
        totalOrders: Number(w.total_orders),
        successfulOrders: Number(w.successful_orders),
        cancelledOrders: Number(w.cancelled_orders),
        averageRating: Number(w.average_rating),
        totalReviews: Number(w.total_reviews),
        
        // Normalized scores
        normalizedReliability: Number(w.norm_reliability),
        normalizedFulfillment: Number(w.norm_fulfillment),
        normalizedPrice: Number(w.norm_price),
        normalizedResponse: Number(w.norm_response),
        
        // Final ranking
        rankingScore: Number(w.ranking_score),
      }));

    } catch (error) {
      logger.error('Query execution failed', {
        productId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get top wholesalers for multiple products (batch)
   * 
   * @param {Array<string>} productIds - Array of product IDs
   * @param {number} limit - Maximum wholesalers per product
   * @returns {Promise<Object>} - Map of productId to wholesalers array
   */
  async getTopWholesalersForProducts(productIds, limit = 5) {
    const startTime = Date.now();

    try {
      if (!Array.isArray(productIds) || productIds.length === 0) {
        throw this.createError(
          'INVALID_INPUT',
          'Product IDs must be a non-empty array',
          { productIds }
        );
      }

      logger.info('Getting top wholesalers for multiple products', {
        productCount: productIds.length,
        limit,
      });

      const results = {};

      // Process in parallel
      await Promise.all(
        productIds.map(async (productId) => {
          try {
            const wholesalers = await this.getTopWholesalersForProduct(productId, limit);
            results[productId] = wholesalers;
          } catch (error) {
            logger.error('Failed to get wholesalers for product', {
              productId,
              error: error.message,
            });
            results[productId] = [];
          }
        })
      );

      const duration = Date.now() - startTime;

      logger.info('Batch wholesaler retrieval completed', {
        productCount: productIds.length,
        duration,
      });

      return results;

    } catch (error) {
      logger.error('Batch query failed', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get ranking weights configuration
   * 
   * @returns {Object} - Current ranking weights
   */
  getRankingWeights() {
    return {
      ...this.weights,
      total: Object.values(this.weights).reduce((sum, w) => sum + w, 0),
    };
  }

  /**
   * Create structured error object
   * 
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} details - Additional error details
   * @returns {Error} - Structured error
   */
  createError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    error.isRankingError = true;
    error.timestamp = new Date().toISOString();
    return error;
  }

  /**
   * Get service health status
   * 
   * @returns {Object} - Health status
   */
  getHealthStatus() {
    return {
      service: 'Wholesaler Ranking',
      weights: this.weights,
      weightsSum: Object.values(this.weights).reduce((sum, w) => sum + w, 0),
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
module.exports = new WholesalerRankingService();
