# 📋 MVP Quick Reference Card

## 💰 Budget Summary

| Phase | Orders/Month | Monthly Cost |
|-------|--------------|--------------|
| **MVP** | 0-1K | **$25-35** |
| **Growth** | 1K-10K | **$175** |
| **Scale** | 10K-50K | **$675** |

## 🛠️ Tech Stack (One-Liner)

```
Node.js + Express + Prisma + PostgreSQL + Redis + React + Tailwind
```

## 🚀 Hosting (MVP)

```
Backend:   Render.com ($7/month)
Database:  Render PostgreSQL ($7/month)
Cache:     Upstash Redis (Free)
Frontend:  Vercel (Free)
CDN:       Cloudflare (Free)
Storage:   Cloudflare R2 ($0.015/GB)

Total: ~$25/month + usage
```

## 📊 Database Tables (Core 8)

1. `users` - All users (buyers, vendors, admins)
2. `buyer_profiles` - Buyer details
3. `vendor_profiles` - Vendor details
4. `products` - Product catalog
5. `orders` - Orders
6. `order_items` - Order line items
7. `whatsapp_messages` - Chat history
8. `ai_processing_logs` - AI debugging

## 🔌 API Endpoints (Essential)

```
POST   /auth/login              # Login with phone + OTP
POST   /auth/verify-otp         # Verify OTP

GET    /products                # List products
POST   /products                # Create product (vendor)

GET    /orders                  # List orders
POST   /orders                  # Create order
PUT    /orders/:id/status       # Update status

POST   /whatsapp/webhook        # Twilio webhook
POST   /ai/parse-text           # Parse order text
POST   /ai/parse-image          # Parse order image (OCR)

GET    /analytics/dashboard     # Admin dashboard
```

## 🤖 AI Services

```
Text Parsing:  OpenAI GPT-4o-mini ($0.15/1M tokens)
Image OCR:     Google Vision API ($1.50/1K images)
Fallback:      Tesseract.js (free, client-side)
```

## 📱 WhatsApp Flow

```
1. User sends message → Twilio webhook
2. Parse message (text/image) → OpenAI/Vision API
3. Extract products & quantities
4. Create order in database
5. Send confirmation → WhatsApp
```

## 🔒 Security Essentials

```javascript
// 1. JWT Authentication
const token = jwt.sign({ userId, role }, privateKey, {
  algorithm: 'RS256',
  expiresIn: '7d'
});

// 2. Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

// 3. Input Validation
const schema = Joi.object({
  vendorId: Joi.string().uuid().required(),
  items: Joi.array().min(1).required()
});

// 4. CORS
app.use(cors({
  origin: ['https://khaacho.com'],
  credentials: true
}));

// 5. Helmet (Security Headers)
app.use(helmet());
```

## 📈 Performance Tips

```javascript
// 1. Cache product catalog (1 hour)
await redis.setex('products:all', 3600, JSON.stringify(products));

// 2. Use Prisma includes (avoid N+1)
const orders = await prisma.order.findMany({
  include: { items: true, buyer: true }
});

// 3. Batch AI requests
const results = await openai.chat.completions.create({
  messages: orders.map(o => ({ role: 'user', content: o.text }))
});

// 4. Index frequently queried fields
CREATE INDEX idx_orders_buyer ON orders(buyer_id, created_at DESC);

// 5. Paginate large result sets
const orders = await prisma.order.findMany({
  take: 20,
  skip: (page - 1) * 20
});
```

## 🚦 Launch Checklist

### Week 1-2: Setup
- [ ] Render account + PostgreSQL
- [ ] GitHub repo + CI/CD
- [ ] Twilio WhatsApp API
- [ ] OpenAI API key

### Week 3-4: Core Features
- [ ] Authentication (JWT)
- [ ] Product catalog
- [ ] Order creation
- [ ] WhatsApp integration

### Week 5: AI Integration
- [ ] Text order parsing
- [ ] Image OCR
- [ ] Accuracy testing

### Week 6: Frontend
- [ ] Admin dashboard
- [ ] Vendor portal
- [ ] Order tracking

### Week 7: Testing
- [ ] End-to-end tests
- [ ] Load testing
- [ ] Security audit

### Week 8: Launch
- [ ] Soft launch (10 users)
- [ ] Monitor & fix bugs
- [ ] Public launch

## 📊 Monitoring (Free Tools)

```
Errors:    Sentry (5K errors/month free)
Uptime:    UptimeRobot (50 monitors free)
Logs:      Logtail (1GB/month free)
Metrics:   Render built-in (free)
```

## 💡 Cost Optimization

1. **Use GPT-4o-mini** (10x cheaper than GPT-4)
2. **Cache aggressively** (Redis)
3. **Batch AI requests** (reduce API calls)
4. **Use Cloudflare R2** (free egress vs S3)
5. **Optimize queries** (Prisma includes)
6. **Implement pagination** (limit result sets)

## 🎯 MVP Features (Phase 1)

✅ **Must Have:**
- WhatsApp order receiving
- Text order parsing (AI)
- Product catalog
- Order tracking
- Admin dashboard
- Payment tracking (manual)

⬜ **Later:**
- Image OCR
- Buyer web portal
- Automated notifications
- Advanced analytics

## 📞 Support Setup

```
Email:     support@khaacho.com (Resend free tier)
WhatsApp:  Business account (Twilio)
Docs:      Notion (free) or GitBook (free)
Status:    StatusPage.io (free tier)
```

## 🔗 Useful Links

```
Render:           https://render.com
Vercel:           https://vercel.com
Upstash:          https://upstash.com
Cloudflare:       https://cloudflare.com
Twilio:           https://twilio.com/whatsapp
OpenAI:           https://platform.openai.com
Google Vision:    https://cloud.google.com/vision
Sentry:           https://sentry.io
```

## 🚀 Quick Deploy Commands

```bash
# 1. Clone repo
git clone https://github.com/your-org/khaacho.git
cd khaacho

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your keys

# 4. Setup database
npx prisma migrate deploy
npx prisma generate

# 5. Start development
npm run dev

# 6. Deploy to Render
git push origin main
# Render auto-deploys from GitHub
```

## 📱 Test WhatsApp Integration

```bash
# Send test message
curl -X POST https://api.twilio.com/2010-04-01/Accounts/$ACCOUNT_SID/Messages.json \
  -u $ACCOUNT_SID:$AUTH_TOKEN \
  -d "From=whatsapp:+14155238886" \
  -d "To=whatsapp:+977XXXXXXXXX" \
  -d "Body=Test message from Khaacho"
```

## 🎓 Learning Resources

```
Node.js:      https://nodejs.org/docs
Express:      https://expressjs.com
Prisma:       https://prisma.io/docs
React:        https://react.dev
Tailwind:     https://tailwindcss.com
OpenAI:       https://platform.openai.com/docs
```

---

**Print this page and keep it handy during development!** 📄
