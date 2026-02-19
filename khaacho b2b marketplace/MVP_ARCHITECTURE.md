# 🚀 MVP Architecture - AI-Driven B2B Wholesale Marketplace

## Executive Summary

**Goal**: Launch a production-ready MVP for $100-200/month that can handle 1,000-5,000 orders/month and scale to 50K+ orders as you grow.

**Timeline**: 6-8 weeks to launch
**Initial Cost**: $100-200/month
**Scale-up Cost**: $500-1,000/month (at 50K orders)

---

## 1. TECH STACK (Cost-Optimized)

### Backend
```
Runtime:     Node.js 20 LTS (free, mature ecosystem)
Framework:   Express.js (lightweight, fast)
Language:    JavaScript (team familiarity > TypeScript complexity for MVP)
ORM:         Prisma (type-safe, great DX)
Validation:  Joi or Zod (runtime validation)
```

### Database
```
Primary:     PostgreSQL 15 (Render free tier → $7/month)
Cache:       Redis (Upstash free tier → $10/month at scale)
File Storage: Cloudflare R2 ($0.015/GB, cheaper than S3)
```

### AI Services
```
LLM:         OpenAI GPT-4o-mini ($0.15/1M tokens, 10x cheaper than GPT-4)
OCR:         Google Vision API (1,000 free/month, then $1.50/1K)
Fallback:    Tesseract.js (free, client-side OCR)
```

### Frontend
```
Admin:       React + Vite (fast, modern)
Buyer:       React + Vite (reuse components)
Vendor:      React + Vite (reuse components)
UI:          Tailwind CSS + shadcn/ui (free, beautiful)
State:       Zustand (simpler than Redux)
```

### Communication
```
WhatsApp:    Twilio WhatsApp API ($0.005/message)
SMS:         Twilio SMS ($0.0075/message)
Email:       Resend (3,000 free/month, then $20/month)
```

### Hosting (MVP Budget: $100-150/month)
```
Backend:     Render.com
  - Web Service:    $7/month (512MB RAM, 0.5 CPU)
  - PostgreSQL:     $7/month (256MB RAM, 1GB storage)
  - Redis:          Upstash free tier
  
Frontend:    Vercel (free tier, unlimited bandwidth)
CDN:         Cloudflare (free tier)
Domain:      Namecheap ($10/year)

Total MVP:   ~$100/month
```

---

## 2. SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL LAYER                            │
├─────────────────────────────────────────────────────────────┤
│  Cloudflare CDN (free)                                       │
│  ├─ DDoS protection                                          │
│  ├─ SSL/TLS                                                  │
│  └─ Static asset caching                                     │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                  │
┌───────▼────────┐              ┌─────────▼────────┐
│   Frontend     │              │   WhatsApp       │
│   (Vercel)     │              │   (Twilio)       │
├────────────────┤              └─────────┬────────┘
│ - Admin Panel  │                        │
│ - Buyer Portal │                        │
│ - Vendor Portal│                        │
└───────┬────────┘                        │
        │                                  │
        └────────────────┬─────────────────┘
                         │
                ┌────────▼────────┐
                │   API Gateway   │
                │   (Render)      │
                ├─────────────────┤
                │ - REST API      │
                │ - WebSocket     │
                │ - Webhook       │
                └────────┬────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                 │
┌───────▼────┐  ┌───────▼────┐  ┌────────▼────┐
│ PostgreSQL │  │   Redis    │  │  AI Services│
│  (Render)  │  │  (Upstash) │  │  (OpenAI)   │
├────────────┤  ├────────────┤  ├─────────────┤
│ - Users    │  │ - Sessions │  │ - GPT-4o-mini│
│ - Products │  │ - Cache    │  │ - Vision API│
│ - Orders   │  │ - Queue    │  └─────────────┘
│ - Analytics│  └────────────┘
└────────────┘
```

---

## 3. DATABASE DESIGN (PostgreSQL)

### Core Tables

```sql
-- Users (Buyers, Vendors, Admins)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL, -- 'BUYER', 'VENDOR', 'ADMIN'
  status VARCHAR(20) DEFAULT 'ACTIVE',
  whatsapp_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Buyer Profiles
CREATE TABLE buyer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(255),
  business_type VARCHAR(100),
  address TEXT,
  city VARCHAR(100),
  credit_limit DECIMAL(10,2) DEFAULT 0,
  credit_used DECIMAL(10,2) DEFAULT 0,
  payment_terms VARCHAR(50) DEFAULT 'COD',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Vendor Profiles
