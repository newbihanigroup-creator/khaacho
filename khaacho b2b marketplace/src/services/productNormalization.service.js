const prisma = require('../config/database');
const logger = require('../utils/logger');

/**
 * Product Normalization Service
 * Matches extracted items from OCR against Product database using fuzzy matching
 */

class ProductNormalizationService {
  constructor() {
    this.CONFIDENCE_THRESHOLD = parseFloat(process.env.PRODUCT_MATCH_THRESHOLD || '0.7');
    this.MIN_SIMILARITY = 0.5; // Minimum similarity to consider a match
  }

  /**
   * Normalize extracted items by matching against Product table
   * @param {string} uploadedOrderId - ID of the uploaded order
   * @returns {Promise<Object>} Normalization results with matched products
   */
  async normalizeExtractedItems(uploadedOrderId) {
    logger.info('🔄 Starting product normalization', { uploadedOrderId });

    try {
      // 1. Fetch uploaded order with parsed data
      const uploadedOrder = await this.fetchUploadedOrder(uploadedOrderId);
      
      if (!uploadedOrder) {
        throw new Error(`UploadedOrder not found: ${uploadedOrderId}`);
      }

      if (!uploadedOrder.parsedData || !uploadedOrder.parsedData.items) {
        throw new Error('No parsed items found in uploaded order');
      }

      const extractedItems = uploadedOrder.parsedData.items;
      logger.info('📦 Found extracted items', {
        uploadedOrderId,
        itemCount: extractedItems.length,
      });

      // 2. Match each extracted item against Product table
      const normalizedItems = [];
      let needsReviewCount = 0;

      for (let i = 0; i < extractedItems.length; i++) {
        const item = extractedItems[i];
        logger.info(`🔍 Matching item ${i + 1}/${extractedItems.length}`, {
          name: item.name || item.productName,
          quantity: item.quantity,
          unit: item.unit,
        });

        const matchResult = await this.matchProduct(item);
        
        normalizedItems.push(matchResult);

        if (matchResult.needsReview) {
          needsReviewCount++;
        }

        logger.info(`✅ Match result for "${item.name || item.productName}"`, {
          matched: matchResult.matched,
          confidence: matchResult.confidence,
          productId: matchResult.productId,
          needsReview: matchResult.needsReview,
        });
      }

      // 3. Update uploaded order with normalized data
      const status = needsReviewCount > 0 ? 'PENDING_REVIEW' : 'COMPLETED';
      
      await this.updateUploadedOrder(uploadedOrderId, {
        normalizedItems,
        status,
        needsReviewCount,
      });

      logger.info('✅ Product normalization completed', {
        uploadedOrderId,
        totalItems: extractedItems.length,
        matchedItems: normalizedItems.filter(i => i.matched).length,
        needsReview: needsReviewCount,
        status,
      });

      return {
        success: true,
        uploadedOrderId,
        totalItems: extractedItems.length,
        matchedItems: normalizedItems.filter(i => i.matched).length,
        needsReview: needsReviewCount,
        normalizedItems,
        status,
      };

    } catch (error) {
      logger.error('❌ Product normalization failed', {
        uploadedOrderId,
        error: error.message,
        stack: error.stack,
      });

      // Update status to FAILED
      await prisma.uploadedOrder.update({
        where: { id: uploadedOrderId },
        data: {
          status: 'FAILED',
          errorMessage: `Normalization failed: ${error.message}`,
          updatedAt: new Date(),
        },
      }).catch(err => logger.error('Failed to update error status', { error: err.message }));

      throw error;
    }
  }

