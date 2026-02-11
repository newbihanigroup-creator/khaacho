-- Create VendorRanking table
CREATE TABLE "vendor_rankings" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "vendor_score" DECIMAL(8,2) NOT NULL,
    "price_index" DECIMAL(5,2) NOT NULL,
    "acceptance_rate" DECIMAL(5,2) NOT NULL,
    "completion_rate" DECIMAL(5,2) NOT NULL,
    "avg_delivery_time" DECIMAL(8,2) NOT NULL,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "accepted_orders" INTEGER NOT NULL DEFAULT 0,
    "completed_orders" INTEGER NOT NULL DEFAULT 0,
    "cancelled_orders" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "last_updated" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_rankings_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint
ALTER TABLE "vendor_rankings" 
ADD CONSTRAINT "vendor_rankings_vendor_id_fkey" 
FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX "vendor_rankings_vendor_score_idx" ON "vendor_rankings"("vendor_score" DESC);
CREATE INDEX "vendor_rankings_rank_idx" ON "vendor_rankings"("rank");
CREATE INDEX "vendor_rankings_last_updated_idx" ON "vendor_rankings"("last_updated" DESC);

-- Initialize vendor rankings for existing vendors
INSERT INTO "vendor_rankings" (
    "id",
    "vendor_id",
    "vendor_score",
    "price_index",
    "acceptance_rate",
    "completion_rate",
    "avg_delivery_time",
    "total_orders",
    "accepted_orders",
    "completed_orders",
    "cancelled_orders",
    "rank",
    "created_at",
    "updated_at"
)
SELECT 
    gen_random_uuid() as id,
    v.id as vendor_id,
    CASE 
        WHEN v.rating >= 4.5 THEN 80.00
        WHEN v.rating >= 4.0 THEN 70.00
        WHEN v.rating >= 3.5 THEN 60.00
        WHEN v.rating >= 3.0 THEN 50.00
        WHEN v.rating >= 2.5 THEN 40.00
        WHEN v.rating >= 2.0 THEN 30.00
        ELSE 20.00
    END as vendor_score,
    50.00 as price_index, -- Default middle price index
    0.00 as acceptance_rate,
    0.00 as completion_rate,
    24.00 as avg_delivery_time, -- Default 24 hours
    0 as total_orders,
    0 as accepted_orders,
    0 as completed_orders,
    0 as cancelled_orders,
    1 as rank, -- Default rank
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at
FROM "vendors" v
WHERE v."is_approved" = TRUE AND v."deleted_at" IS NULL;

-- Add vendor_rankings relation to vendors table
ALTER TABLE "vendors" 
ADD COLUMN "rankings_id" TEXT;

-- Create index for vendor rankings in vendors
CREATE INDEX "vendors_rankings_idx" ON "vendors"("rankings_id");
