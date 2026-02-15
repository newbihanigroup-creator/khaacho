-- Migration: Add UploadedOrder table for image-based order processing
-- This table stores orders uploaded via images (photos of order forms, receipts, etc.)

CREATE TYPE "UploadedOrderStatus" AS ENUM (
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'PENDING_REVIEW'
);

CREATE TABLE "uploaded_orders" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "retailer_id" TEXT,
  "image_url" TEXT NOT NULL,
  "image_key" TEXT NOT NULL,
  "status" "UploadedOrderStatus" NOT NULL DEFAULT 'PROCESSING',
  "extracted_text" TEXT,
  "parsed_data" JSONB,
  "order_id" TEXT,
  "error_message" TEXT,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  
  CONSTRAINT "fk_uploaded_orders_retailer" FOREIGN KEY ("retailer_id") 
    REFERENCES "retailers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  
  CONSTRAINT "fk_uploaded_orders_order" FOREIGN KEY ("order_id") 
    REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Indexes for performance
CREATE INDEX "idx_uploaded_orders_retailer" ON "uploaded_orders"("retailer_id");
CREATE INDEX "idx_uploaded_orders_status" ON "uploaded_orders"("status");
CREATE INDEX "idx_uploaded_orders_created" ON "uploaded_orders"("created_at" DESC);
CREATE INDEX "idx_uploaded_orders_order" ON "uploaded_orders"("order_id");

-- Comments
COMMENT ON TABLE "uploaded_orders" IS 'Stores orders uploaded via images for OCR processing';
COMMENT ON COLUMN "uploaded_orders"."image_key" IS 'S3/Cloudinary key for image storage';
COMMENT ON COLUMN "uploaded_orders"."extracted_text" IS 'Raw text extracted from image via OCR';
COMMENT ON COLUMN "uploaded_orders"."parsed_data" IS 'Structured order data parsed from extracted text';
