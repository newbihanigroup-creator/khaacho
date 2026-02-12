const prisma = require('../config/database');
const logger = require('../utils/logger');
const Decimal = require('decimal.js');

class PricingService {
  /**
   * Create or update vendor pricing
   */
  async setVendorPricing(pricingData) {
    try {
      const {
        vendorId,
        productId,
        basePrice,
        hasBulkPricing = false,
        validFrom,
        validUntil,
        costPrice,
        marginPercentage,
        isPromotional = false,
        promotionalLabel,
        minOrderQuantity = 1,
        maxOrderQuantity,
        bulkTiers = []
      } = pricingData;

      console.log(`💰 Setting pricing for vendor ${vendorId}, product ${productId}`);

      const result = await prisma.$transaction(async (tx) => {
        // Deactivate existing active pricing
        await tx.$executeRaw`
          UPDATE vendor_pricing
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
          WHERE vendor_id = ${vendorId}::uuid
            AND product_id = ${productId}::uuid
            AND is_active = true
        `;

        // Create new pricing
        const pricing = await tx.$queryRaw`
          INSERT INTO vendor_pricing (
            vendor_id,
            product_id,
            base_price,
            has_bulk_pricing,
            valid_from,
            valid_until,
            cost_price,
            margin_percentage,
            is_promotional,
            promotional_label,
            min_order_quantity,
            max_order_quantity,
            is_active,
            created_at,
            updated_at
          ) VALUES (
            ${vendorId}::uuid,
            ${productId}::uuid,
            ${basePrice},
            ${hasBulkPricing},
            ${validFrom || new Date()}::timestamp,
            ${validUntil || null}::timestamp,
            ${costPrice || null},
            ${marginPercentage || null},
            ${isPromotional},
            ${promotionalLabel || null},
            ${minOrderQuantity},
            ${maxOrderQuantity || null},
            true,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
          RETURNING *
        `;

        const pricingId = pricing[0].id;

        // Create bulk pricing tiers if provided
        if (hasBulkPricing && bulkTiers.length > 0) {
          for (const tier of bulkTiers) {
            const discountPercentage = tier.discountPercentage || 
              ((basePrice - tier.tierPrice) / basePrice * 100);

            await tx.$executeRaw`
              INSERT INTO vendor_pricing_tiers (
                pricing_id,
                tier_name,
                minimum_quantity,
                maximum_quantity,
                tier_price,
                discount_percentage,
                priority,
                is_active,
                created_at,
                updated_at
              ) VALUES (
                ${pricingId}::uuid,
                ${tier.tierName || `Tier ${tier.minimumQuantity}+`},
                ${tier.minimumQuantity},
                ${tier.maximumQuantity || null},
                ${tier.tierPrice},
                ${discountPercentage},
                ${tier.priority || 0},
                true,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
              )
            `;
          }
        }

        // Get complete pricing with tiers
        const completePricing = await tx.$queryRaw`
          SELECT 
            vp.*,
            json_agg(
              json_build_object(
                'id', vpt.id,
                'tierName', vpt.tier_name,
                'minimumQuantity', vpt.minimum_quantity,
                'maximumQuantity', vpt.maximum_quantity,
                'tierPrice', vpt.tier_price,
                'discountPercentage', vpt.discount_percentage,
                'priority', vpt.priority
              ) ORDER BY vpt.minimum_quantity
            ) FILTER (WHERE vpt.id IS NOT NULL) as tiers
          FROM vendor_pricing vp
          LEFT JOIN vendor_pricing_tiers vpt ON vp.id = vpt.pricing_id AND vpt.is_active = true
          WHERE vp.id = ${pricingId}::uuid
          GROUP BY vp.id
        `;

        return completePricing[0];
      });

      console.log('✅ Vendor pricing set successfully');
      return result;

    } catch (error) {
      logger.error('Error setting vendor pricing', { error: error.message, pricingData });
      throw error;
    }
  }

