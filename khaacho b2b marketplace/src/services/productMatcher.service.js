const prisma = require('../config/database');
const logger = require('../utils/logger');

/**
 * Product Matcher Service
 * Handles fuzzy matching for product names with spelling variations
 */
class ProductMatcherService {
  
  /**
   * Find product by SKU or name with fuzzy matching
   * Tolerates spelling variations and common mistakes
   */
  async findProduct(searchTerm) {
    searchTerm = searchTerm.trim().toUpperCase();
    
    // 1. Try exact SKU match first (fastest)
    let vendorProduct = await prisma.vendorProduct.findFirst({
      where: {
        sku: searchTerm,
        isAvailable: true,
        deletedAt: null
      },
      include: {
        product: true,
        vendor: {
          include: {
            user: {
              select: { businessName: true }
            }
          }
        }
      },
      orderBy: {
        stock: 'desc' // Prefer products with more stock
      }
    });

    if (vendorProduct) {
      return {
        found: true,
        product: vendorProduct,
        matchType: 'exact_sku',
        confidence: 100
      };
    }

    // 2. Try product code match
    const productByCode = await prisma.product.findFirst({
      where: {
        productCode: searchTerm,
        isActive: true,
        deletedAt: null
      }
    });

    if (productByCode) {
      vendorProduct = await prisma.vendorProduct.findFirst({
        where: {
          productId: productByCode.id,
          isAvailable: true,
          deletedAt: null
        },
        include: {
          product: true,
          vendor: {
            include: {
              user: {
                select: { businessName: true }
              }
            }
          }
        },
        orderBy: {
          vendorPrice: 'asc' // Prefer cheaper option
        }
      });

      if (vendorProduct) {
        return {
          found: true,
          product: vendorProduct,
          matchType: 'product_code',
          confidence: 95
        };
      }
    }

    // 3. Try fuzzy name matching
    const fuzzyResult = await this.fuzzyMatchByName(searchTerm);
    if (fuzzyResult.found) {
      return fuzzyResult;
    }

    // 4. Try partial SKU match (e.g., "RICE" matches "RICE-1KG")
    const partialMatch = await prisma.vendorProduct.findFirst({
      where: {
        sku: {
          contains: searchTerm,
          mode: 'insensitive'
        },
        isAvailable: true,
        deletedAt: null
      },
      include: {
        product: true,
        vendor: {
          include: {
            user: {
              select: { businessName: true }
            }
          }
        }
      },
      orderBy: {
        stock: 'desc'
      }
    });

    if (partialMatch) {
      return {
        found: true,
        product: partialMatch,
        matchType: 'partial_sku',
        confidence: 70
      };
    }

    // 5. Not found - suggest similar products
    const suggestions = await this.findSimilarProducts(searchTerm);
    
    return {
      found: false,
      suggestions,
      searchTerm
    };
  }

  /**
   * Fuzzy match by product name
   * Handles spelling variations and common mistakes
   */
  async fuzzyMatchByName(searchTerm) {
    // Normalize search term
    const normalized = this.normalizeText(searchTerm);
    
    // Get all active products
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        productCode: true
      }
    });

    // Calculate similarity scores
    const matches = products.map(product => ({
      product,
      score: this.calculateSimilarity(normalized, this.normalizeText(product.name))
    }))
    .filter(m => m.score > 0.6) // Minimum 60% similarity
    .sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
      return { found: false };
    }

    // Get vendor product for best match
    const bestMatch = matches[0];
    const vendorProduct = await prisma.vendorProduct.findFirst({
      where: {
        productId: bestMatch.product.id,
        isAvailable: true,
        deletedAt: null
      },
      include: {
        product: true,
        vendor: {
          include: {
            user: {
              select: { businessName: true }
            }
          }
        }
      },
      orderBy: {
        vendorPrice: 'asc'
      }
    });

    if (!vendorProduct) {
      return { found: false };
    }

    return {
      found: true,
      product: vendorProduct,
      matchType: 'fuzzy_name',
      confidence: Math.round(bestMatch.score * 100),
      alternatives: matches.slice(1, 3).map(m => m.product.name) // Top 2 alternatives
    };
  }

  /**
   * Find similar products for suggestions
   */
  async findSimilarProducts(searchTerm, limit = 5) {
    const normalized = this.normalizeText(searchTerm);
    
    // Search by name similarity
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        productCode: true,
        category: true
      },
      take: 50 // Limit initial search
    });

    const matches = products.map(product => ({
      product,
      score: this.calculateSimilarity(normalized, this.normalizeText(product.name))
    }))
    .filter(m => m.score > 0.3) // Lower threshold for suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

    // Get vendor products for suggestions
    const suggestions = [];
    for (const match of matches) {
      const vendorProduct = await prisma.vendorProduct.findFirst({
        where: {
          productId: match.product.id,
          isAvailable: true,
          deletedAt: null
        },
        include: {
          product: true
        }
      });

      if (vendorProduct) {
        suggestions.push({
          sku: vendorProduct.sku,
          name: vendorProduct.product.name,
          price: parseFloat(vendorProduct.vendorPrice),
          similarity: Math.round(match.score * 100)
        });
      }
    }

    return suggestions;
  }

  /**
   * Normalize text for comparison
   * Removes special characters, extra spaces, converts to lowercase
   */
  normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special chars
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   * Returns score between 0 and 1
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
   * Batch find products for multiple search terms
   */
  async findProducts(searchTerms) {
    const results = [];
    
    for (const term of searchTerms) {
      const result = await this.findProduct(term);
      results.push({
        searchTerm: term,
        ...result
      });
    }

    return results;
  }

  /**
   * Validate product availability and stock
   */
  async validateAvailability(vendorProductId, quantity) {
    const vendorProduct = await prisma.vendorProduct.findUnique({
      where: { id: vendorProductId },
      include: {
        product: true,
        vendor: true
      }
    });

    if (!vendorProduct) {
      return {
        valid: false,
        error: 'Product not found'
      };
    }

    if (!vendorProduct.isAvailable) {
      return {
        valid: false,
        error: `${vendorProduct.product.name} is currently unavailable`
      };
    }

    if (vendorProduct.stock < quantity) {
      return {
        valid: false,
        error: `${vendorProduct.product.name}: Only ${vendorProduct.stock} units available (requested ${quantity})`
      };
    }

    const minOrderQty = vendorProduct.product.minOrderQty || 1;
    if (quantity < minOrderQty) {
      return {
        valid: false,
        error: `${vendorProduct.product.name}: Minimum order quantity is ${minOrderQty}`
      };
    }

    if (vendorProduct.product.maxOrderQty && quantity > vendorProduct.product.maxOrderQty) {
      return {
        valid: false,
        error: `${vendorProduct.product.name}: Maximum order quantity is ${vendorProduct.product.maxOrderQty}`
      };
    }

    return {
      valid: true,
      vendorProduct
    };
  }
}

module.exports = new ProductMatcherService();
