# Database Initialization - Quick Start

## Problem Solved

❌ Before: `relation "users" does not exist`
✅ After: Migrations run automatically before server starts

## NPM Scripts

### Production

```bash
# Start server (runs migrations first)
npm start

# Deploy database only
npm run db:deploy
```

### Development

```bash
# Start with initialization
npm run dev

# Initialize database
npm run db:init

# Create new migration
npm run db:migrate

# Generate Prisma Client
npm run db:generate
```

## Startup Flow

```
npm start
  ↓
Run db-deploy.js
  ├─ Generate Prisma Client
  ├─ Deploy migrations
  └─ Verify schema
  ↓
Start server (if successful)
  OR
Exit with code 1 (if failed)
```

## Scripts

### db-deploy.js (Production)

```bash
node scripts/db-deploy.js
```

**Output**:
```
[1/3] Generating Prisma Client...
✅ Prisma Client generated

[2/3] Deploying database migrations...
✅ Migrations deployed

[3/3] Verifying database schema...
✅ Schema verified (45 tables found)

✅ DATABASE DEPLOYMENT COMPLETE
```

### db-init.js (Development)

```bash
node scripts/db-init.js
```

**Output**:
```
[1] Verifying database connection
✅ Database connection successful

[2] Generating Prisma Client
✅ Prisma Client generation completed

[3] Running database migrations
✅ Database migrations completed

[4] Verifying schema is up to date
✅ Schema verification passed

✅ DATABASE INITIALIZATION COMPLETE
```

## Error Handling

### Migration Fails

```
❌ Failed to deploy migrations
Error: Can't reach database server
```

**Fix**:
1. Check DATABASE_URL
2. Verify database is running
3. Run: `npm run db:deploy`

### Missing Tables

```
❌ Schema verification failed
Error: relation "users" does not exist
```

**Fix**:
```bash
npm run db:deploy
```

## Deployment (Render)

**render.yaml**:
```yaml
buildCommand: npm install && npx prisma generate && npx prisma migrate deploy
startCommand: npm run start:web
```

**Process**:
1. Build: Install + Generate + Migrate
2. Start: Verify + Start Server

## Migration Workflow

```bash
# 1. Edit schema
vim prisma/schema.prisma

# 2. Create migration
npm run db:migrate

# 3. Commit
git add prisma/migrations/
git commit -m "Add migration"

# 4. Deploy
git push
# Render runs migrations automatically
```

## Verify Schema

```bash
node scripts/verify-schema.js
```

**Output**:
```
[1/3] Checking database connection...
✅ Database connected

[2/3] Checking tables...
✅ Found 45 tables

[3/3] Checking critical tables...
✅ All critical tables exist

✅ SCHEMA VERIFICATION PASSED
```

## Safety Features

✅ Automatic migration deployment
✅ Schema verification before startup
✅ Fail-fast on errors
✅ Production-safe (no prompts)
✅ Clear error messages

## Full Documentation

See `DATABASE_INITIALIZATION_GUIDE.md` for complete documentation.
