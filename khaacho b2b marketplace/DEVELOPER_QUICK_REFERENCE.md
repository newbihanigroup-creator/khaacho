# Developer Quick Reference

## 🚀 Essential Commands

### Setup
```bash
npm install                          # Install dependencies
npm run db:generate                  # Generate Prisma client
npm run db:migrate:deploy            # Run migrations
npm run db:seed                      # Seed database
```

### Development
```bash
npm run dev                          # Start combined server
npm run dev:web                      # Start web server only
npm run dev:worker                   # Start workers only
```

### Production
```bash
npm run start                        # Start combined
npm run start:web                    # Start web server
npm run start:worker                 # Start workers
```

### Database
```bash
npm run db:studio                    # Open Prisma Studio
npm run db:reset                     # Reset database
psql $DATABASE_URL                   # Connect to database
```

### Testing
```bash
node test-analytics-intelligence.js  # Test analytics
node test-whatsapp-enhanced.js       # Test WhatsApp
npm test                             # Run all tests
```

## 📁 Key Files

### Configuration
- `.env` - Environment variables
- `src/config/index.js` - App configuration
- `src/config/database.js` - Database connection

### Entry Points
- `src/server.js` - Main server (combined)
- `src/server-web.js` - Web server only
- `src/server-worker.js` - Workers only

### Core Services
- `src/services/order.service.js` - Order management
- `src/services/atomicOrderCreation.service.js` - Transaction-safe orders
- `src/services/intelligenceEngine.service.js` - Analytics engine
- `src/services/productMatcher.service.js` - Fuzzy matching

### Controllers
- `src/controllers/order.controller.js` - Order endpoints
- `src/controllers/analytics.controller.js` - Analytics endpoints
- `src/controllers/enhancedWhatsapp.controller.js` - WhatsApp endpoints

### Workers
- `src/workers/analytics.worker.js` - Analytics jobs
- `src/workers/creditScore.worker.js` - Credit scoring
- `src/workers/orderRouting.worker.js` - Order routing

## 🔌 Key API Endpoints

### Authentication
```bash
POST /api/auth/login
POST /api/auth/register
GET  /api/auth/me
```

### Orders
```bash
GET  /api/orders
POST /api/orders
GET  /api/orders/:id
PUT  /api/orders/:id
POST /api/orders/:id/confirm
```

### WhatsApp
```bash
POST /api/whatsapp/enhanced/webhook
POST /api/whatsapp/enhanced/test/parse-order
POST /api/whatsapp/enhanced/test/match-product
GET  /api/whatsapp/enhanced/stats
```

### Analytics
```bash
GET  /api/analytics/ceo-dashboard
GET  /api/analytics/intelligence/retailer/:id
GET  /api/analytics/intelligence/vendor/:id
GET  /api/analytics/forecast/top20
POST /api/analytics/jobs/daily-aggregation
```

### Health Checks
```bash
GET  /api/health                     # Web server
GET  http://localhost:10001/health   # Worker health
```

## 🗄️ Database Quick Reference

### Key Tables
```sql
-- Core tables
users, retailers, vendors, products
orders, order_items, order_status_logs

-- Credit system
credit_ledgers, retailer_financial_metrics
credit_score_history, retailer_risk_scores

-- Analytics
daily_sales_summary
monthly_retailer_summary
vendor_performance_summary
credit_exposure_summary
platform_intelligence_metrics

-- WhatsApp
whatsapp_messages
pending_whatsapp_orders
```

### Common Queries
```sql
-- Get active retailers
SELECT * FROM retailers WHERE is_active = true;

-- Get pending orders
SELECT * FROM orders WHERE status = 'PENDING';

-- Get credit exposure
SELECT SUM(outstanding_debt) FROM retailers;

-- Get intelligence actions
SELECT * FROM intelligence_actions 
WHERE status = 'PENDING' 
ORDER BY priority DESC;
```

## 🔧 Environment Variables

