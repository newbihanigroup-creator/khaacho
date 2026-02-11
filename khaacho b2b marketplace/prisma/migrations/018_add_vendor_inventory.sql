-- Create VendorInventory table
CREATE TABLE "vendor_inventories" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "available_quantity" INTEGER NOT NULL,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "max_stock" INTEGER,
    "last_updated" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_inventories_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint for vendor-product combination
ALTER TABLE "vendor_inventories" 
ADD CONSTRAINT "vendor_inventories_vendor_product_unique" 
UNIQUE ("vendor_id", "product_id");

-- Add foreign key constraints
ALTER TABLE "vendor_inventories" 
ADD CONSTRAINT "vendor_inventories_vendor_id_fkey" 
FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE;

ALTER TABLE "vendor_inventories" 
ADD CONSTRAINT "vendor_inventories_product_id_fkey" 
FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX "vendor_inventories_vendor_status_idx" ON "vendor_inventories"("vendor_id", "status");
CREATE INDEX "vendor_inventories_product_status_idx" ON "vendor_inventories"("product_id", "status");
CREATE INDEX "vendor_inventories_quantity_idx" ON "vendor_inventories"("available_quantity");
CREATE INDEX "vendor_inventories_last_updated_idx" ON "vendor_inventories"("last_updated");

-- Add product_id and vendor_price to orders table
ALTER TABLE "orders" 
ADD COLUMN "product_id" TEXT,
ADD COLUMN "vendor_price" DECIMAL(12,2);

-- Add foreign key for product
ALTER TABLE "orders" 
ADD CONSTRAINT "orders_product_id_fkey" 
FOREIGN KEY ("product_id") REFERENCES "products"("id");

-- Add index for product_id in orders
CREATE INDEX "orders_product_id_idx" ON "orders"("product_id");

-- Create initial inventory for existing vendor products
INSERT INTO "vendor_inventories" (
    "id",
    "vendor_id", 
    "product_id",
    "price",
    "available_quantity",
    "min_stock",
    "status",
    "created_at",
    "updated_at"
)
SELECT 
    gen_random_uuid() as id,
    vp."vendor_id",
    vp."product_id",
    vp."vendor_price" as price,
    vp."stock" as available_quantity,
    10 as min_stock,
    CASE 
        WHEN vp."stock" > 0 THEN 'AVAILABLE'
        ELSE 'OUT_OF_STOCK'
    END as status,
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at
FROM "vendor_products" vp
JOIN "products" p ON vp."product_id" = p."id"
WHERE vp."is_available" = TRUE AND vp."stock" >= 0;

-- Update orders with product and vendor price info
UPDATE "orders" o
SET 
    "product_id" = oi."product_id",
    "vendor_price" = vp."vendor_price"
FROM "order_items" oi
JOIN "vendor_products" vp ON oi."vendor_product_id" = vp."id"
WHERE o."id" = oi."order_id";