  /**
   * Get best price for a product and quantity
   */
  async getBestPrice(productId, quantity, vendorId = null) {
    try {
      console.log(`🔍 Finding best price for product ${productId}, quantity ${quantity}`);

      const result = await prisma.$queryRaw`
        SELECT * FROM get_best_price_for_quantity(
          ${productId}::uuid,
          ${quantity},
          ${vendorId}::uuid
        )
      `;

      if (!result || result.length === 0) {
        console.log('❌ No pricing found');
        return null;
      }

      const bestPrice = result[0];
      console.log(`✅ Best price found: ${bestPrice.final_price} from ${bestPrice.vendor_name}`);

      return {
        vendorId: bestPrice.vendor_id,
        vendorName: bestPrice.vendor_name,
        pricingId: bestPrice.pricing_id,
        tierId: bestPrice.tier_id,
        basePrice: new Decimal(bestPrice.base_price),
        tierPrice: bestPrice.tier_price ? new Decimal(bestPrice.tier_price) : null,
        finalPrice: new Decimal(bestPrice.final_price),
        tierName: bestPrice.tier_name,
        discountPercentage: bestPrice.discount_percentage ? new Decimal(bestPrice.discount_percentage) : null,
        isPromotional: bestPrice.is_promotional,
        selectionReason: bestPrice.selection_reason,
        quantity
      };

    } catch (error) {
      logger.error('Error getting best price', { productId, quantity, error: error.message });
      throw error;
    }
  }

  /**
   * Get all prices for a product (comparison)
   */
  async getAllPricesForProduct(productId, quantity = 1) {
    try {
      console.log(`📊 Getting all prices for product ${productId}, quantity ${quantity}`);

      const prices = await prisma.$queryRaw`
        SELECT 
          vp.vendor_id,
          u.business_name as vendor_name,
          vp.id as pricing_id,
          vp.base_price,
          vp.is_promotional,
          vp.promotional_label,
          vp.min_order_quantity,
          vp.max_order_quantity,
          COALESCE(
            (
              SELECT vpt.tier_price
              FROM vendor_pricing_tiers vpt
              WHERE vpt.pricing_id = vp.id
                AND vpt.is_active = true
                AND vpt.minimum_quantity <= ${quantity}
                AND (vpt.maximum_quantity IS NULL OR vpt.maximum_quantity >= ${quantity})
              ORDER BY vpt.priority DESC, vpt.tier_price ASC
              LIMIT 1
            ),
            vp.base_price
          ) as final_price,
          (
            SELECT vpt.tier_name
            FROM vendor_pricing_tiers vpt
            WHERE vpt.pricing_id = vp.id
              AND vpt.is_active = true
              AND vpt.minimum_quantity <= ${quantity}
              AND (vpt.maximum_quantity IS NULL OR vpt.maximum_quantity >= ${quantity})
            ORDER BY vpt.priority DESC, vpt.tier_price ASC
            LIMIT 1
          ) as tier_name,
          (
            SELECT json_agg(
              json_build_object(
                'tierName', vpt.tier_name,
                'minimumQuantity', vpt.minimum_quantity,
                'tierPrice', vpt.tier_price,
                'discountPercentage', vpt.discount_percentage
              ) ORDER BY vpt.minimum_quantity
            )
            FROM vendor_pricing_tiers vpt
            WHERE vpt.pricing_id = vp.id AND vpt.is_active = true
          ) as available_tiers
        FROM vendor_pricing vp
        JOIN vendors v ON vp.vendor_id = v.id
        JOIN users u ON v.user_id = u.id
        WHERE vp.product_id = ${productId}::uuid
          AND vp.is_active = true
          AND (vp.valid_until IS NULL OR vp.valid_until > CURRENT_TIMESTAMP)
          AND v.is_approved = true
          AND v.deleted_at IS NULL
          AND (vp.min_order_quantity IS NULL OR vp.min_order_quantity <= ${quantity})
          AND (vp.max_order_quantity IS NULL OR vp.max_order_quantity >= ${quantity})
        ORDER BY final_price ASC
      `;

      console.log(`✅ Found ${prices.length} vendor prices`);
      return prices;

    } catch (error) {
      logger.error('Error getting all prices', { productId, quantity, error: error.message });
      throw error;
    }
  }

