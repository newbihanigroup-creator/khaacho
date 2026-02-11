# Run Database Migrations on Render

## Problem
Database tables don't exist in production. Prisma error: "The table `public.users` does not exist"

## Solution

### Option 1: Via Render Shell (Recommended)

1. Go to Render Dashboard → Your Service → Shell tab
2. Run these commands:

```bash
# Generate Prisma Client
npx prisma generate

# Run all migrations
npx prisma migrate deploy

# Seed the database
node src/database/seed.js
```

### Option 2: Via Local Connection

1. Get your production DATABASE_URL from Render environment variables
2. Run locally:

```bash
# Set production database URL
$env:DATABASE_URL="postgresql://user:pass@host/db"

# Run migrations
npx prisma migrate deploy

# Seed database
node src/database/seed.js
```

### Option 3: Add to Build Command (Automatic)

Update your Render build command to include migrations:

**Current:**
```
npm install && npx prisma generate
```

**New:**
```
npm install && npx prisma generate && npx prisma migrate deploy
```

**Note:** This runs migrations on every deploy automatically.

## Verify Migrations

After running migrations, check in Render Shell:

```bash
# Connect to PostgreSQL
psql $DATABASE_URL

# List tables
\dt

# Should see:
# - users
# - retailers
# - vendors
# - products
# - orders
# - order_items
# - payments
# - credit_score_history
# - system_alerts
# - webhook_events
# - etc.

# Exit
\q
```

## Expected Output

After successful migration:

```
✓ Generated Prisma Client
✓ Applied 14 migrations
✓ Database seeded with admin user
```

## Troubleshooting

### Migration fails with "already exists"
```bash
# Reset migration history (DANGER: only if safe)
npx prisma migrate resolve --applied "migration_name"
```

### Need to reset database completely
```bash
# WARNING: Deletes all data
npx prisma migrate reset --force
```

### Check migration status
```bash
npx prisma migrate status
```

## After Migrations Complete

1. Restart your Render service
2. Test WhatsApp webhook - should work without DB errors
3. Check logs for "Prisma Client initialized"
4. Test user login at `/admin/login.html`

## Current Migration Files

Located in `prisma/migrations/`:
- 001_initial_schema.sql
- 002_performance_views.sql
- 003_security_policies.sql
- 004_order_status_log.sql
- 005_performance_indexes.sql
- 006_financial_metrics.sql
- 007_credit_score_history.sql
- 008_risk_controls.sql
- 009_order_routing.sql
- 010_vendor_performance.sql
- 011_price_intelligence.sql
- 012_production_optimization.sql
- 012_whatsapp_automation.sql
- 013_failure_recovery.sql
- 014_monitoring_alerting.sql