CREATE TABLE vendor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(255) NOT NULL,
  business_license VARCHAR(100),
  address TEXT,
  city VARCHAR(100),
  delivery_areas TEXT[], -- Array of cities
  min_order_amount DECIMAL(10,2) DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendor_profiles(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  unit VARCHAR(50), -- 'kg', 'liter', 'piece', 'box'
  price DECIMAL(10,2) NOT NULL,
  stock_quantity INTEGER DEFAULT 0,
  min_order_quantity INTEGER DEFAULT 1,
  image_url TEXT,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  buyer_id UUID REFERENCES buyer_profiles(id),
  vendor_id UUID REFERENCES vendor_profiles(id),
  status VARCHAR(50) DEFAULT 'PENDING',
  total_amount DECIMAL(10,2) NOT NULL,
  payment_status VARCHAR(50) DEFAULT 'PENDING',
  payment_method VARCHAR(50),
  delivery_address TEXT,
  delivery_date DATE,
  notes TEXT,
  source VARCHAR(50), -- 'WHATSAPP', 'WEB', 'MOBILE'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Order Items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name VARCHAR(255), -- Snapshot
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- WhatsApp Messages (for chat history)
CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  direction VARCHAR(20), -- 'INBOUND', 'OUTBOUND'
  message_type VARCHAR(50), -- 'TEXT', 'IMAGE', 'DOCUMENT'
  content TEXT,
  media_url TEXT,
  status VARCHAR(50),
  twilio_sid VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI Processing Logs (for debugging)
CREATE TABLE ai_processing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  input_type VARCHAR(50), -- 'TEXT', 'IMAGE'
  input_data TEXT,
  output_data JSONB,
  model VARCHAR(100),
  tokens_used INTEGER,
  processing_time_ms INTEGER,
  status VARCHAR(50),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Analytics (denormalized for speed)
CREATE TABLE daily_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  total_orders INTEGER DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  total_buyers INTEGER DEFAULT 0,
  total_vendors INTEGER DEFAULT 0,
  avg_order_value DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date)
);