  /**
   * Record price selection in history (immutable)
   */
  async recordPriceHistory(historyData) {
    try {
      const {
        vendorId,
        productId,
        orderId,
        quantity,
        basePrice,
        tierPrice,
        tierName,
        finalPrice,
        pricingId,
        tierId,
        discountApplied,
        wasPromotional,
        selectionReason,
        competingPrices
      } = historyData;

      console.log(`📝 Recording price history for order ${orderId}`);

      await prisma.$executeRaw`
        INSERT INTO price_history (
          vendor_id,
          product_id,
          order_id,
          quantity,
          base_price,
          tier_price,
          tier_name,
          final_price,
          pricing_id,
          tier_id,
          discount_applied,
          was_promotional,
          selection_reason,
          competing_prices,
          created_at
        ) VALUES (
          ${vendorId}::uuid,
          ${productId}::uuid,
          ${orderId}::uuid,
          ${quantity},
          ${basePrice},
          ${tierPrice || null},
          ${tierName || null},
          ${finalPrice},
          ${pricingId}::uuid,
          ${tierId || null}::uuid,
          ${discountApplied || null},
          ${wasPromotional || false},
          ${selectionReason},
          ${competingPrices ? JSON.stringify(competingPrices) : null}::jsonb,
          CURRENT_TIMESTAMP
        )
      `;

      console.log('✅ Price history recorded');
      return { success: true };

    } catch (error) {
      logger.error('Error recording price history', { error: error.message, historyData });
      throw error;
    }
  }