### Required
```env
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
REDIS_URL=redis://localhost:6379
```

### Optional
```env
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

## 🐛 Debugging

### Check Logs
```bash
# All logs
tail -f logs/combined-*.log

# Errors only
tail -f logs/error-*.log

# WhatsApp logs
tail -f logs/whatsapp-*.log

# Order logs
tail -f logs/orders-*.log
```

### Database Debugging
```bash
# Check connections
SELECT * FROM pg_stat_activity;

# Check table sizes
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables 
WHERE schemaname = 'public';

# Check slow queries
SELECT query, mean_exec_time 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

### Redis Debugging
```bash
# Connect to Redis
redis-cli

# Check queue status
KEYS bull:*

# Monitor commands
MONITOR
```

## 🧪 Testing Patterns

### Test Order Creation
```javascript
const result = await AtomicOrderCreationService.createOrder(
  retailerId,
  [{ vendorProductId: 'uuid', quantity: 10 }],
  { notes: 'Test order' }
);
```

### Test Product Matching
```javascript
const match = await ProductMatcherService.findProduct('RICE-1KG');
console.log(match.confidence); // 100
```

### Test Order Parsing
```javascript
const result = await EnhancedOrderParserService.parseOrderMessage(
  'RICE-1KG x 10\nDAL-1KG x 5'
);
console.log(result.items.length); // 2
```

## 📊 Monitoring

### Key Metrics
```bash
# API response time
curl -w "@curl-format.txt" http://localhost:3000/api/health

# Database connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Redis memory
redis-cli INFO memory

# Queue status
curl http://localhost:3000/api/queues/stats
```

### Health Checks
```bash
# Web server
curl http://localhost:3000/health

# Worker
curl http://localhost:10001/health

# Database
psql $DATABASE_URL -c "SELECT 1;"

# Redis
redis-cli PING
```

## 🔐 Security Checklist

- [ ] JWT_SECRET is strong (32+ chars)
- [ ] Database credentials secured
- [ ] HTTPS enabled in production
- [ ] CORS whitelist configured
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] Helmet middleware active
- [ ] Audit logging enabled

## 🚨 Common Issues

### Port Already in Use
```bash
# Find process
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Database Connection Failed
```bash
# Check PostgreSQL is running
pg_isready

# Check connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1;"
```

### Redis Connection Failed
```bash
# Check Redis is running
redis-cli PING

# Start Redis
redis-server
```

### Migration Failed
```bash
# Reset database
npm run db:reset

# Run migrations manually
psql $DATABASE_URL -f prisma/migrations/XXX.sql
```

## 📚 Documentation Index

- `COMPLETE_SYSTEM_GUIDE.md` - Master guide
- `ANALYTICS_INTELLIGENCE.md` - Analytics system
- `WHATSAPP_ENHANCED.md` - WhatsApp processing
- `API_DOCUMENTATION.md` - API reference
- `DEPLOYMENT.md` - Deployment guide
- `FINAL_IMPLEMENTATION_STATUS.md` - Implementation status

## 💡 Pro Tips

1. **Use Prisma Studio** for database inspection
2. **Check logs first** when debugging
3. **Run tests** before deploying
4. **Monitor health endpoints** regularly
5. **Keep dependencies updated**
6. **Use transactions** for critical operations
7. **Log everything** important
8. **Test with real data** before production

## 🎯 Quick Wins

### Add New Endpoint
1. Create route in `src/routes/`
2. Create controller in `src/controllers/`
3. Create service in `src/services/`
4. Add validation
5. Test endpoint

### Add New Worker
1. Create worker in `src/workers/`
2. Add to `src/server-worker.js`
3. Configure cron schedule
4. Test worker

### Add New Migration
1. Update `prisma/schema.prisma`
2. Run `npm run db:migrate`
3. Or create SQL in `prisma/migrations/`
4. Test migration

---

**Keep this file handy for daily development!**
