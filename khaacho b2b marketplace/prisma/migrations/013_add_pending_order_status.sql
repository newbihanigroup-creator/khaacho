-- Alter OrderStatus enum to add PENDING status
ALTER TYPE "OrderStatus" ADD VALUE 'PENDING';

-- Create index for efficient querying of pending orders
CREATE INDEX "orders_status_pending_idx" ON "orders" ("status") WHERE "status" = 'PENDING';