  /**
   * Get price history for a product
   */
  async getPriceHistory(productId, options = {}) {
    try {
      const { vendorId, limit = 50, offset = 0, startDate, endDate } = options;

      let whereClause = `WHERE ph.product_id = $1::uuid`;
      const params = [productId];
      let paramIndex = 2;

      if (vendorId) {
        whereClause += ` AND ph.vendor_id = $${paramIndex}::uuid`;
        params.push(vendorId);
        paramIndex++;
      }

      if (startDate) {
        whereClause += ` AND ph.created_at >= $${paramIndex}::timestamp`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        whereClause += ` AND ph.created_at <= $${paramIndex}::timestamp`;
        params.push(endDate);
        paramIndex++;
      }

      const query = `
        SELECT 
          ph.*,
          u.business_name as vendor_name,
          p.name as product_name,
          o.order_number
        FROM price_history ph
        JOIN vendors v ON ph.vendor_id = v.id
        JOIN users u ON v.user_id = u.id
        JOIN products p ON ph.product_id = p.id
        LEFT JOIN orders o ON ph.order_id = o.id
        ${whereClause}
        ORDER BY ph.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const history = await prisma.$queryRawUnsafe(query, ...params);

      return history;

    } catch (error) {
      logger.error('Error getting price history', { productId, error: error.message });
      throw error;
    }
  }

  /**
   * Get vendor's pricing for a product
   */
  async getVendorPricing(vendorId, productId) {
    try {
      const pricing = await prisma.$queryRaw`
        SELECT 
          vp.*,
          p.name as product_name,
          p.product_code,
          json_agg(
            json_build_object(
              'id', vpt.id,
              'tierName', vpt.tier_name,
              'minimumQuantity', vpt.minimum_quantity,
              'maximumQuantity', vpt.maximum_quantity,
              'tierPrice', vpt.tier_price,
              'discountPercentage', vpt.discount_percentage,
              'priority', vpt.priority
            ) ORDER BY vpt.minimum_quantity
          ) FILTER (WHERE vpt.id IS NOT NULL) as tiers
        FROM vendor_pricing vp
        JOIN products p ON vp.product_id = p.id
        LEFT JOIN vendor_pricing_tiers vpt ON vp.id = vpt.pricing_id AND vpt.is_active = true
        WHERE vp.vendor_id = ${vendorId}::uuid
          AND vp.product_id = ${productId}::uuid
          AND vp.is_active = true
        GROUP BY vp.id, p.name, p.product_code
        LIMIT 1
      `;

      return pricing[0] || null;

    } catch (error) {
      logger.error('Error getting vendor pricing', { vendorId, productId, error: error.message });
      throw error;
    }
  }

  /**
   * Get all pricing for a vendor
   */
  async getAllVendorPricing(vendorId, options = {}) {
    try {
      const { isActive = true, limit = 100, offset = 0 } = options;

      const pricing = await prisma.$queryRaw`
        SELECT 
          vp.*,
          p.name as product_name,
          p.product_code,
          p.category,
          COUNT(vpt.id) as tier_count,
          MIN(vpt.tier_price) as lowest_tier_price
        FROM vendor_pricing vp
        JOIN products p ON vp.product_id = p.id
        LEFT JOIN vendor_pricing_tiers vpt ON vp.id = vpt.pricing_id AND vpt.is_active = true
        WHERE vp.vendor_id = ${vendorId}::uuid
          AND vp.is_active = ${isActive}
        GROUP BY vp.id, p.name, p.product_code, p.category
        ORDER BY p.name
        LIMIT ${limit} OFFSET ${offset}
      `;

      return pricing;

    } catch (error) {
      logger.error('Error getting all vendor pricing', { vendorId, error: error.message });
      throw error;
    }
  }

  /**
   * Update bulk pricing tiers
   */
  async updateBulkTiers(pricingId, tiers) {
    try {
      console.log(`📊 Updating bulk tiers for pricing ${pricingId}`);

      await prisma.$transaction(async (tx) => {
        // Deactivate existing tiers
        await tx.$executeRaw`
          UPDATE vendor_pricing_tiers
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
          WHERE pricing_id = ${pricingId}::uuid
        `;

        // Create new tiers
        for (const tier of tiers) {
          await tx.$executeRaw`
            INSERT INTO vendor_pricing_tiers (
              pricing_id,
              tier_name,
              minimum_quantity,
              maximum_quantity,
              tier_price,
              discount_percentage,
              priority,
              is_active,
              created_at,
              updated_at
            ) VALUES (
              ${pricingId}::uuid,
              ${tier.tierName},
              ${tier.minimumQuantity},
              ${tier.maximumQuantity || null},
              ${tier.tierPrice},
              ${tier.discountPercentage || null},
              ${tier.priority || 0},
              true,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
          `;
        }

        // Update pricing to indicate bulk pricing
        await tx.$executeRaw`
          UPDATE vendor_pricing
          SET has_bulk_pricing = true, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${pricingId}::uuid
        `;
      });

      console.log('✅ Bulk tiers updated');
      return { success: true };

    } catch (error) {
      logger.error('Error updating bulk tiers', { pricingId, error: error.message });
      throw error;
    }
  }

  /**
   * Get price comparison for a product
   */
  async getPriceComparison(productId) {
    try {
      const comparison = await prisma.$queryRaw`
        SELECT * FROM product_price_comparison
        WHERE product_id = ${productId}::uuid
        LIMIT 1
      `;

      if (!comparison || comparison.length === 0) {
        return null;
      }

      return comparison[0];

    } catch (error) {
      logger.error('Error getting price comparison', { productId, error: error.message });
      throw error;
    }
  }

  /**
   * Deactivate vendor pricing
   */
  async deactivatePricing(pricingId) {
    try {
      await prisma.$executeRaw`
        UPDATE vendor_pricing
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${pricingId}::uuid
      `;

      console.log('✅ Pricing deactivated');
      return { success: true };

    } catch (error) {
      logger.error('Error deactivating pricing', { pricingId, error: error.message });
      throw error;
    }
  }

  /**
   * Calculate price with tier for display
   */
  calculatePriceForQuantity(basePrice, tiers, quantity) {
    if (!tiers || tiers.length === 0) {
      return {
        finalPrice: basePrice,
        tierApplied: null,
        discount: 0
      };
    }

    // Find applicable tier
    const applicableTier = tiers
      .filter(t => 
        t.minimumQuantity <= quantity && 
        (t.maximumQuantity === null || t.maximumQuantity >= quantity)
      )
      .sort((a, b) => {
        // Sort by priority first, then by price
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.tierPrice - b.tierPrice;
      })[0];

    if (applicableTier) {
      return {
        finalPrice: applicableTier.tierPrice,
        tierApplied: applicableTier.tierName,
        discount: basePrice - applicableTier.tierPrice,
        discountPercentage: applicableTier.discountPercentage
      };
    }

    return {
      finalPrice: basePrice,
      tierApplied: null,
      discount: 0
    };
  }
}

module.exports = new PricingService();
