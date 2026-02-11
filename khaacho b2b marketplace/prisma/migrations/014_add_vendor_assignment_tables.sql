-- Create OrderBroadcastLog table
CREATE TABLE "order_broadcast_logs" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "twilio_message_id" TEXT,
    "response_received_at" TIMESTAMP(3),
    "response_type" TEXT,

    CONSTRAINT "order_broadcast_logs_pkey" PRIMARY KEY ("id")
);

-- Create VendorOrderAcceptance table if it doesn't exist
CREATE TABLE IF NOT EXISTS "vendor_order_acceptances" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "routing_log_id" TEXT,
    "status" TEXT NOT NULL,
    "notified_at" TIMESTAMP(3),
    "response_deadline" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "response_time_minutes" INTEGER,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_order_acceptances_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraints
ALTER TABLE "order_broadcast_logs" ADD CONSTRAINT "order_broadcast_logs_order_id_fkey" 
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_broadcast_logs" ADD CONSTRAINT "order_broadcast_logs_vendor_id_fkey" 
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create indexes for performance
CREATE INDEX "order_broadcast_logs_order_id_idx" ON "order_broadcast_logs"("order_id");
CREATE INDEX "order_broadcast_logs_vendor_id_idx" ON "order_broadcast_logs"("vendor_id");
CREATE INDEX "order_broadcast_logs_sent_at_idx" ON "order_broadcast_logs"("sent_at");
CREATE INDEX "vendor_order_acceptances_order_id_idx" ON "vendor_order_acceptances"("order_id");
CREATE INDEX "vendor_order_acceptances_selected_vendor_id_idx" ON "vendor_order_acceptances"("selected_vendor_id");
CREATE INDEX "vendor_order_acceptances_created_at_idx" ON "vendor_order_acceptances"("created_at" DESC);
