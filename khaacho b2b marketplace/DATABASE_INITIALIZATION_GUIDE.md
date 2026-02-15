# Database Initialization Guide

## Overview

Safe database initialization flow that ensures migrations run before the server starts, preventing "relation does not exist" errors.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Database Initialization Flow                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  npm start                                                   │
│       │                                                       │
│       ├─▶ 1. Run db-deploy.js                               │
│       │   ├─▶ Generate Prisma Client                        │
│       │   ├─▶ Deploy migrations                             │
│       │   └─▶ Verify schema                                 │
│       │                                                       │
│       ├─▶ 2. If successful → Start server                   │
│       │                                                       │
│       └─▶ 3. If failed → Exit with code 1                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Features

✅ Automatic migration deployment on startup
✅ Schema verification before server starts
✅ Clear error messages if migrations fail
✅ Prevents app from running with outdated schema
✅ Production-safe (uses `prisma migrate deploy`)
✅ Development-friendly (uses `prisma migrate dev`)

## NPM Scripts

### Production Scripts

```bash
# Start server (runs migrations first)
npm start

# Start web server only
npm run start:web

# Start worker server only
npm run start:worker

# Deploy database (migrations only)
npm run db:deploy
```

### Development Scripts

```bash
# Start with full initialization
npm run dev

# Initialize database
npm run db:init

# Create new migration
npm run db:migrate

# Generate Prisma Client
npm run db:generate

# Verify schema
node scripts/verify-schema.js
```

### Database Management

```bash
# Deploy migrations (production)
npm run db:migrate:deploy

# Verify migrations
npm run db:migrate:verify

# Open Prisma Studio
npm run db:studio

# Reset database (WARNING: deletes all data)
npm run db:reset

# Seed database
npm run db:seed
```

## Scripts

### 1. db-deploy.js (Production)

**Purpose**: Deploy migrations in production

**Steps**:
1. Generate Prisma Client
2. Run `prisma migrate deploy`
3. Verify tables exist
4. Exit with code 1 if any step fails

**Usage**:
```bash
node scripts/db-deploy.js
```

**Output**:
```
============================================================
DATABASE DEPLOYMENT
============================================================

[1/3] Generating Prisma Client...
✅ Prisma Client generated

[2/3] Deploying database migrations...
✅ Migrations deployed

[3/3] Verifying database schema...
✅ Schema verified (45 tables found)

============================================================
✅ DATABASE DEPLOYMENT COMPLETE
============================================================
Duration: 3.45s
```

### 2. db-init.js (Development)

**Purpose**: Full database initialization for development

**Steps**:
1. Verify database connection
2. Generate Prisma Client
3. Run migrations (prompts for name if needed)
4. Verify schema
5. Exit with code 1 if any step fails

**Usage**:
```bash
node scripts/db-init.js
```

**Output**:
```
============================================================
DATABASE INITIALIZATION
============================================================

[1] Verifying database connection
Running: SELECT 1 as health_check
✅ Database connection successful

[2] Generating Prisma Client
Running: npx prisma generate
✅ Prisma Client generation completed

[3] Running database migrations
Development mode: Using prisma migrate dev
Running: npx prisma migrate dev
✅ Database migrations completed

[4] Verifying schema is up to date
✅ Schema verification passed

============================================================
✅ DATABASE INITIALIZATION COMPLETE
============================================================
Duration: 5.23s
```

### 3. verify-schema.js

**Purpose**: Verify database schema is up to date

**Steps**:
1. Check database connection
2. List all tables
3. Verify critical tables exist

**Usage**:
```bash
node scripts/verify-schema.js
```

**Output**:
```
============================================================
SCHEMA VERIFICATION
============================================================

[1/3] Checking database connection...
✅ Database connected

[2/3] Checking tables...
✅ Found 45 tables:
   - users
   - retailers
   - vendors
   - orders
   - order_items
   ...

[3/3] Checking critical tables...
✅ All critical tables exist

============================================================
✅ SCHEMA VERIFICATION PASSED
============================================================
```

## Startup Flow

### Production (Render)

```bash
# Render runs:
npm install
npx prisma generate
npx prisma migrate deploy

# Then starts service:
npm run start:web
  ↓
node scripts/db-deploy.js
  ↓
node src/server-web.js
```

### Development (Local)

```bash
# Developer runs:
npm run dev
  ↓
node scripts/db-init.js
  ↓
nodemon src/server.js
```

## Error Handling

### Migration Failure

