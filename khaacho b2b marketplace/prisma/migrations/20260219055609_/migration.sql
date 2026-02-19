-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'VENDOR', 'RETAILER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RECEIVED', 'PARSED', 'ROUTED', 'SENT_TO_VENDOR', 'PLACED', 'PENDING', 'ACCEPTED', 'PACKING', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'PARTIAL', 'OVERDUE', 'FAILED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('ORDER_DEBIT', 'ORDER_CREDIT', 'PAYMENT_DEBIT', 'PAYMENT_CREDIT', 'REFUND_DEBIT', 'REFUND_CREDIT', 'ADJUSTMENT_DEBIT', 'ADJUSTMENT_CREDIT', 'INTEREST_DEBIT', 'INTEREST_CREDIT');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'REVIEW');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'CREDIT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'APPROVE', 'REJECT', 'PAYMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'BLOCKED');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('AVAILABLE', 'OUT_OF_STOCK', 'LOW_STOCK', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "UploadedOrderStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "WhatsAppDeliveryStatus" AS ENUM ('PENDING', 'RESOLVED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "business_name" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "password_hash" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vendor_code" TEXT NOT NULL,
    "business_license" TEXT,
    "tax_id" TEXT,
    "gst_number" TEXT,
    "pan_number" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc_code" TEXT,
    "bank_name" TEXT,
    "credit_limit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "total_sales" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailer_risk_profiles" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "location" TEXT,
    "business_type" TEXT NOT NULL,
    "kyc_status" TEXT NOT NULL,
    "bank_account_verified" BOOLEAN NOT NULL DEFAULT false,
    "credit_limit" DECIMAL(15,2) NOT NULL,
    "current_outstanding" DECIMAL(15,2) NOT NULL,
    "available_credit" DECIMAL(15,2) NOT NULL,
    "risk_score" INTEGER NOT NULL DEFAULT 50,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "last_payment_date" TIMESTAMP(3),
    "average_payment_days" DECIMAL(8,2) NOT NULL,
    "overdue_days" INTEGER,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "default_flag" BOOLEAN NOT NULL DEFAULT false,
    "fraud_flag" BOOLEAN NOT NULL DEFAULT false,
    "admin_review_required" BOOLEAN NOT NULL DEFAULT false,
    "last_score_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retailer_risk_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "retailer_code" TEXT NOT NULL,
    "shop_name" TEXT NOT NULL,
    "gst_number" TEXT,
    "pan_number" TEXT,
    "credit_score" INTEGER NOT NULL DEFAULT 500,
    "credit_limit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "available_credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_spent" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "outstanding_debt" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "last_order_at" TIMESTAMP(3),
    "last_payment_at" TIMESTAMP(3),
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "risk_category" TEXT NOT NULL DEFAULT 'MEDIUM',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "retailers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "sub_category" TEXT,
    "brand" TEXT,
    "unit" TEXT NOT NULL,
    "hsn_code" TEXT,
    "barcode" TEXT,
    "min_order_qty" INTEGER NOT NULL DEFAULT 1,
    "max_order_qty" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_inventories" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT,
    "product_id" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "available_quantity" INTEGER NOT NULL,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "max_stock" INTEGER,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_products" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "vendor_price" DECIMAL(12,2) NOT NULL,
    "mrp" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "max_stock" INTEGER,
    "lead_time_days" INTEGER NOT NULL DEFAULT 0,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "last_restocked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vendor_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "vendor_id" TEXT,
    "product_id" TEXT,
    "vendor_price" DECIMAL(12,2) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(15,2) NOT NULL,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "shipping_charges" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "due_amount" DECIMAL(15,2) NOT NULL,
    "credit_used" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "internal_notes" TEXT,
    "cancellation_reason" TEXT,
    "whatsapp_message_id" TEXT,
    "invoice_number" TEXT,
    "invoice_url" TEXT,
    "expected_delivery" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "total" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledgers" (
    "id" TEXT NOT NULL,
    "ledger_number" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "order_id" TEXT,
    "payment_id" TEXT,
    "transaction_type" "TransactionType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "running_balance" DECIMAL(15,2) NOT NULL,
    "previous_balance" DECIMAL(15,2) NOT NULL,
    "description" TEXT NOT NULL,
    "reference_number" TEXT,
    "due_date" TIMESTAMP(3),
    "is_reversed" BOOLEAN NOT NULL DEFAULT false,
    "reversed_by" TEXT,
    "reversal_ledger_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "credit_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "payment_number" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "order_id" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'PENDING',
    "transaction_id" TEXT,
    "bank_reference" TEXT,
    "cheque_number" TEXT,
    "cheque_date" TIMESTAMP(3),
    "bank_name" TEXT,
    "notes" TEXT,
    "receipt_url" TEXT,
    "processed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "is_reversed" BOOLEAN NOT NULL DEFAULT false,
    "reversed_at" TIMESTAMP(3),
    "reversed_by" TEXT,
    "reversal_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "description" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT,
    "media_url" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "order_id" TEXT,
    "retailer_id" TEXT,
    "vendor_id" TEXT,
    "is_processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_logs" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "changed_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailer_financial_metrics" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "total_orders_last_30_days" INTEGER NOT NULL DEFAULT 0,
    "total_orders_lifetime" INTEGER NOT NULL DEFAULT 0,
    "total_purchase_value" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "average_order_value" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "payment_delay_average_days" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "on_time_payment_ratio" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "total_payments_made" INTEGER NOT NULL DEFAULT 0,
    "on_time_payments" INTEGER NOT NULL DEFAULT 0,
    "late_payments" INTEGER NOT NULL DEFAULT 0,
    "outstanding_credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit_limit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit_utilization_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "available_credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "order_frequency_per_week" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "days_since_first_order" INTEGER NOT NULL DEFAULT 0,
    "days_since_last_order" INTEGER,
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retailer_financial_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_score_history" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "payment_timeliness_score" INTEGER NOT NULL,
    "order_consistency_score" INTEGER NOT NULL,
    "credit_utilization_score" INTEGER NOT NULL,
    "account_age_score" INTEGER NOT NULL,
    "dispute_rate_score" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "explanation" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_score_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_config" (
    "id" TEXT NOT NULL,
    "config_key" TEXT NOT NULL,
    "config_value" JSONB NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_alerts" (
    "id" TEXT NOT NULL,
    "alert_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "retailer_id" TEXT,
    "vendor_id" TEXT,
    "order_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "is_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged_by" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_actions" (
    "id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "retailer_id" TEXT,
    "triggered_by" TEXT NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT NOT NULL,
    "is_automatic" BOOLEAN NOT NULL DEFAULT true,
    "executed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailer_risk_scores" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "risk_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "risk_level" TEXT NOT NULL DEFAULT 'LOW',
    "payment_delay_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "credit_utilization_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "order_pattern_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "overdue_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "days_overdue" INTEGER NOT NULL DEFAULT 0,
    "consecutive_delays" INTEGER NOT NULL DEFAULT 0,
    "unusual_activity_count" INTEGER NOT NULL DEFAULT 0,
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retailer_risk_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_routing_config" (
    "id" TEXT NOT NULL,
    "config_key" TEXT NOT NULL,
    "config_value" JSONB NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_routing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_routing_scores" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "availability_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "proximity_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "workload_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "price_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "reliability_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "overall_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "active_orders_count" INTEGER NOT NULL DEFAULT 0,
    "pending_orders_count" INTEGER NOT NULL DEFAULT 0,
    "average_fulfillment_time" INTEGER NOT NULL DEFAULT 0,
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_routing_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_routing_logs" (
    "id" TEXT NOT NULL,
    "order_id" TEXT,
    "retailer_id" TEXT,
    "routing_attempt" INTEGER NOT NULL DEFAULT 1,
    "vendors_evaluated" JSONB,
    "selected_vendor_id" TEXT,
    "fallback_vendor_id" TEXT,
    "routing_reason" TEXT NOT NULL,
    "routing_criteria" JSONB,
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "override_by" TEXT,
    "override_reason" TEXT,
    "acceptance_deadline" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_routing_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_broadcast_logs" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "twilio_message_id" TEXT,
    "response_received_at" TIMESTAMP(3),
    "responseType" TEXT,

    CONSTRAINT "order_broadcast_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_order_acceptances" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "routing_log_id" TEXT,
    "status" TEXT NOT NULL,
    "notified_at" TIMESTAMP(3),
    "response_deadline" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "response_time_minutes" INTEGER,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_order_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "due_amount" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_settlements" (
    "id" TEXT NOT NULL,
    "settlement_number" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "total_orders" INTEGER NOT NULL,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "commission_amount" DECIMAL(15,2) NOT NULL,
    "settled_amount" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "settlement_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,

    CONSTRAINT "vendor_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_orders" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "uploaded_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rejected_orders" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "order_data" JSONB NOT NULL,
    "rejection_reason" TEXT NOT NULL,
    "rejection_message" TEXT NOT NULL,
    "requested_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "available_credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "shortfall" DECIMAL(15,2),
    "metadata" JSONB,
    "is_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rejected_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_delivery_failures" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "error_message" TEXT,
    "error_code" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "status" "WhatsAppDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "next_retry_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_delivery_failures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_alert_thresholds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "metric_name" VARCHAR(100) NOT NULL,
    "warning_threshold" DECIMAL(15,2),
    "critical_threshold" DECIMAL(15,2),
    "comparison_operator" VARCHAR(10) NOT NULL DEFAULT 'gt',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "alert_message" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_alert_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "metric_name" VARCHAR(100) NOT NULL,
    "alert_level" VARCHAR(20) NOT NULL,
    "metric_value" DECIMAL(15,2) NOT NULL,
    "threshold_value" DECIMAL(15,2) NOT NULL,
    "alert_message" TEXT NOT NULL,
    "alert_metadata" JSONB DEFAULT '{}',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_metrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "metric_name" VARCHAR(100) NOT NULL,
    "metric_value" DECIMAL(15,2) NOT NULL,
    "metric_unit" VARCHAR(50),
    "metric_status" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "metric_metadata" JSONB DEFAULT '{}',
    "recorded_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hour_bucket" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_health_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "database_status" BOOLEAN NOT NULL,
    "database_response_time_ms" INTEGER,
    "redis_status" BOOLEAN NOT NULL,
    "redis_response_time_ms" INTEGER,
    "queue_backlog_total" INTEGER NOT NULL DEFAULT 0,
    "queue_backlog_details" JSONB DEFAULT '{}',
    "webhook_avg_latency_ms" DECIMAL(10,2),
    "failed_orders_last_hour" INTEGER NOT NULL DEFAULT 0,
    "ocr_failures_last_hour" INTEGER NOT NULL DEFAULT 0,
    "overall_health_score" INTEGER NOT NULL DEFAULT 100,
    "overall_status" VARCHAR(20) NOT NULL DEFAULT 'healthy',
    "snapshot_timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_number_idx" ON "users"("phone_number");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_rankings_vendor_id_key" ON "vendor_rankings"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_rankings_vendor_score_idx" ON "vendor_rankings"("vendor_score");

-- CreateIndex
CREATE INDEX "vendor_rankings_rank_idx" ON "vendor_rankings"("rank");

-- CreateIndex
CREATE INDEX "vendor_rankings_last_updated_idx" ON "vendor_rankings"("last_updated");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_user_id_key" ON "vendors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_vendor_code_key" ON "vendors"("vendor_code");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_tax_id_key" ON "vendors"("tax_id");

-- CreateIndex
CREATE INDEX "vendors_vendor_code_idx" ON "vendors"("vendor_code");

-- CreateIndex
CREATE INDEX "vendors_tax_id_idx" ON "vendors"("tax_id");

-- CreateIndex
CREATE INDEX "vendors_is_approved_deleted_at_idx" ON "vendors"("is_approved", "deleted_at");

-- CreateIndex
CREATE INDEX "vendors_created_at_idx" ON "vendors"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_risk_profiles_retailer_id_key" ON "retailer_risk_profiles"("retailer_id");

-- CreateIndex
CREATE INDEX "retailer_risk_profiles_risk_score_idx" ON "retailer_risk_profiles"("risk_score");

-- CreateIndex
CREATE INDEX "retailer_risk_profiles_riskLevel_idx" ON "retailer_risk_profiles"("riskLevel");

-- CreateIndex
CREATE INDEX "retailer_risk_profiles_overdue_days_idx" ON "retailer_risk_profiles"("overdue_days");

-- CreateIndex
CREATE INDEX "retailer_risk_profiles_last_payment_date_idx" ON "retailer_risk_profiles"("last_payment_date");

-- CreateIndex
CREATE INDEX "retailer_risk_profiles_default_flag_fraud_flag_idx" ON "retailer_risk_profiles"("default_flag", "fraud_flag");

-- CreateIndex
CREATE INDEX "retailer_risk_profiles_admin_review_required_idx" ON "retailer_risk_profiles"("admin_review_required");

-- CreateIndex
CREATE UNIQUE INDEX "retailers_user_id_key" ON "retailers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "retailers_retailer_code_key" ON "retailers"("retailer_code");

-- CreateIndex
CREATE INDEX "retailers_retailer_code_idx" ON "retailers"("retailer_code");

-- CreateIndex
CREATE INDEX "retailers_credit_score_idx" ON "retailers"("credit_score");

-- CreateIndex
CREATE INDEX "retailers_is_approved_deleted_at_idx" ON "retailers"("is_approved", "deleted_at");

-- CreateIndex
CREATE INDEX "retailers_last_order_at_idx" ON "retailers"("last_order_at");

-- CreateIndex
CREATE INDEX "retailers_outstanding_debt_idx" ON "retailers"("outstanding_debt");

-- CreateIndex
CREATE INDEX "retailers_created_at_idx" ON "retailers"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "products_product_code_key" ON "products"("product_code");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE INDEX "products_product_code_idx" ON "products"("product_code");

-- CreateIndex
CREATE INDEX "products_category_sub_category_idx" ON "products"("category", "sub_category");

-- CreateIndex
CREATE INDEX "products_is_active_deleted_at_idx" ON "products"("is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "vendor_inventories_vendor_id_status_idx" ON "vendor_inventories"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "vendor_inventories_product_id_status_idx" ON "vendor_inventories"("product_id", "status");

-- CreateIndex
CREATE INDEX "vendor_inventories_available_quantity_idx" ON "vendor_inventories"("available_quantity");

-- CreateIndex
CREATE INDEX "vendor_inventories_last_updated_idx" ON "vendor_inventories"("last_updated");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_inventories_vendor_id_product_id_key" ON "vendor_inventories"("vendor_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_products_sku_key" ON "vendor_products"("sku");

-- CreateIndex
CREATE INDEX "vendor_products_vendor_id_is_available_idx" ON "vendor_products"("vendor_id", "is_available");

-- CreateIndex
CREATE INDEX "vendor_products_product_id_idx" ON "vendor_products"("product_id");

-- CreateIndex
CREATE INDEX "vendor_products_sku_idx" ON "vendor_products"("sku");

-- CreateIndex
CREATE INDEX "vendor_products_stock_idx" ON "vendor_products"("stock");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_products_vendor_id_product_id_key" ON "vendor_products"("vendor_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_invoice_number_key" ON "orders"("invoice_number");

-- CreateIndex
CREATE INDEX "orders_retailer_id_created_at_idx" ON "orders"("retailer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_vendor_id_created_at_idx" ON "orders"("vendor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_order_number_idx" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_status_payment_status_idx" ON "orders"("status", "payment_status");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_delivered_at_idx" ON "orders"("delivered_at");

-- CreateIndex
CREATE INDEX "orders_invoice_number_idx" ON "orders"("invoice_number");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "order_items_created_at_idx" ON "order_items"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "credit_ledgers_ledger_number_key" ON "credit_ledgers"("ledger_number");

-- CreateIndex
CREATE INDEX "credit_ledgers_retailer_id_created_at_idx" ON "credit_ledgers"("retailer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "credit_ledgers_vendor_id_created_at_idx" ON "credit_ledgers"("vendor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "credit_ledgers_order_id_idx" ON "credit_ledgers"("order_id");

-- CreateIndex
CREATE INDEX "credit_ledgers_payment_id_idx" ON "credit_ledgers"("payment_id");

-- CreateIndex
CREATE INDEX "credit_ledgers_ledger_number_idx" ON "credit_ledgers"("ledger_number");

-- CreateIndex
CREATE INDEX "credit_ledgers_transaction_type_idx" ON "credit_ledgers"("transaction_type");

-- CreateIndex
CREATE INDEX "credit_ledgers_created_at_idx" ON "credit_ledgers"("created_at" DESC);

-- CreateIndex
CREATE INDEX "credit_ledgers_is_reversed_idx" ON "credit_ledgers"("is_reversed");

-- CreateIndex
CREATE INDEX "credit_ledgers_due_date_idx" ON "credit_ledgers"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_number_key" ON "payments"("payment_number");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_id_key" ON "payments"("transaction_id");

-- CreateIndex
CREATE INDEX "payments_retailer_id_created_at_idx" ON "payments"("retailer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_vendor_id_created_at_idx" ON "payments"("vendor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_payment_number_idx" ON "payments"("payment_number");

-- CreateIndex
CREATE INDEX "payments_transaction_id_idx" ON "payments"("transaction_id");

-- CreateIndex
CREATE INDEX "payments_payment_status_idx" ON "payments"("payment_status");

-- CreateIndex
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_is_reversed_idx" ON "payments"("is_reversed");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_message_id_key" ON "whatsapp_messages"("message_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_from_created_at_idx" ON "whatsapp_messages"("from", "created_at" DESC);

-- CreateIndex
CREATE INDEX "whatsapp_messages_to_created_at_idx" ON "whatsapp_messages"("to", "created_at" DESC);

-- CreateIndex
CREATE INDEX "whatsapp_messages_message_id_idx" ON "whatsapp_messages"("message_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversation_id_idx" ON "whatsapp_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_order_id_idx" ON "whatsapp_messages"("order_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_status_idx" ON "whatsapp_messages"("status");

-- CreateIndex
CREATE INDEX "whatsapp_messages_is_processed_idx" ON "whatsapp_messages"("is_processed");

-- CreateIndex
CREATE INDEX "whatsapp_messages_created_at_idx" ON "whatsapp_messages"("created_at" DESC);

-- CreateIndex
CREATE INDEX "order_status_logs_order_id_created_at_idx" ON "order_status_logs"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "order_status_logs_to_status_idx" ON "order_status_logs"("to_status");

-- CreateIndex
CREATE INDEX "order_status_logs_changed_by_idx" ON "order_status_logs"("changed_by");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_financial_metrics_retailer_id_key" ON "retailer_financial_metrics"("retailer_id");

-- CreateIndex
CREATE INDEX "credit_score_history_retailer_id_created_at_idx" ON "credit_score_history"("retailer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "credit_score_history_score_idx" ON "credit_score_history"("score");

-- CreateIndex
CREATE INDEX "credit_score_history_created_at_idx" ON "credit_score_history"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "risk_config_config_key_key" ON "risk_config"("config_key");

-- CreateIndex
CREATE INDEX "risk_alerts_retailer_id_created_at_idx" ON "risk_alerts"("retailer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "risk_alerts_alert_type_severity_idx" ON "risk_alerts"("alert_type", "severity");

-- CreateIndex
CREATE INDEX "risk_alerts_is_acknowledged_created_at_idx" ON "risk_alerts"("is_acknowledged", "created_at" DESC);

-- CreateIndex
CREATE INDEX "risk_actions_retailer_id_created_at_idx" ON "risk_actions"("retailer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "risk_actions_action_type_created_at_idx" ON "risk_actions"("action_type", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "retailer_risk_scores_retailer_id_key" ON "retailer_risk_scores"("retailer_id");

-- CreateIndex
CREATE INDEX "retailer_risk_scores_risk_level_idx" ON "retailer_risk_scores"("risk_level");

-- CreateIndex
CREATE INDEX "retailer_risk_scores_risk_score_idx" ON "retailer_risk_scores"("risk_score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "order_routing_config_config_key_key" ON "order_routing_config"("config_key");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_routing_scores_vendor_id_key" ON "vendor_routing_scores"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_routing_scores_vendor_id_idx" ON "vendor_routing_scores"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_routing_scores_overall_score_idx" ON "vendor_routing_scores"("overall_score" DESC);

-- CreateIndex
CREATE INDEX "order_routing_logs_order_id_idx" ON "order_routing_logs"("order_id");

-- CreateIndex
CREATE INDEX "order_routing_logs_selected_vendor_id_idx" ON "order_routing_logs"("selected_vendor_id");

-- CreateIndex
CREATE INDEX "order_routing_logs_created_at_idx" ON "order_routing_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "order_broadcast_logs_order_id_idx" ON "order_broadcast_logs"("order_id");

-- CreateIndex
CREATE INDEX "order_broadcast_logs_vendor_id_idx" ON "order_broadcast_logs"("vendor_id");

-- CreateIndex
CREATE INDEX "order_broadcast_logs_sent_at_idx" ON "order_broadcast_logs"("sent_at");

-- CreateIndex
CREATE INDEX "vendor_order_acceptances_vendor_id_status_idx" ON "vendor_order_acceptances"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "vendor_order_acceptances_order_id_idx" ON "vendor_order_acceptances"("order_id");

-- CreateIndex
CREATE INDEX "vendor_order_acceptances_status_response_deadline_idx" ON "vendor_order_acceptances"("status", "response_deadline");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_retailer_id_idx" ON "invoices"("retailer_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_due_date_idx" ON "invoices"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_settlements_settlement_number_key" ON "vendor_settlements"("settlement_number");

-- CreateIndex
CREATE INDEX "vendor_settlements_vendor_id_idx" ON "vendor_settlements"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_settlements_status_idx" ON "vendor_settlements"("status");

-- CreateIndex
CREATE INDEX "vendor_settlements_settlement_date_idx" ON "vendor_settlements"("settlement_date");

-- CreateIndex
CREATE INDEX "uploaded_orders_retailer_id_idx" ON "uploaded_orders"("retailer_id");

-- CreateIndex
CREATE INDEX "uploaded_orders_status_idx" ON "uploaded_orders"("status");

-- CreateIndex
CREATE INDEX "uploaded_orders_created_at_idx" ON "uploaded_orders"("created_at" DESC);

-- CreateIndex
CREATE INDEX "uploaded_orders_order_id_idx" ON "uploaded_orders"("order_id");

-- CreateIndex
CREATE INDEX "rejected_orders_retailer_id_created_at_idx" ON "rejected_orders"("retailer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "rejected_orders_rejection_reason_idx" ON "rejected_orders"("rejection_reason");

-- CreateIndex
CREATE INDEX "rejected_orders_is_reviewed_created_at_idx" ON "rejected_orders"("is_reviewed", "created_at" DESC);

-- CreateIndex
CREATE INDEX "rejected_orders_created_at_idx" ON "rejected_orders"("created_at" DESC);

-- CreateIndex
CREATE INDEX "rejected_orders_reviewed_by_idx" ON "rejected_orders"("reviewed_by");

-- CreateIndex
CREATE INDEX "whatsapp_delivery_failures_phone_number_idx" ON "whatsapp_delivery_failures"("phone_number");

-- CreateIndex
CREATE INDEX "whatsapp_delivery_failures_status_next_retry_at_idx" ON "whatsapp_delivery_failures"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "whatsapp_delivery_failures_idempotency_key_idx" ON "whatsapp_delivery_failures"("idempotency_key");

-- CreateIndex
CREATE INDEX "whatsapp_delivery_failures_created_at_idx" ON "whatsapp_delivery_failures"("created_at" DESC);

-- CreateIndex
CREATE INDEX "whatsapp_delivery_failures_status_next_retry_at_attempt_cou_idx" ON "whatsapp_delivery_failures"("status", "next_retry_at", "attempt_count");

-- CreateIndex
CREATE UNIQUE INDEX "health_alert_thresholds_metric_name_key" ON "health_alert_thresholds"("metric_name");

-- CreateIndex
CREATE INDEX "idx_health_alerts_level" ON "health_alerts"("alert_level", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_health_alerts_metric" ON "health_alerts"("metric_name", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_health_metrics_hour_bucket" ON "health_metrics"("hour_bucket" DESC);

-- CreateIndex
CREATE INDEX "idx_health_metrics_name_time" ON "health_metrics"("metric_name", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "idx_health_metrics_status" ON "health_metrics"("metric_status", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "idx_system_health_snapshots_status" ON "system_health_snapshots"("overall_status", "snapshot_timestamp" DESC);

-- CreateIndex
CREATE INDEX "idx_system_health_snapshots_time" ON "system_health_snapshots"("snapshot_timestamp" DESC);

-- AddForeignKey
ALTER TABLE "vendor_rankings" ADD CONSTRAINT "vendor_rankings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_risk_profiles" ADD CONSTRAINT "retailer_risk_profiles_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_inventories" ADD CONSTRAINT "vendor_inventories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_inventories" ADD CONSTRAINT "vendor_inventories_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_products" ADD CONSTRAINT "vendor_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_products" ADD CONSTRAINT "vendor_products_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledgers" ADD CONSTRAINT "credit_ledgers_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledgers" ADD CONSTRAINT "credit_ledgers_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledgers" ADD CONSTRAINT "credit_ledgers_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledgers" ADD CONSTRAINT "credit_ledgers_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_logs" ADD CONSTRAINT "order_status_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_logs" ADD CONSTRAINT "order_status_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_broadcast_logs" ADD CONSTRAINT "order_broadcast_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_broadcast_logs" ADD CONSTRAINT "order_broadcast_logs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_settlements" ADD CONSTRAINT "vendor_settlements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_settlements" ADD CONSTRAINT "vendor_settlements_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_settlements" ADD CONSTRAINT "vendor_settlements_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_orders" ADD CONSTRAINT "uploaded_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_orders" ADD CONSTRAINT "uploaded_orders_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rejected_orders" ADD CONSTRAINT "rejected_orders_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
