# Running Prisma Migrations on Render

## Overview

This guide explains how Prisma database migrations are automatically applied during Render deployment and how to troubleshoot migration issues.

## Automatic Migration Strategy

### Build Command Configuration

Both web and worker services in `render.yaml` use this build command:

```bash
npm install && npx prisma generate && npx prisma migrate deploy
```

This ensures:
1. Dependencies are installed
2. Prisma Client is generated
3. All pending migrations are applied to the database

### Why `migrate deploy` (Not `migrate dev`)

- `prisma migrate deploy` - Production-safe, applies pending migrations only
- `prisma migrate dev` - Development only, can reset database (DANGEROUS in production)

## First Deployment (Empty Database)

When deploying to a fresh database:

1. Render creates the PostgreSQL database
2. Build command runs `npx prisma migrate deploy`
3. All migrations in `prisma/migrations/` are applied in order
4. Database schema is created from scratch

### Migration Order

Migrations run in alphabetical/numerical order:
```
001_initial_schema.sql
002_performance_views.sql
003_security_policies.sql
...
025_pricing_engine.sql
```

## Subsequent Deployments

When you add new migrations:

1. Create migration locally: `npx prisma migrate dev --name feature_name`
2. Commit migration files to Git
3. Push to GitHub
4. Render detects changes and rebuilds
5. Only new migrations are applied

## Verifying Migrations

### Check Migration Status

After deployment, check Render logs for:

```
✔ Prisma Migrate applied the following migration(s):
  001_initial_schema
  002_performance_views
  ...
```

### Manual Verification

Connect to your Render database and check:

```sql
-- Check applied migrations
SELECT * FROM "_prisma_migrations" ORDER BY finished_at DESC;

-- Verify tables exist
\dt

-- Check specific table
\d users
```

## Common Issues and Solutions

### Issue 1: "relation does not exist"

**Error:**
```
error: relation "users" does not exist
```

**Cause:** Migrations didn't run during build

**Solution:**
1. Check `render.yaml` has correct buildCommand
2. Check Render build logs for migration errors
3. Manually trigger redeploy

### Issue 2: Migration Fails During Build

**Error:**
```
Error: P3009: migrate found failed migrations
```

**Cause:** Previous migration failed and left database in inconsistent state

**Solution:**
```bash
# Connect to Render database
psql $DATABASE_URL

# Mark failed migration as rolled back
UPDATE "_prisma_migrations" 
SET rolled_back_at = NOW() 
WHERE migration_name = 'failed_migration_name';

# Redeploy on Render
```

### Issue 3: Schema Drift Detected

**Error:**
```
Error: P3006: Migration `xxx` failed to apply cleanly to the shadow database
```

**Cause:** Database schema doesn't match migration history

**Solution:**
```bash
# Option 1: Reset database (DESTRUCTIVE - loses all data)
# Only use in development/staging
npx prisma migrate reset

# Option 2: Create baseline migration
npx prisma migrate resolve --applied "migration_name"
```

### Issue 4: Connection Timeout During Migration

**Error:**
```
Error: P1001: Can't reach database server
```

**Cause:** Database not ready or connection string incorrect

**Solution:**
1. Verify `DATABASE_URL` in Render environment variables
2. Check database is running in Render dashboard
3. Ensure database and web service are in same region

## Manual Migration Execution

If automatic migrations fail, you can run them manually:

### Method 1: Render Shell

```bash
# In Render Dashboard → Service → Shell
npx prisma migrate deploy
```

### Method 2: Local Connection

```bash
# Set DATABASE_URL to your Render database
export DATABASE_URL="postgresql://user:pass@host/db"

# Run migrations
npx prisma migrate deploy
```

### Method 3: Direct SQL

```bash
# Connect to database
psql $DATABASE_URL

# Run migration SQL manually
\i prisma/migrations/001_initial_schema.sql
```

## Migration Best Practices

### 1. Test Migrations Locally First

```bash
# Create and test migration locally
npx prisma migrate dev --name add_new_feature

# Verify it works
npm start

# Commit and push
git add prisma/migrations/
git commit -m "Add migration for new feature"
git push
```

### 2. Backup Before Major Migrations

```bash
# Backup production database before deploying
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

### 3. Use Transactions in Migrations

Wrap DDL statements in transactions when possible:

```sql
BEGIN;

ALTER TABLE orders ADD COLUMN new_field TEXT;
CREATE INDEX idx_orders_new_field ON orders(new_field);

COMMIT;
```

### 4. Avoid Destructive Changes

Never use in production migrations:
- `DROP TABLE`
- `DROP COLUMN` (without backup)
- `TRUNCATE`

Instead:
- Rename columns (keep old, add new)
- Soft delete (add `deleted_at` column)
- Migrate data gradually

## Monitoring Migration Health

### Check Migration Table

```sql
-- View all migrations
SELECT 
  migration_name,
  finished_at,
  applied_steps_count,
  logs
FROM "_prisma_migrations"
ORDER BY finished_at DESC;
```

### Check for Failed Migrations

```sql
-- Find failed migrations
SELECT * FROM "_prisma_migrations"
WHERE finished_at IS NULL
OR rolled_back_at IS NOT NULL;
```

## Rollback Strategy

### Rollback Last Migration

```bash
# Create down migration
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script > rollback.sql

# Apply rollback
psql $DATABASE_URL < rollback.sql
```

### Emergency Rollback

If deployment breaks production:

1. Revert Git commit with migration
2. Redeploy previous version
3. Manually rollback database changes
4. Fix migration locally
5. Redeploy with fixed migration

## Environment-Specific Migrations

### Development
```bash
npx prisma migrate dev
```

### Staging/Production
```bash
npx prisma migrate deploy
```

### CI/CD Pipeline
```yaml
# .github/workflows/deploy.yml
- name: Run migrations
  run: npx prisma migrate deploy
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Troubleshooting Checklist

- [ ] `render.yaml` includes `npx prisma migrate deploy` in buildCommand
- [ ] `DATABASE_URL` is correctly set in Render environment variables
- [ ] Database service is running and healthy
- [ ] Migration files exist in `prisma/migrations/` directory
- [ ] No failed migrations in `_prisma_migrations` table
- [ ] Prisma schema matches migration files
- [ ] No schema drift between environments

## Getting Help

If migrations still fail:

1. Check Render build logs for specific error
2. Verify database connection: `psql $DATABASE_URL`
3. Check migration status: `SELECT * FROM "_prisma_migrations"`
4. Review migration SQL files for syntax errors
5. Test migration locally before deploying

## Quick Reference

```bash
# Generate Prisma Client
npx prisma generate

# Apply pending migrations (production)
npx prisma migrate deploy

# Create new migration (development)
npx prisma migrate dev --name migration_name

# Check migration status
npx prisma migrate status

# Reset database (DESTRUCTIVE)
npx prisma migrate reset

# View migration history
npx prisma migrate history
```

## Related Documentation

- [Prisma Migrate Documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Render PostgreSQL Guide](https://render.com/docs/databases)
- [RENDER_NATIVE_DEPLOYMENT.md](./RENDER_NATIVE_DEPLOYMENT.md)
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
