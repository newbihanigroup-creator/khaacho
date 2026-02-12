const prisma = require('../config/database');
const logger = require('../utils/logger');
const creditLedgerService = require('./creditLedger.service');
const orderStatusTransitionService = require('./orderStatusTransition.service');

class DeliveryService {
  /**
   * Create delivery assignment for an order
   */
  async createDelivery(orderData) {
    try {
      const { orderId, deliveryPersonId, estimatedDeliveryTime, deliveryAddress, recipientName, recipientPhone } = orderData;
      
      console.log('🚚 Creating delivery assignment for order:', orderId);
      
      // Verify order exists and is ready for delivery
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          retailer: {
            include: {
              user: true
            }
          }
        }
      });
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      if (!['DISPATCHED', 'OUT_FOR_DELIVERY'].includes(order.status)) {
        throw new Error(`Order must be DISPATCHED or OUT_FOR_DELIVERY to assign delivery. Current status: ${order.status}`);
      }
      
      // Check if delivery already exists
      const existingDelivery = await prisma.$queryRaw`
        SELECT id FROM deliveries WHERE order_id = ${orderId}::uuid LIMIT 1
      `;
      
      if (existingDelivery && existingDelivery.length > 0) {
        throw new Error('Delivery already assigned to this order');
      }
      
      // Generate delivery number
      const deliveryNumber = 'DEL' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
      
      const result = await prisma.$transaction(async (tx) => {
        // Create delivery record
        const delivery = await tx.$executeRaw`
          INSERT INTO deliveries (
            delivery_number,
            order_id,
            delivery_person_id,
            status,
            assigned_at,
            delivery_address,
            recipient_name,
            recipient_phone,
            estimated_delivery_time,
            created_at,
            updated_at
          ) VALUES (
            ${deliveryNumber},
            ${orderId}::uuid,
            ${deliveryPersonId}::uuid,
            'ASSIGNED'::delivery_status,
            CURRENT_TIMESTAMP,
            ${deliveryAddress},
            ${recipientName || order.retailer.user.name},
            ${recipientPhone || order.retailer.user.phoneNumber},
            ${estimatedDeliveryTime || null}::timestamp,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
          RETURNING *
        `;
        
        // Get the created delivery
        const createdDelivery = await tx.$queryRaw`
          SELECT * FROM deliveries WHERE delivery_number = ${deliveryNumber} LIMIT 1
        `;
        
        // Create status log
        await tx.$executeRaw`
          INSERT INTO delivery_status_logs (
            delivery_id,
            from_status,
            to_status,
            notes,
            created_at
          ) VALUES (
            ${createdDelivery[0].id}::uuid,
            NULL,
            'ASSIGNED'::delivery_status,
            'Delivery assigned to delivery person',
            CURRENT_TIMESTAMP
          )
        `;
        
        return createdDelivery[0];
      });
      
      console.log('✅ Delivery created:', deliveryNumber);
      return result;
      
    } catch (error) {
      logger.error('Error creating delivery', { error: error.message, orderData });
      throw error;
    }
  }

  /**
   * Update delivery status (immutable - creates new log entry)
   */
  async updateDeliveryStatus(deliveryId, newStatus, updateData = {}) {
    try {
      console.log(`📦 Updating delivery status: ${deliveryId} -> ${newStatus}`);
      
      const validStatuses = ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED'];
      if (!validStatuses.includes(newStatus)) {
        throw new Error(`Invalid status: ${newStatus}`);
      }
      
      const result = await prisma.$transaction(async (tx) => {
        // Get current delivery
        const currentDelivery = await tx.$queryRaw`
          SELECT * FROM deliveries WHERE id = ${deliveryId}::uuid LIMIT 1
        `;
        
        if (!currentDelivery || currentDelivery.length === 0) {
          throw new Error('Delivery not found');
        }
        
        const delivery = currentDelivery[0];
        const oldStatus = delivery.status;
        
        // Validate status transition
        this._validateStatusTransition(oldStatus, newStatus);
        
        // Prepare update fields
        const statusField = `${newStatus.toLowerCase()}_at`;
        const updateFields = {
          status: newStatus,
          [statusField]: new Date(),
          updated_at: new Date()
        };
        
        // Add optional fields
        if (updateData.deliveryNotes) updateFields.delivery_notes = updateData.deliveryNotes;
        if (updateData.failureReason) updateFields.failure_reason = updateData.failureReason;
        if (updateData.cancellationReason) updateFields.cancellation_reason = updateData.cancellationReason;
        if (updateData.signatureUrl) updateFields.signature_url = updateData.signatureUrl;
        if (updateData.photoUrl) updateFields.photo_url = updateData.photoUrl;
        if (updateData.location) updateFields.metadata = { ...delivery.metadata, location: updateData.location };
        
        // Update delivery record
        await tx.$executeRaw`
          UPDATE deliveries
          SET 
            status = ${newStatus}::delivery_status,
            ${newStatus === 'PICKED_UP' ? `picked_up_at = CURRENT_TIMESTAMP,` : ''}
            ${newStatus === 'OUT_FOR_DELIVERY' ? `out_for_delivery_at = CURRENT_TIMESTAMP,` : ''}
            ${newStatus === 'DELIVERED' ? `delivered_at = CURRENT_TIMESTAMP, actual_delivery_time = CURRENT_TIMESTAMP,` : ''}
            ${newStatus === 'FAILED' ? `failed_at = CURRENT_TIMESTAMP,` : ''}
            ${newStatus === 'CANCELLED' ? `cancelled_at = CURRENT_TIMESTAMP,` : ''}
            ${updateData.deliveryNotes ? `delivery_notes = ${updateData.deliveryNotes},` : ''}
            ${updateData.failureReason ? `failure_reason = ${updateData.failureReason},` : ''}
            ${updateData.cancellationReason ? `cancellation_reason = ${updateData.cancellationReason},` : ''}
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${deliveryId}::uuid
        `;
        
        // Create immutable status log
        await tx.$executeRaw`
          INSERT INTO delivery_status_logs (
            delivery_id,
            from_status,
            to_status,
            notes,
            location,
            created_at
          ) VALUES (
            ${deliveryId}::uuid,
            ${oldStatus}::delivery_status,
            ${newStatus}::delivery_status,
            ${updateData.notes || `Status changed from ${oldStatus} to ${newStatus}`},
            ${updateData.location ? JSON.stringify(updateData.location) : null}::jsonb,
            CURRENT_TIMESTAMP
          )
        `;
        
        // Get updated delivery
        const updatedDelivery = await tx.$queryRaw`
          SELECT d.*, o.order_number, o.retailer_id, o.total
          FROM deliveries d
          JOIN orders o ON d.order_id = o.id
          WHERE d.id = ${deliveryId}::uuid
          LIMIT 1
        `;
        
        // If delivered, trigger credit ledger update and order status update
        if (newStatus === 'DELIVERED') {
          console.log('✅ Delivery completed - triggering credit ledger update');
          
          const order = await tx.order.findUnique({
            where: { id: delivery.order_id },
            include: {
              retailer: true,
              vendor: true,
              items: true
            }
          });
          
          // Update order status to DELIVERED
          await tx.order.update({
            where: { id: delivery.order_id },
            data: {
              status: 'DELIVERED',
              deliveredAt: new Date()
            }
          });
          
          // Create credit ledger entry (order debit for retailer)
          await creditLedgerService.createOrderDebitEntry(order);
          
          console.log('💳 Credit ledger updated for delivered order');
        }
        
        return updatedDelivery[0];
      });
      
      console.log(`✅ Delivery status updated: ${newStatus}`);
      return result;
      
    } catch (error) {
      logger.error('Error updating delivery status', { deliveryId, newStatus, error: error.message });
      throw error;
    }
  }

  /**
   * Validate status transition
   */
  _validateStatusTransition(fromStatus, toStatus) {
    const validTransitions = {
      'ASSIGNED': ['PICKED_UP', 'CANCELLED'],
      'PICKED_UP': ['OUT_FOR_DELIVERY', 'FAILED', 'CANCELLED'],
      'OUT_FOR_DELIVERY': ['DELIVERED', 'FAILED', 'CANCELLED'],
      'DELIVERED': [], // Terminal state
      'FAILED': ['ASSIGNED'], // Can reassign
      'CANCELLED': [] // Terminal state
    };
    
    if (!validTransitions[fromStatus]?.includes(toStatus)) {
      throw new Error(`Invalid status transition from ${fromStatus} to ${toStatus}`);
    }
  }

  /**
   * Get delivery by ID
   */
  async getDeliveryById(deliveryId) {
    try {
      const delivery = await prisma.$queryRaw`
        SELECT 
          d.*,
          o.order_number,
          o.total as order_total,
          o.status as order_status,
          dp.name as delivery_person_name,
          dp.phone_number as delivery_person_phone,
          r.shop_name as retailer_shop_name,
          u.phone_number as retailer_phone
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        JOIN retailers r ON o.retailer_id = r.id
        JOIN users u ON r.user_id = u.id
        LEFT JOIN delivery_persons dp ON d.delivery_person_id = dp.id
        WHERE d.id = ${deliveryId}::uuid
        LIMIT 1
      `;
      
      if (!delivery || delivery.length === 0) {
        return null;
      }
      
      // Get status logs
      const statusLogs = await prisma.$queryRaw`
        SELECT * FROM delivery_status_logs
        WHERE delivery_id = ${deliveryId}::uuid
        ORDER BY created_at DESC
      `;
      
      return {
        ...delivery[0],
        statusLogs
      };
      
    } catch (error) {
      logger.error('Error getting delivery', { deliveryId, error: error.message });
      throw error;
    }
  }

  /**
   * Get deliveries for delivery person
   */
  async getDeliveriesForPerson(deliveryPersonId, options = {}) {
    try {
      const { status, limit = 50, offset = 0 } = options;
      
      let query = `
        SELECT 
          d.*,
          o.order_number,
          o.total as order_total,
          r.shop_name as retailer_shop_name,
          u.phone_number as retailer_phone
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        JOIN retailers r ON o.retailer_id = r.id
        JOIN users u ON r.user_id = u.id
        WHERE d.delivery_person_id = $1::uuid
      `;
      
      if (status) {
        query += ` AND d.status = $2::delivery_status`;
      }
      
      query += ` ORDER BY d.created_at DESC LIMIT $${status ? 3 : 2} OFFSET $${status ? 4 : 3}`;
      
      const deliveries = status
        ? await prisma.$queryRawUnsafe(query, deliveryPersonId, status, limit, offset)
        : await prisma.$queryRawUnsafe(query, deliveryPersonId, limit, offset);
      
      return deliveries;
      
    } catch (error) {
      logger.error('Error getting deliveries for person', { deliveryPersonId, error: error.message });
      throw error;
    }
  }

  /**
   * Get active deliveries
   */
  async getActiveDeliveries() {
    try {
      const deliveries = await prisma.$queryRaw`
        SELECT * FROM active_deliveries
        ORDER BY assigned_at ASC
      `;
      
      return deliveries;
      
    } catch (error) {
      logger.error('Error getting active deliveries', { error: error.message });
      throw error;
    }
  }

  /**
   * Get delivery person performance
   */
  async getDeliveryPersonPerformance(deliveryPersonId) {
    try {
      const performance = await prisma.$queryRaw`
        SELECT * FROM delivery_person_performance
        WHERE id = ${deliveryPersonId}::uuid
        LIMIT 1
      `;
      
      return performance[0] || null;
      
    } catch (error) {
      logger.error('Error getting delivery person performance', { deliveryPersonId, error: error.message });
      throw error;
    }
  }

  /**
   * Create delivery person
   */
  async createDeliveryPerson(personData) {
    try {
      const { name, phoneNumber, vehicleType, vehicleNumber, licenseNumber } = personData;
      
      const personCode = 'DP' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase();
      
      const person = await prisma.$queryRaw`
        INSERT INTO delivery_persons (
          person_code,
          name,
          phone_number,
          vehicle_type,
          vehicle_number,
          license_number,
          is_active,
          created_at,
          updated_at
        ) VALUES (
          ${personCode},
          ${name},
          ${phoneNumber},
          ${vehicleType || null},
          ${vehicleNumber || null},
          ${licenseNumber || null},
          true,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        RETURNING *
      `;
      
      return person;
      
    } catch (error) {
      logger.error('Error creating delivery person', { error: error.message });
      throw error;
    }
  }

  /**
   * Rate delivery
   */
  async rateDelivery(ratingData) {
    try {
      const { deliveryId, orderId, deliveryPersonId, retailerId, rating, feedback } = ratingData;
      
      if (rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }
      
      await prisma.$executeRaw`
        INSERT INTO delivery_ratings (
          delivery_id,
          order_id,
          delivery_person_id,
          retailer_id,
          rating,
          feedback,
          created_at
        ) VALUES (
          ${deliveryId}::uuid,
          ${orderId}::uuid,
          ${deliveryPersonId}::uuid,
          ${retailerId}::uuid,
          ${rating},
          ${feedback || null},
          CURRENT_TIMESTAMP
        )
      `;
      
      console.log('⭐ Delivery rated:', rating);
      return { success: true };
      
    } catch (error) {
      logger.error('Error rating delivery', { error: error.message });
      throw error;
    }
  }
}

module.exports = new DeliveryService();