-- Indexes for performance
CREATE INDEX idx_orders_buyer ON orders(buyer_id, created_at DESC);
CREATE INDEX idx_orders_vendor ON orders(vendor_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(status, created_at DESC);
CREATE INDEX idx_products_vendor ON products(vendor_id, status);
CREATE INDEX idx_whatsapp_user ON whatsapp_messages(user_id, created_at DESC);
```

---

## 4. API STRUCTURE (RESTful)

### Base URL
```
Production:  https://api.khaacho.com/v1
Development: http://localhost:3000/v1
```

### Authentication
```
Method: JWT (JSON Web Tokens)
Header: Authorization: Bearer <token>
Expiry: 7 days (refresh token: 30 days)
```

### Endpoints

#### Authentication
```
POST   /auth/register          # Register new user
POST   /auth/login             # Login (phone + OTP)
POST   /auth/verify-otp        # Verify OTP
POST   /auth/refresh           # Refresh access token
POST   /auth/logout            # Logout
```

#### Users
```
GET    /users/me               # Get current user profile
PUT    /users/me               # Update profile
GET    /users/:id              # Get user by ID (admin only)
```

#### Products
```
GET    /products               # List products (with filters)
GET    /products/:id           # Get product details
POST   /products               # Create product (vendor only)
PUT    /products/:id           # Update product (vendor only)
DELETE /products/:id           # Delete product (vendor only)
GET    /products/search        # Search products
```

#### Orders
```
GET    /orders                 # List orders (filtered by role)
GET    /orders/:id             # Get order details
POST   /orders                 # Create order
PUT    /orders/:id/status      # Update order status
GET    /orders/:id/tracking    # Get order tracking
POST   /orders/bulk            # Bulk order creation
```

#### WhatsApp
```
POST   /whatsapp/webhook       # Twilio webhook
POST   /whatsapp/send          # Send WhatsApp message
GET    /whatsapp/messages      # Get message history
POST   /whatsapp/parse-order   # Parse order from text/image
```

#### AI Services
```
POST   /ai/parse-text          # Parse order from text
POST   /ai/parse-image         # Parse order from image (OCR)
POST   /ai/suggest-products    # AI product suggestions
```

#### Analytics (Admin)
```
GET    /analytics/dashboard    # Dashboard summary
GET    /analytics/orders       # Order analytics
GET    /analytics/revenue      # Revenue analytics
GET    /analytics/buyers       # Buyer analytics
GET    /analytics/vendors      # Vendor analytics
```

### Response Format
```json
{
  "success": true,
  "data": { ... },
  "message": "Success message",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Error Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [...]
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## 5. HOSTING RECOMMENDATION (MVP Budget)

### Option 1: Render.com (Recommended for MVP)
**Total: ~$100/month**

```yaml
Services:
  - Web Service (Backend):
      Plan: Starter ($7/month)
      Specs: 512MB RAM, 0.5 CPU
      Auto-deploy: GitHub integration
      
  - PostgreSQL:
      Plan: Starter ($7/month)
      Specs: 256MB RAM, 1GB storage
      Backups: Daily automatic
      
  - Redis:
      Provider: Upstash (external)
      Plan: Free tier (10K commands/day)
      Upgrade: $10/month (100K commands/day)

Frontend:
  - Vercel (Free tier)
      Unlimited bandwidth
      Auto-deploy from GitHub
      Edge network (global CDN)

File Storage:
  - Cloudflare R2
      $0.015/GB storage
      Free egress (vs S3 $0.09/GB)
      
Domain:
  - Namecheap: $10/year
  - Cloudflare DNS: Free
```

**Pros:**
- ✅ Lowest cost for MVP
- ✅ Easy setup (no DevOps needed)
- ✅ Auto-scaling available
- ✅ Free SSL certificates
- ✅ GitHub integration

**Cons:**
- ⚠️ Limited to 512MB RAM initially
- ⚠️ Cold starts on free tier (upgrade to avoid)

### Option 2: Railway.app (Alternative)
**Total: ~$120/month**

```yaml
Services:
  - Backend: $5/month base + usage
  - PostgreSQL: $5/month base + usage
  - Redis: $5/month base + usage
  
Estimated: $15-20/month for MVP traffic
```

**Pros:**
- ✅ Pay-per-use pricing
- ✅ Better performance than Render free tier
- ✅ No cold starts

**Cons:**
- ⚠️ Costs can spike unexpectedly
- ⚠️ Less predictable billing

### Option 3: DigitalOcean (For Growth)
**Total: ~$200/month**

```yaml
Droplet: $24/month (2GB RAM, 1 CPU)
Managed PostgreSQL: $15/month
Managed Redis: $15/month
Spaces (S3): $5/month (250GB)
Load Balancer: $12/month (when needed)
```

**When to use:**
- After 10K orders/month
- When you need more control
- When costs justify managed services

---

## 6. SECURITY BASICS (MVP Essentials)

### Authentication & Authorization
```javascript
// JWT with RS256 (asymmetric keys)
const jwt = require('jsonwebtoken');

// Generate token
const token = jwt.sign(
  { userId, role },
  process.env.JWT_PRIVATE_KEY,
  { algorithm: 'RS256', expiresIn: '7d' }
);

// Verify token
const decoded = jwt.verify(
  token,
  process.env.JWT_PUBLIC_KEY,
  { algorithms: ['RS256'] }
);

// Role-based middleware
const requireRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};
```

### Input Validation
```javascript
const Joi = require('joi');

const orderSchema = Joi.object({
  vendorId: Joi.string().uuid().required(),
  items: Joi.array().items(
    Joi.object({
      productId: Joi.string().uuid().required(),
      quantity: Joi.number().integer().min(1).required()
    })
  ).min(1).required(),
  deliveryAddress: Joi.string().max(500),
  notes: Joi.string().max(1000)
});

// Validate
const { error, value } = orderSchema.validate(req.body);
if (error) {
  return res.status(400).json({ error: error.details });
}
```

### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

// API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests, please try again later'
});

app.use('/api/', apiLimiter);

// WhatsApp webhook (higher limit)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60 // 60 requests per minute
});

app.use('/api/v1/whatsapp/webhook', webhookLimiter);
```

### Environment Variables
```bash
# Never commit these!
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_PRIVATE_KEY=...
JWT_PUBLIC_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
OPENAI_API_KEY=...
GOOGLE_VISION_API_KEY=...
CLOUDFLARE_R2_ACCESS_KEY=...
CLOUDFLARE_R2_SECRET_KEY=...
```

### HTTPS Everywhere
```javascript
// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}
```

### CORS Configuration
```javascript
const cors = require('cors');

