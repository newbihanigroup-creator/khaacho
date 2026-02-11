-- Create RetailerRiskProfile table
CREATE TABLE "retailer_risk_profiles" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "owner_name" TEXT,
    "location" TEXT,
    "business_type" TEXT,
    "kyc_status" TEXT,
    "bank_account_verified" BOOLEAN NOT NULL DEFAULT FALSE,
    "credit_limit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "current_outstanding" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "available_credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "risk_score" INTEGER NOT NULL DEFAULT 50,
    "risk_level" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    "last_payment_date" TIMESTAMP,
    "average_payment_days" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "overdue_days" INTEGER,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "default_flag" BOOLEAN NOT NULL DEFAULT FALSE,
    "fraud_flag" BOOLEAN NOT NULL DEFAULT FALSE,
    "admin_review_required" BOOLEAN NOT NULL DEFAULT FALSE,
    "last_score_update" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "retailer_risk_profiles_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint
ALTER TABLE "retailer_risk_profiles" 
ADD CONSTRAINT "retailer_risk_profiles_retailer_id_fkey" 
FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX "retailer_risk_profiles_risk_score_idx" ON "retailer_risk_profiles"("risk_score" DESC);
CREATE INDEX "retailer_risk_profiles_risk_level_idx" ON "retailer_risk_profiles"("risk_level");
CREATE INDEX "retailer_risk_profiles_overdue_days_idx" ON "retailer_risk_profiles"("overdue_days");
CREATE INDEX "retailer_risk_profiles_last_payment_date_idx" ON "retailer_risk_profiles"("last_payment_date");
CREATE INDEX "retailer_risk_profiles_default_flag_idx" ON "retailer_risk_profiles"("default_flag");
CREATE INDEX "retailer_risk_profiles_fraud_flag_idx" ON "retailer_risk_profiles"("fraud_flag");
CREATE INDEX "retailer_risk_profiles_admin_review_required_idx" ON "retailer_risk_profiles"("admin_review_required");
CREATE INDEX "retailer_risk_profiles_last_score_update_idx" ON "retailer_risk_profiles"("last_score_update");

-- Add risk profile relation to retailers table
ALTER TABLE "retailers" 
ADD COLUMN "risk_profile_id" TEXT;

-- Create index for risk profile
CREATE INDEX "retailers_risk_profile_id_idx" ON "retailers"("risk_profile_id");

-- Initialize risk profiles for existing retailers
INSERT INTO "retailer_risk_profiles" (
    "id",
    "retailer_id",
    "business_name",
    "owner_name",
    "location",
    "business_type",
    "kyc_status",
    "bank_account_verified",
    "credit_limit",
    "current_outstanding",
    "available_credit",
    "risk_score",
    "risk_level",
    "last_payment_date",
    "average_payment_days",
    "overdue_days",
    "total_orders",
    "default_flag",
    "fraud_flag",
    "admin_review_required",
    "created_at",
    "updated_at"
)
SELECT 
    gen_random_uuid() as id,
    r.id as retailer_id,
    COALESCE(r.user.businessName, 'Unknown Business') as business_name,
    COALESCE(r.user.name, 'Unknown Owner') as owner_name,
    r.location as location,
    'RETAILER' as business_type,
    'PENDING' as kyc_status,
    FALSE as bank_account_verified,
    r.creditLimit as credit_limit,
    r.outstandingDebt as current_outstanding,
    r.creditLimit.sub(r.outstandingDebt) as available_credit,
    50 as risk_score,
    'MEDIUM' as risk_level,
    r.lastPaymentDate as last_payment_date,
    CASE 
        WHEN r.totalOrders > 0 THEN 
            EXTRACT(EPOCH FROM (SELECT MAX(o.created_at) FROM "orders" WHERE "retailer_id" = r.id)) - 
            EXTRACT(EPOCH FROM MAX(p.processed_at) FROM "payments" WHERE "retailer_id" = r.id AND "payment_status" = 'PROCESSED')) / 86400
        ELSE 0
    END as average_payment_days,
    CASE 
        WHEN r.outstandingDebt > 0 AND r.creditLimit > 0 THEN 
            FLOOR(DATEDIFF('day', r.lastPaymentDate, CURRENT_DATE) - r.lastPaymentDate)
        ELSE 0
    END as overdue_days,
    r.totalOrders as total_orders,
    FALSE as default_flag,
    FALSE as fraud_flag,
    FALSE as admin_review_required,
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at
FROM "retailers" r
WHERE r."deleted_at" IS NULL AND r."is_approved" = TRUE;

-- Update retailers with risk profile references
UPDATE "retailers" 
SET "risk_profile_id" = rp.id
FROM "retailer_risk_profiles" rp
WHERE rp."retailer_id" = "retailers"."id";
