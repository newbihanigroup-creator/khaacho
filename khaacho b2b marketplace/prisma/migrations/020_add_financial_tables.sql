-- Create Invoice table
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL UNIQUE,
    "order_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "invoice_amount" DECIMAL(15,2) NOT NULL,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "delivery_charge" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "due_date" TIMESTAMP NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "balance_amount" DECIMAL(15,2) NOT NULL,
    "notes" TEXT,
    "internal_notes" TEXT,
    "invoice_url" TEXT,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- Create VendorSettlement table
CREATE TABLE "vendor_settlements" (
    "id" TEXT NOT NULL,
    "settlement_number" TEXT NOT NULL UNIQUE,
    "vendor_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "payable_amount" DECIMAL(15,2) NOT NULL,
    "platform_commission" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "settlement_amount" DECIMAL(15,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "settlement_date" TIMESTAMP,
    "notes" TEXT,
    "bank_reference" TEXT,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "vendor_settlements_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraints for invoices
ALTER TABLE "invoices" 
ADD CONSTRAINT "invoices_order_id_fkey" 
FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;

ALTER TABLE "invoices" 
ADD CONSTRAINT "invoices_retailer_id_fkey" 
FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE;

ALTER TABLE "invoices" 
ADD CONSTRAINT "invoices_vendor_id_fkey" 
FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE;

ALTER TABLE "invoices" 
ADD CONSTRAINT "invoices_created_by_fkey" 
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;

-- Add foreign key constraints for vendor settlements
ALTER TABLE "vendor_settlements" 
ADD CONSTRAINT "vendor_settlements_vendor_id_fkey" 
FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE;

ALTER TABLE "vendor_settlements" 
ADD CONSTRAINT "vendor_settlements_invoice_id_fkey" 
FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE;

ALTER TABLE "vendor_settlements" 
ADD CONSTRAINT "vendor_settlements_created_by_fkey" 
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");
CREATE INDEX "invoices_retailer_id_idx" ON "invoices"("retailer_id", "created_at" DESC);
CREATE INDEX "invoices_vendor_id_idx" ON "invoices"("vendor_id", "created_at" DESC);
CREATE INDEX "invoices_status_idx" ON "invoices"("status", "due_date");
CREATE INDEX "invoices_created_at_idx" ON "invoices"("created_at" DESC);
CREATE INDEX "invoices_invoice_number_idx" ON "invoices"("invoice_number");

CREATE INDEX "vendor_settlements_vendor_id_idx" ON "vendor_settlements"("vendor_id", "created_at" DESC);
CREATE INDEX "vendor_settlements_status_idx" ON "vendor_settlements"("status", "settlement_date");
CREATE INDEX "vendor_settlements_created_at_idx" ON "vendor_settlements"("created_at" DESC);
CREATE INDEX "vendor_settlements_settlement_number_idx" ON "vendor_settlements"("settlement_number");

-- Add invoice and settlement relations to users table
ALTER TABLE "users" 
ADD COLUMN "created_invoices" TEXT,
ADD COLUMN "created_settlements" TEXT;

-- Create indexes for user financial relations
CREATE INDEX "users_created_invoices_idx" ON "users"("created_invoices");
CREATE INDEX "users_created_settlements_idx" ON "users"("created_settlements");

-- Update existing orders to have invoice numbers
UPDATE "orders" 
SET "invoice_number" = 'INV' || LPAD(EXTRACT(EPOCH FROM "created_at") * 1000, 6) || '-' || id
WHERE "invoice_number" IS NULL;
