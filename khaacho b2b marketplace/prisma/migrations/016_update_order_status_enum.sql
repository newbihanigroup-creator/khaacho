-- Update OrderStatus enum to include delivery tracking statuses
-- Note: This migration assumes existing orders will be updated to new statuses

-- Add new status values
ALTER TYPE "OrderStatus" ADD VALUE 'PLACED';
ALTER TYPE "OrderStatus" ADD VALUE 'PACKING';
ALTER TYPE "OrderStatus" ADD VALUE 'OUT_FOR_DELIVERY';

-- Update existing orders to use new status flow
-- Convert DRAFT -> PLACED
UPDATE "orders" SET "status" = 'PLACED' WHERE "status" = 'DRAFT';

-- Convert CONFIRMED -> ACCEPTED  
UPDATE "orders" SET "status" = 'ACCEPTED' WHERE "status" = 'CONFIRMED';

-- Convert VENDOR_ASSIGNED -> PENDING (if not already ACCEPTED)
UPDATE "orders" SET "status" = 'PENDING' WHERE "status" = 'VENDOR_ASSIGNED' AND "status" != 'ACCEPTED';

-- Add indexes for delivery tracking
CREATE INDEX "orders_status_created_idx" ON "orders"("status", "created_at" DESC);
CREATE INDEX "orders_vendor_status_idx" ON "orders"("vendor_id", "status");
CREATE INDEX "orders_delivery_tracking_idx" ON "orders"("status", "dispatched_at", "delivered_at");