  /**
   * Fetch uploaded order from database
   * @private
   */
  async fetchUploadedOrder(uploadedOrderId) {
    try {
      const uploadedOrder = await prisma.uploadedOrder.findUnique({
        where: { id: uploadedOrderId },
        include: {
          retailer: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  phoneNumber: true,
                },
              },
            },
          },
        },
      });

      return uploadedOrder;
    } catch (error) {
      logger.error('Failed to fetch uploaded order', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Match extracted item against Product table using fuzzy matching
   * @private
   */
  async matchProduct(item) {
    const searchName = item.name || item.productName;
    
    if (!searchName || typeof searchName !== 'string') {
      return {
        originalItem: item,
        matched: false,
        confidence: 0,
        productId: null,
        productName: null,
        needsReview: true,
        reason: 'Invalid or missing product name',
      };
    }

    try {
      // 1. Try exact match (case-insensitive)
      const exactMatch = await this.findExactMatch(searchName);
      if (exactMatch) {
        return {
          originalItem: item,
          matched: true,
          confidence: 1.0,
          matchType: 'exact',
          productId: exactMatch.id,
          productCode: exactMatch.productCode,
          productName: exactMatch.name,
          category: exactMatch.category,
          unit: exactMatch.unit,
          needsReview: false,
        };
      }

      // 2. Try fuzzy match using Levenshtein distance
      const fuzzyMatch = await this.findFuzzyMatch(searchName);
      if (fuzzyMatch) {
        const needsReview = fuzzyMatch.confidence < this.CONFIDENCE_THRESHOLD;
        
        return {
          originalItem: item,
          matched: true,
          confidence: fuzzyMatch.confidence,
          matchType: 'fuzzy',
          productId: fuzzyMatch.product.id,
          productCode: fuzzyMatch.product.productCode,
          productName: fuzzyMatch.product.name,
          category: fuzzyMatch.product.category,
          unit: fuzzyMatch.product.unit,
          needsReview,
          reason: needsReview ? `Low confidence match (${Math.round(fuzzyMatch.confidence * 100)}%)` : null,
          alternatives: fuzzyMatch.alternatives,
        };
      }

      // 3. Try full-text search (PostgreSQL)
      const fullTextMatch = await this.findFullTextMatch(searchName);
      if (fullTextMatch) {
        const needsReview = fullTextMatch.confidence < this.CONFIDENCE_THRESHOLD;
        
        return {
          originalItem: item,
          matched: true,
          confidence: fullTextMatch.confidence,
          matchType: 'fulltext',
          productId: fullTextMatch.product.id,
          productCode: fullTextMatch.product.productCode,
          productName: fullTextMatch.product.name,
          category: fullTextMatch.product.category,
          unit: fullTextMatch.product.unit,
          needsReview,
          reason: needsReview ? `Low confidence match (${Math.round(fullTextMatch.confidence * 100)}%)` : null,
        };
      }

      // 4. No match found
      return {
        originalItem: item,
        matched: false,
        confidence: 0,
        productId: null,
        productName: null,
        needsReview: true,
        reason: 'No matching product found',
      };

    } catch (error) {
      logger.error('Error matching product', {
        searchName,
        error: error.message,
      });

      return {
        originalItem: item,
        matched: false,
        confidence: 0,
        productId: null,
        productName: null,
        needsReview: true,
        reason: `Match error: ${error.message}`,
      };
    }
  }

  /**
   * Find exact match (case-insensitive)
   * @private
   */
  async findExactMatch(searchName) {
    const normalized = this.normalizeText(searchName);

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        productCode: true,
        name: true,
        category: true,
        unit: true,
      },
    });

    // Check for exact match after normalization
    for (const product of products) {
      if (this.normalizeText(product.name) === normalized) {
        return product;
      }
    }

    return null;
  }

  /**
   * Find fuzzy match using Levenshtein distance
   * @private
   */
  async findFuzzyMatch(searchName) {
    const normalized = this.normalizeText(searchName);

    // Get all active products
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        productCode: true,
        name: true,
        category: true,
        unit: true,
      },
    });

    // Calculate similarity scores
    const matches = products.map(product => ({
      product,
      confidence: this.calculateSimilarity(normalized, this.normalizeText(product.name)),
    }))
    .filter(m => m.confidence >= this.MIN_SIMILARITY)
    .sort((a, b) => b.confidence - a.confidence);

    if (matches.length === 0) {
      return null;
    }

    const bestMatch = matches[0];
    const alternatives = matches.slice(1, 4).map(m => ({
      productId: m.product.id,
      productName: m.product.name,
      confidence: m.confidence,
    }));

    return {
      product: bestMatch.product,
      confidence: bestMatch.confidence,
      alternatives: alternatives.length > 0 ? alternatives : null,
    };
  }

  /**
   * Find match using PostgreSQL full-text search
   * @private
   */
  async findFullTextMatch(searchName) {
    try {
      // Use PostgreSQL's similarity function (requires pg_trgm extension)
      // Fallback to ILIKE if extension not available
      const products = await prisma.$queryRaw`
        SELECT 
          id,
          product_code as "productCode",
          name,
          category,
          unit,
          SIMILARITY(name, ${searchName}) as similarity
        FROM products
        WHERE 
          is_active = true 
          AND deleted_at IS NULL
          AND name ILIKE ${'%' + searchName + '%'}
        ORDER BY similarity DESC
        LIMIT 5
      `;

      if (!products || products.length === 0) {
        return null;
      }

      const bestMatch = products[0];
      
      // Convert similarity to confidence (0-1 range)
      const confidence = bestMatch.similarity || 0.6;

      if (confidence < this.MIN_SIMILARITY) {
        return null;
      }

      return {
        product: {
          id: bestMatch.id,
          productCode: bestMatch.productCode,
          name: bestMatch.name,
          category: bestMatch.category,
          unit: bestMatch.unit,
        },
        confidence,
      };

    } catch (error) {
      // If pg_trgm extension not available, fall back to simple ILIKE
      logger.warn('Full-text search failed, using fallback', {
        error: error.message,
      });

      const products = await prisma.product.findMany({
        where: {
          name: {
            contains: searchName,
            mode: 'insensitive',
          },
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          productCode: true,
          name: true,
          category: true,
          unit: true,
        },
        take: 1,
      });

      if (products.length === 0) {
        return null;
      }

      return {
        product: products[0],
        confidence: 0.6, // Default confidence for ILIKE match
      };
    }
  }

  /**
   * Update uploaded order with normalized data
   * @private
   */
  async updateUploadedOrder(uploadedOrderId, data) {
    try {
      await prisma.uploadedOrder.update({
        where: { id: uploadedOrderId },
        data: {
          parsedData: {
            ...data,
          },
          status: data.status,
          updatedAt: new Date(),
        },
      });

      logger.info('Uploaded order updated with normalized data', {
        uploadedOrderId,
        status: data.status,
      });
    } catch (error) {
      logger.error('Failed to update uploaded order', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Normalize text for comparison
   * @private
   */
  normalizeText(text) {
    if (!text) return '';
    
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special chars
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   * Returns score between 0 and 1
   * @private
   */
  calculateSimilarity(str1, str2) {
    // Handle exact match
    if (str1 === str2) return 1.0;

    // Handle empty strings
    if (str1.length === 0 || str2.length === 0) return 0.0;

    // Calculate Levenshtein distance
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    
    // Convert distance to similarity score
    return 1 - (distance / maxLength);
  }

  /**
   * Levenshtein distance algorithm
   * Measures minimum number of edits needed to transform one string to another
   * @private
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    // Initialize matrix
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Batch normalize multiple uploaded orders
   * @param {Array<string>} uploadedOrderIds - Array of uploaded order IDs
   * @returns {Promise<Array>} Array of normalization results
   */
  async batchNormalize(uploadedOrderIds) {
    logger.info('🔄 Starting batch normalization', {
      count: uploadedOrderIds.length,
    });

    const results = [];

    for (const uploadedOrderId of uploadedOrderIds) {
      try {
        const result = await this.normalizeExtractedItems(uploadedOrderId);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          uploadedOrderId,
          error: error.message,
        });
      }
    }

    logger.info('✅ Batch normalization completed', {
      total: uploadedOrderIds.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    });

    return results;
  }
}

module.exports = new ProductNormalizationService();
