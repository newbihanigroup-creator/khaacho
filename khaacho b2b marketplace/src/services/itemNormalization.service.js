const prisma = require('../config/database');
const logger = require('../utils/logger');

/**
 * Item Normalization Service
 * Matches extracted items against Product catalog using PostgreSQL search
 */

class ItemNormalizationService {
  constructor() {
    this.confidenceThreshold = parseFloat(process.env.PRODUCT_MATCH_THRESHOLD) || 0.7;
  }

  /**
   * Normalize extracted items by matching against Product catalog
   * 
   * @param {string} uploadedOrderId - ID of uploaded order
   * @returns {Promise<Object>} - Normalization results with matched and unmatched items
   * @throws {Error} - Structured error with code and details
   */
  async normalizeItems(uploadedOrderId) {
    const startTime = Date.now();

    try {
      logger.info('Starting item normalization', { uploadedOrderId });

      // Step 1: Get uploaded order with extracted items
      const uploadedOrder = await this.getUploadedOrder(uploadedOrderId);

      if (!uploadedOrder) {
        throw this.createError(
          'ORDER_NOT_FOUND',
          `UploadedOrder not found: ${uploadedOrderId}`,
          { uploadedOrderId }
        );
      }

      // Step 2: Get extracted items from parsedData
      const extractedItems = this.getExtractedItems(uploadedOrder);

      if (extractedItems.length === 0) {
        logger.warn('No extracted items to normalize', { uploadedOrderId });
        return {
          uploadedOrderId,
          totalItems: 0,
          matched: 0,
          unmatched: 0,
          needsReview: 0,
          items: [],
        };
      }

      logger.info('Processing extracted items', {
        uploadedOrderId,
        itemCount: extractedItems.length,
      });

      // Step 3: Normalize each item
      const normalizedItems = [];
      let matchedCount = 0;
      let unmatchedCount = 0;
      let needsReviewCount = 0;

      for (const extractedItem of extractedItems) {
        const normalized = await this.normalizeItem(extractedItem, uploadedOrderId);
        normalizedItems.push(normalized);

        if (normalized.productId) {
          if (normalized.needsReview) {
            needsReviewCount++;
          } else {
            matchedCount++;
          }
        } else {
          unmatchedCount++;
        }
      }

      // Step 4: Store normalized items in database
      await this.storeNormalizedItems(uploadedOrderId, normalizedItems);

      // Step 5: Update order status
      const finalStatus = this.determineOrderStatus(matchedCount, unmatchedCount, needsReviewCount);
      await this.updateOrderStatus(uploadedOrderId, finalStatus, normalizedItems);

      const duration = Date.now() - startTime;

      logger.info('Item normalization completed', {
        uploadedOrderId,
        totalItems: extractedItems.length,
        matched: matchedCount,
        unmatched: unmatchedCount,
        needsReview: needsReviewCount,
        status: finalStatus,
        duration,
      });

      return {
        uploadedOrderId,
        totalItems: extractedItems.length,
        matched: matchedCount,
        unmatched: unmatchedCount,
        needsReview: needsReviewCount,
        status: finalStatus,
        items: normalizedItems,
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      // If already a structured error, re-throw
      if (error.code && error.isNormalizationError) {
        logger.error('Item normalization failed', {
          uploadedOrderId,
          errorCode: error.code,
          errorMessage: error.message,
          duration,
        });
        throw error;
      }

      // Generic error
      logger.error('Unexpected normalization error', {
        uploadedOrderId,
        error: error.message,
        stack: error.stack,
        duration,
      });

      throw this.createError(
        'NORMALIZATION_FAILED',
        `Failed to normalize items: ${error.message}`,
        { uploadedOrderId, originalError: error.message }
      );
    }
  }

  /**
   * Get uploaded order from database
   * 
   * @param {string} uploadedOrderId - Order ID
   * @returns {Promise<Object>} - Uploaded order
   */
  async getUploadedOrder(uploadedOrderId) {
    try {
      return await prisma.uploadedOrder.findUnique({
        where: { id: uploadedOrderId },
        include: {
          retailer: {
            select: {
              id: true,
              shopName: true,
            },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to fetch uploaded order', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Extract items from parsedData
   * 
   * @param {Object} uploadedOrder - Uploaded order
   * @returns {Array} - Extracted items
   */
  getExtractedItems(uploadedOrder) {
    try {
      const parsedData = uploadedOrder.parsedData;

      if (!parsedData || typeof parsedData !== 'object') {
        return [];
      }

      const items = parsedData.items || [];

      if (!Array.isArray(items)) {
        logger.warn('parsedData.items is not an array', {
          uploadedOrderId: uploadedOrder.id,
        });
        return [];
      }

      return items;
    } catch (error) {
      logger.error('Failed to extract items from parsedData', {
        uploadedOrderId: uploadedOrder.id,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Normalize a single item by matching against Product catalog
   * 
   * @param {Object} extractedItem - Extracted item with name, quantity, unit
   * @param {string} uploadedOrderId - Order ID for logging
   * @returns {Promise<Object>} - Normalized item with productId and confidence
   */
  async normalizeItem(extractedItem, uploadedOrderId) {
    const itemName = extractedItem.name;

    logger.info('Normalizing item', {
      uploadedOrderId,
      itemName,
      quantity: extractedItem.quantity,
      unit: extractedItem.unit,
    });

    try {
      // Step 1: Try exact match (case-insensitive)
      let matchResult = await this.exactMatch(itemName);

      if (matchResult) {
        logger.info('Exact match found', {
          uploadedOrderId,
          itemName,
          productId: matchResult.productId,
          productName: matchResult.productName,
          confidence: matchResult.confidence,
        });

        return {
          ...extractedItem,
          productId: matchResult.productId,
          productName: matchResult.productName,
          matchType: 'exact',
          confidence: matchResult.confidence,
          needsReview: false,
          alternatives: [],
        };
      }

      // Step 2: Try ILIKE pattern match
      matchResult = await this.ilikeMatch(itemName);

      if (matchResult) {
        const needsReview = matchResult.confidence < this.confidenceThreshold;

        logger.info('ILIKE match found', {
          uploadedOrderId,
          itemName,
          productId: matchResult.productId,
          productName: matchResult.productName,
          confidence: matchResult.confidence,
          needsReview,
        });

        return {
          ...extractedItem,
          productId: matchResult.productId,
          productName: matchResult.productName,
          matchType: 'ilike',
          confidence: matchResult.confidence,
          needsReview,
          alternatives: matchResult.alternatives || [],
        };
      }

      // Step 3: Try full-text search
      matchResult = await this.fullTextSearch(itemName);

      if (matchResult) {
        const needsReview = matchResult.confidence < this.confidenceThreshold;

        logger.info('Full-text search match found', {
          uploadedOrderId,
          itemName,
          productId: matchResult.productId,
          productName: matchResult.productName,
          confidence: matchResult.confidence,
          needsReview,
        });

        return {
          ...extractedItem,
          productId: matchResult.productId,
          productName: matchResult.productName,
          matchType: 'fulltext',
          confidence: matchResult.confidence,
          needsReview,
          alternatives: matchResult.alternatives || [],
        };
      }

      // No match found
      logger.warn('No product match found', {
        uploadedOrderId,
        itemName,
      });

      return {
        ...extractedItem,
        productId: null,
        productName: null,
        matchType: 'none',
        confidence: 0,
        needsReview: true,
        alternatives: [],
      };

    } catch (error) {
      logger.error('Failed to normalize item', {
        uploadedOrderId,
        itemName,
        error: error.message,
      });

      return {
        ...extractedItem,
        productId: null,
        productName: null,
        matchType: 'error',
        confidence: 0,
        needsReview: true,
        error: error.message,
        alternatives: [],
      };
    }
  }

  /**
   * Exact match (case-insensitive)
   * 
   * @param {string} itemName - Item name to match
   * @returns {Promise<Object|null>} - Match result or null
   */
  async exactMatch(itemName) {
    try {
      const products = await prisma.$queryRaw`
        SELECT 
          id,
          name,
          category,
          unit,
          COALESCE(popularity_score, 0) as popularity
        FROM products
        WHERE LOWER(name) = LOWER(${itemName})
        ORDER BY popularity DESC
        LIMIT 1
      `;

      if (products.length === 0) {
        return null;
      }

      const product = products[0];

      return {
        productId: product.id,
        productName: product.name,
        confidence: 1.0, // Exact match = 100% confidence
        popularity: Number(product.popularity) || 0,
        alternatives: [],
      };
    } catch (error) {
      logger.error('Exact match query failed', {
        itemName,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * ILIKE pattern match (case-insensitive partial match)
   * 
   * @param {string} itemName - Item name to match
   * @returns {Promise<Object|null>} - Match result or null
   */
  async ilikeMatch(itemName) {
    try {
      const pattern = `%${itemName}%`;

      const products = await prisma.$queryRaw`
        SELECT 
          id,
          name,
          category,
          unit,
          COALESCE(popularity_score, 0) as popularity,
          CASE
            WHEN LOWER(name) = LOWER(${itemName}) THEN 1.0
            WHEN LOWER(name) LIKE LOWER(${itemName} || '%') THEN 0.9
            WHEN LOWER(name) LIKE LOWER('%' || ${itemName}) THEN 0.85
            ELSE 0.8
          END as confidence
        FROM products
        WHERE name ILIKE ${pattern}
        ORDER BY confidence DESC, popularity DESC
        LIMIT 5
      `;

      if (products.length === 0) {
        return null;
      }

      // Best match (highest confidence, then popularity)
      const bestMatch = products[0];

      // Alternative matches
      const alternatives = products.slice(1, 4).map(p => ({
        productId: p.id,
        productName: p.name,
        confidence: Number(p.confidence),
        popularity: Number(p.popularity) || 0,
      }));

      return {
        productId: bestMatch.id,
        productName: bestMatch.name,
        confidence: Number(bestMatch.confidence),
        popularity: Number(bestMatch.popularity) || 0,
        alternatives,
      };
    } catch (error) {
      logger.error('ILIKE match query failed', {
        itemName,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Full-text search using PostgreSQL
   * 
   * @param {string} itemName - Item name to match
   * @returns {Promise<Object|null>} - Match result or null
   */
  async fullTextSearch(itemName) {
    try {
      // Split item name into words for better matching
      const words = itemName.toLowerCase().split(/\s+/).filter(w => w.length > 2);

      if (words.length === 0) {
        return null;
      }

      // Build search query
      const searchQuery = words.join(' & ');

      const products = await prisma.$queryRaw`
        SELECT 
          id,
          name,
          category,
          unit,
          COALESCE(popularity_score, 0) as popularity,
          ts_rank(
            to_tsvector('english', name || ' ' || COALESCE(category, '')),
            to_tsquery('english', ${searchQuery})
          ) as rank
        FROM products
        WHERE to_tsvector('english', name || ' ' || COALESCE(category, '')) 
          @@ to_tsquery('english', ${searchQuery})
        ORDER BY rank DESC, popularity DESC
        LIMIT 5
      `;

      if (products.length === 0) {
        return null;
      }

      // Best match
      const bestMatch = products[0];
      const rank = Number(bestMatch.rank);

      // Calculate confidence based on rank
      // Rank typically ranges from 0 to 1, but can be higher
      const confidence = Math.min(rank * 0.7, 0.9); // Cap at 0.9 for full-text

      // Alternative matches
      const alternatives = products.slice(1, 4).map(p => ({
        productId: p.id,
        productName: p.name,
        confidence: Math.min(Number(p.rank) * 0.7, 0.9),
        popularity: Number(p.popularity) || 0,
      }));

      return {
        productId: bestMatch.id,
        productName: bestMatch.name,
        confidence,
        popularity: Number(bestMatch.popularity) || 0,
        alternatives,
      };
    } catch (error) {
      logger.error('Full-text search query failed', {
        itemName,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Store normalized items in database
   * 
   * @param {string} uploadedOrderId - Order ID
   * @param {Array} normalizedItems - Normalized items
   */
  async storeNormalizedItems(uploadedOrderId, normalizedItems) {
    try {
      // Update parsedData with normalized items
      await prisma.uploadedOrder.update({
        where: { id: uploadedOrderId },
        data: {
          parsedData: {
            items: normalizedItems,
            normalizedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        },
      });

      logger.info('Normalized items stored', {
        uploadedOrderId,
        itemCount: normalizedItems.length,
      });
    } catch (error) {
      logger.error('Failed to store normalized items', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Determine final order status based on normalization results
   * 
   * @param {number} matchedCount - Number of matched items
   * @param {number} unmatchedCount - Number of unmatched items
   * @param {number} needsReviewCount - Number of items needing review
   * @returns {string} - Order status
   */
  determineOrderStatus(matchedCount, unmatchedCount, needsReviewCount) {
    if (unmatchedCount > 0 || needsReviewCount > 0) {
      return 'PENDING_REVIEW';
    }

    if (matchedCount > 0) {
      return 'COMPLETED';
    }

    return 'FAILED';
  }

  /**
   * Update order status
   * 
   * @param {string} uploadedOrderId - Order ID
   * @param {string} status - New status
   * @param {Array} normalizedItems - Normalized items
   */
  async updateOrderStatus(uploadedOrderId, status, normalizedItems) {
    try {
      await prisma.uploadedOrder.update({
        where: { id: uploadedOrderId },
        data: {
          status,
          processedAt: status === 'COMPLETED' || status === 'PENDING_REVIEW' ? new Date() : undefined,
          updatedAt: new Date(),
        },
      });

      logger.info('Order status updated', {
        uploadedOrderId,
        status,
        itemCount: normalizedItems.length,
      });
    } catch (error) {
      logger.error('Failed to update order status', {
        uploadedOrderId,
        status,
        error: error.message,
      });
      throw error;
    }
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
    error.isNormalizationError = true;
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
      service: 'Item Normalization',
      confidenceThreshold: this.confidenceThreshold,
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
module.exports = new ItemNormalizationService();