app.use(cors({
  origin: [
    'https://khaacho.com',
    'https://admin.khaacho.com',
    'https://vendor.khaacho.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### SQL Injection Prevention
```javascript
// ✅ GOOD: Use Prisma (parameterized queries)
const orders = await prisma.order.findMany({
  where: { buyerId: userId }
});

// ❌ BAD: Raw SQL with string concatenation
const orders = await prisma.$queryRaw(
  `SELECT * FROM orders WHERE buyer_id = '${userId}'`
);

// ✅ GOOD: Raw SQL with parameters
const orders = await prisma.$queryRaw`
  SELECT * FROM orders WHERE buyer_id = ${userId}
`;
```

### XSS Prevention
```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));
```

---

## 7. COST BREAKDOWN & OPTIMIZATION

### MVP Phase (0-1K orders/month)
```
Hosting:
  Render Web Service:        $7/month
  Render PostgreSQL:         $7/month
  Upstash Redis:            Free
  Vercel Frontend:          Free
  Cloudflare CDN:           Free
  Domain:                   $1/month

Services:
  Twilio WhatsApp:          $5-10/month (1K messages)
  OpenAI GPT-4o-mini:       $5-10/month (30K requests)
  Google Vision API:        Free (1K images/month)
  Resend Email:             Free (3K emails/month)

Total:                      $25-35/month
```

### Growth Phase (1K-10K orders/month)
```
Hosting:
  Render Web Service:        $25/month (upgrade to 2GB)
  Render PostgreSQL:         $20/month (upgrade to 2GB)
  Upstash Redis:            $10/month
  Vercel Frontend:          Free
  Cloudflare R2:            $5/month (storage)

Services:
  Twilio WhatsApp:          $50/month (10K messages)
  OpenAI GPT-4o-mini:       $30/month (200K requests)
  Google Vision API:        $15/month (10K images)
  Resend Email:             $20/month (10K emails)

Total:                      $175/month
```

### Scale Phase (10K-50K orders/month)
```
Hosting:
  Render Web Service:        $85/month (4GB, 2 CPU)
  Render PostgreSQL:         $50/month (4GB)
  Upstash Redis:            $30/month
  Vercel Frontend:          Free
  Cloudflare R2:            $15/month

Services:
  Twilio WhatsApp:          $250/month (50K messages)
  OpenAI GPT-4o-mini:       $150/month (1M requests)
  Google Vision API:        $75/month (50K images)
  Resend Email:             $20/month

Total:                      $675/month
```

### Cost Optimization Tips

1. **Use GPT-4o-mini instead of GPT-4**
   - 10x cheaper ($0.15 vs $1.50 per 1M tokens)
   - Good enough for order parsing

2. **Implement caching aggressively**
   ```javascript
   // Cache product catalog (1 hour)
   const products = await redis.get('products:all');
   if (!products) {
     const data = await prisma.product.findMany();
     await redis.setex('products:all', 3600, JSON.stringify(data));
     return data;
   }
   return JSON.parse(products);
   ```

3. **Batch AI requests**
   ```javascript
   // Process multiple orders in one API call
   const results = await openai.chat.completions.create({
     model: 'gpt-4o-mini',
     messages: orders.map(order => ({
       role: 'user',
       content: `Parse: ${order.text}`
     }))
   });
   ```

4. **Use Cloudflare R2 instead of S3**
   - Free egress (S3 charges $0.09/GB)
   - 10x cheaper storage

5. **Optimize database queries**
   ```javascript
   // ❌ BAD: N+1 query problem
   const orders = await prisma.order.findMany();
   for (const order of orders) {
     order.items = await prisma.orderItem.findMany({
       where: { orderId: order.id }
     });
   }

   // ✅ GOOD: Single query with include
   const orders = await prisma.order.findMany({
     include: { items: true }
   });
   ```

6. **Implement webhook retry logic**
   ```javascript
   // Twilio will retry failed webhooks
   // Return 200 quickly, process async
   app.post('/whatsapp/webhook', async (req, res) => {
     res.status(200).send('OK');
     
     // Process in background
     processWhatsAppMessage(req.body).catch(err => {
       logger.error('Failed to process message', err);
     });
   });
   ```

---

## 8. MVP FEATURE PRIORITIZATION

### Phase 1: Core MVP (Weeks 1-4)
**Goal: Get first 10 paying customers**

✅ **Must Have:**
- WhatsApp order receiving
- Basic text order parsing (AI)
- Product catalog (vendor can add)
- Order creation & tracking
- Admin dashboard (basic)
- Payment tracking (manual)

⬜ **Nice to Have:**
- Image OCR
- Buyer web portal
- Automated notifications
- Analytics

### Phase 2: Growth (Weeks 5-8)
**Goal: Reach 100 orders/month**

✅ **Add:**
- Image OCR for orders
- Buyer web dashboard
- Automated WhatsApp notifications
- Basic analytics
- Vendor portal

### Phase 3: Scale (Months 3-6)
**Goal: Reach 1,000 orders/month**

✅ **Add:**
- Advanced analytics
- Credit management
- Inventory tracking
- Mobile app (React Native)
- Multi-vendor routing

---

## 9. IMPLEMENTATION CHECKLIST

### Week 1: Setup
- [ ] Setup Render account
- [ ] Create PostgreSQL database
- [ ] Setup Redis (Upstash)
- [ ] Configure domain & SSL
- [ ] Setup GitHub repo
- [ ] Configure CI/CD

### Week 2: Backend Core
- [ ] Setup Express + Prisma
- [ ] Implement authentication
- [ ] Create user management
- [ ] Setup Twilio WhatsApp
- [ ] Implement webhook handler

### Week 3: AI Integration
- [ ] Integrate OpenAI API
- [ ] Build order parser
- [ ] Add Google Vision OCR
- [ ] Test parsing accuracy
- [ ] Add fallback logic

### Week 4: Frontend
- [ ] Build admin dashboard
- [ ] Create vendor portal
- [ ] Add product management
- [ ] Implement order tracking
- [ ] Deploy to Vercel

### Week 5: Testing
- [ ] End-to-end testing
- [ ] Load testing
- [ ] Security audit
- [ ] Bug fixes
- [ ] Documentation

### Week 6: Launch
- [ ] Soft launch (10 users)
- [ ] Monitor errors
- [ ] Gather feedback
- [ ] Iterate quickly
- [ ] Public launch

---

## 10. MONITORING & ALERTS (Free Tools)

### Application Monitoring
```javascript
// Sentry (free tier: 5K errors/month)
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1 // 10% of transactions
});

// Error tracking
app.use(Sentry.Handlers.errorHandler());
```

### Uptime Monitoring
```
UptimeRobot (free):
  - 50 monitors
  - 5-minute checks
  - Email/SMS alerts
  
Monitor:
  - https://api.khaacho.com/health
  - https://khaacho.com
  - https://admin.khaacho.com
```

### Log Management
```javascript
// Winston + Logtail (free tier: 1GB/month)
const winston = require('winston');
const { Logtail } = require('@logtail/node');

const logtail = new Logtail(process.env.LOGTAIL_TOKEN);

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),
    new logtail.winston()
  ]
});
```

### Performance Monitoring
```
Render built-in metrics (free):
  - CPU usage
  - Memory usage
  - Response time
  - Error rate
```

---

## 11. SECURITY CHECKLIST

- [ ] HTTPS everywhere (Cloudflare)
- [ ] JWT with RS256 (asymmetric keys)
- [ ] Rate limiting (express-rate-limit)
- [ ] Input validation (Joi/Zod)
- [ ] SQL injection prevention (Prisma)
- [ ] XSS prevention (Helmet)
- [ ] CORS configuration
- [ ] Environment variables (never commit)
- [ ] Secrets rotation (quarterly)
- [ ] Database backups (daily)
- [ ] Error logging (Sentry)
- [ ] Audit trail (user actions)

---

## 12. LAUNCH CHECKLIST

### Pre-Launch
- [ ] All features tested
- [ ] Security audit passed
- [ ] Performance tested (100 concurrent users)
- [ ] Database backed up
- [ ] Monitoring configured
- [ ] Error tracking enabled
- [ ] Documentation complete
- [ ] Support email setup

### Launch Day
- [ ] Deploy to production
- [ ] Verify all services running
- [ ] Test critical flows
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Announce launch

### Post-Launch (Week 1)
- [ ] Daily error review
- [ ] User feedback collection
- [ ] Performance optimization
- [ ] Bug fixes
- [ ] Feature requests prioritization

---

## Summary

**MVP Budget: $100-200/month**
**Timeline: 6-8 weeks**
**Scale: 1K-5K orders/month initially**

**Key Decisions:**
1. ✅ Render.com for hosting (easy, affordable)
2. ✅ PostgreSQL + Redis (proven stack)
3. ✅ GPT-4o-mini (10x cheaper than GPT-4)
4. ✅ Vercel for frontend (free, fast)
5. ✅ Cloudflare R2 for storage (cheapest)

**Next Steps:**
1. Setup Render account
2. Create GitHub repo
3. Follow implementation checklist
4. Launch in 6 weeks!

**Ready to build your MVP!** 🚀
