-- Add credit control fields to retailers table
ALTER TABLE "retailers" 
ADD COLUMN "credit_available" DECIMAL(15,2) DEFAULT 0,
ADD COLUMN "payment_due_days" INTEGER DEFAULT 30,
ADD COLUMN "credit_status" VARCHAR(20) DEFAULT 'ACTIVE',
ADD COLUMN "last_payment_date" TIMESTAMP,
ADD COLUMN "risk_score" DECIMAL(5,2),
ADD COLUMN "outstanding_debt" DECIMAL(15,2) DEFAULT 0,
ADD COLUMN "blocked_at" TIMESTAMP,
ADD COLUMN "blocked_reason" TEXT;

-- Update existing retailers with calculated values
UPDATE "retailers" SET 
    "credit_available" = "credit_limit" - COALESCE("outstanding_debt", 0),
    "outstanding_debt" = COALESCE("outstanding_debt", 0);

-- Drop old fields that are no longer needed
ALTER TABLE "retailers" 
DROP COLUMN IF EXISTS "commission_rate",
DROP COLUMN IF EXISTS "rating",
DROP COLUMN IF EXISTS "total_sales",
DROP COLUMN IF EXISTS "credit_score",
DROP COLUMN IF EXISTS "available_credit",
DROP COLUMN IF EXISTS "total_spent",
DROP COLUMN IF EXISTS "last_order_at",
DROP COLUMN IF EXISTS "is_approved",
DROP COLUMN IF EXISTS "approved_at",
DROP COLUMN IF EXISTS "approved_by",
DROP COLUMN IF EXISTS "risk_category";

-- Add indexes for credit control
CREATE INDEX "retailers_credit_status_idx" ON "retailers"("credit_status");
CREATE INDEX "retailers_credit_available_idx" ON "retailers"("credit_available");
CREATE INDEX "retailers_outstanding_debt_idx" ON "retailers"("outstanding_debt");
CREATE INDEX "retailers_blocked_at_idx" ON "retailers"("blocked_at");

-- Create retailer_risk_scores table for historical tracking
CREATE TABLE IF NOT EXISTS "retailer_risk_scores" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "score" DECIMAL(5,2),
    "risk_category" VARCHAR(20),
    "factors" JSONB,
    "calculated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retailer_risk_scores_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint
ALTER TABLE "retailer_risk_scores" 
ADD CONSTRAINT "retailer_risk_scores_retailer_id_fkey" 
FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE;

-- Create indexes for risk scores
CREATE INDEX "retailer_risk_scores_retailer_id_idx" ON "retailer_risk_scores"("retailer_id");
CREATE INDEX "retailer_risk_scores_calculated_at_idx" ON "retailer_risk_scores"("calculated_at" DESC);