**Error**:
```
❌ Failed to deploy migrations
Error: P1001: Can't reach database server
```

**Solution**:
1. Check DATABASE_URL is set
2. Verify database is running
3. Check network connectivity
4. Verify credentials

### Missing Tables

**Error**:
```
❌ Schema verification failed
Error: relation "users" does not exist
```

**Solution**:
```bash
# Run migrations manually
npm run db:deploy

# Or reset database (WARNING: deletes data)
npm run db:reset
```

### Outdated Schema

**Error**:
```
❌ Schema verification failed
Error: Missing critical tables: webhook_events
```

**Solution**:
```bash
# Deploy latest migrations
npm run db:migrate:deploy

# Verify schema
node scripts/verify-schema.js
```

## Deployment

### Render Configuration

**render.yaml**:
```yaml
services:
  - type: web
    name: khaacho-api
    buildCommand: npm install && npx prisma generate && npx prisma migrate deploy
    startCommand: npm run start:web
```

**Build Process**:
1. `npm install` - Install dependencies
2. `npx prisma generate` - Generate Prisma Client
3. `npx prisma migrate deploy` - Deploy migrations
4. `npm run start:web` - Start server (runs db-deploy.js again for safety)

### Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `NODE_ENV` - Set to `production`

Example:
```bash
DATABASE_URL=postgresql://user:password@host:5432/database
NODE_ENV=production
```

## Migration Workflow

### Creating New Migration

```bash
# 1. Make changes to prisma/schema.prisma

# 2. Create migration
npm run db:migrate
# Prompts for migration name

# 3. Verify migration
npm run db:migrate:verify

# 4. Commit migration files
git add prisma/migrations/
git commit -m "Add new migration"

# 5. Deploy to production
git push
# Render automatically runs migrations
```

### Applying Migrations

**Development**:
```bash
npm run db:migrate
```

**Production**:
```bash
npm run db:migrate:deploy
```

## Safety Features

### 1. Automatic Verification

Every startup verifies:
- Database connection
- Prisma Client generated
- Migrations deployed
- Tables exist

### 2. Fail-Fast

If any step fails:
- Process exits with code 1
- Clear error message displayed
- Server does not start

### 3. Production Safety

Production uses `prisma migrate deploy`:
- Never prompts for input
- Only applies pending migrations
- Never creates new migrations
- Safe for CI/CD

### 4. Schema Validation

Verifies critical tables exist:
- users
- retailers
- vendors
- orders
- order_items

## Troubleshooting

### Problem: "relation does not exist"

**Cause**: Migrations not applied

**Solution**:
```bash
npm run db:deploy
```

### Problem: "Can't reach database server"

**Cause**: Database not accessible

**Solution**:
1. Check DATABASE_URL
2. Verify database is running
3. Check firewall rules
4. Test connection:
```bash
psql $DATABASE_URL -c "SELECT 1"
```

### Problem: "Migration failed"

**Cause**: Invalid migration or database state

**Solution**:
```bash
# Check migration status
npx prisma migrate status

# Resolve failed migration
npx prisma migrate resolve --applied <migration_name>

# Or reset (WARNING: deletes data)
npm run db:reset
```

### Problem: Server starts but queries fail

**Cause**: Schema mismatch

**Solution**:
```bash
# Verify schema
node scripts/verify-schema.js

# Regenerate Prisma Client
npm run db:generate

# Restart server
npm start
```

## Best Practices

### DO ✅

- Always run migrations before starting server
- Commit migration files to Git
- Test migrations in development first
- Use `db:deploy` in production
- Verify schema after deployment
- Keep DATABASE_URL secure

### DON'T ❌

- Don't skip migration verification
- Don't manually edit migration files
- Don't use `db:reset` in production
- Don't commit .env files
- Don't run `db:migrate` in production
- Don't ignore migration errors

## Files

### Scripts
- `scripts/db-deploy.js` - Production deployment
- `scripts/db-init.js` - Development initialization
- `scripts/verify-schema.js` - Schema verification
- `scripts/verify-migrations.js` - Migration verification

### Configuration
- `package.json` - NPM scripts
- `render.yaml` - Render deployment config
- `prisma/schema.prisma` - Database schema
- `prisma/migrations/` - Migration files

## Summary

The database initialization flow ensures:

✅ Migrations run automatically on deployment
✅ Tables exist before server starts
✅ Clear error messages if migrations fail
✅ Server stops if schema is outdated
✅ Production-safe deployment process
✅ Development-friendly workflow

No more "relation does not exist" errors!
