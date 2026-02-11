-- Add new transaction types to the enum
ALTER TYPE "TransactionType" ADD VALUE 'ORDER_DEBIT';
ALTER TYPE "TransactionType" ADD VALUE 'PAYMENT_CREDIT';
ALTER TYPE "TransactionType" ADD VALUE 'REFUND_CREDIT';
ALTER TYPE "TransactionType" ADD VALUE 'ADJUSTMENT_DEBIT';
ALTER TYPE "TransactionType" ADD VALUE 'INTEREST_DEBIT';

-- Add indexes for better ledger performance
CREATE INDEX "credit_ledger_retailer_balance_idx" ON "credit_ledgers"("retailer_id", "running_balance");
CREATE INDEX "credit_ledger_vendor_balance_idx" ON "credit_ledgers"("vendor_id", "running_balance");
CREATE INDEX "credit_ledger_transaction_type_idx" ON "credit_ledgers"("transaction_type");
CREATE INDEX "credit_ledger_due_date_idx" ON "credit_ledgers"("due_date") WHERE "due_date" IS NOT NULL;
