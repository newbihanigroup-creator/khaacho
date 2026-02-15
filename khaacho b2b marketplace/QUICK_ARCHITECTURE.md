# 🏗️ System Architecture - Quick View

## 📱 User Flow

```
Retailer → Upload Image → API → Queue → Worker → Database → Wholesalers
```

## 🔄 Image Processing Pipeline

```
1. UPLOAD
   ├─ Multer receives file
   ├─ GCS stores privately
   └─ Creates UploadedOrder (PROCESSING)

2. OCR
   ├─ Vision API extracts text
   └─ Saves to extractedText

3. EXTRACTION
   ├─ OpenAI parses items
   └─ Saves to parsedData

4. NORMALIZATION
   ├─ Matches products
   └─ Updates productId

5. RANKING
   ├─ Scores wholesalers
   └─ Gets top 5 per product

6. BROADCAST
   ├─ Creates RFQs
   └─ Notifies wholesalers

7. COMPLETE
   └─ Status: COMPLETED/PENDING_REVIEW
```

## 🏢 Services Architecture

```
┌─────────────────────────────────────────┐
│         RENDER.COM PLATFORM             │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │  Web Service │  │ Worker Service  │ │
│  │  (HTTP API)  │  │ (Background)    │ │
│  │  Port: 10000 │  │ Processes Jobs  │ │
│  └──────┬───────┘  └────────┬────────┘ │
│         │                   │          │
│         └───────┬───────────┘          │
│                 │                      │
│         ┌───────▼────────┐             │
│         │   PostgreSQL   │             │
│         │   (Database)   │             │
│         └────────────────┘             │
│                                        │
│         ┌────────────────┐             │
│         │     Redis      │             │
│         │ (Queue/Cache)  │             │
│         └────────────────┘             │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│       GOOGLE CLOUD PLATFORM             │
├─────────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────────┐ │
│  │ Cloud Storage│  │   Vision API    │ │
│  │  (Images)    │  │     (OCR)       │ │
│  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│            OPENAI                       │
├─────────────────────────────────────────┤
│         GPT-4o-mini API                 │
│      (Item Extraction)                  │
└─────────────────────────────────────────┘
```

## 📊 Data Flow

```
Image → GCS → Vision API → Text
Text → OpenAI → Items
Items → Database → Products
Products → Ranking → Wholesalers
Wholesalers → RFQs → Notifications
```

## 🔐 Security Layers

```
1. Rate Limiting (100 req/15min)
2. JWT Authentication
3. Role-Based Authorization
4. Input Validation
5. File Type/Size Validation
6. Private GCS Storage
7. Signed URLs (1hr expiry)
8. SQL Injection Protection
9. XSS Protection
10. CORS Configuration
```

## 📦 Key Dependencies

- Express.js (Web framework)
- Prisma (Database ORM)
- Bull (Queue management)
- Multer (File upload)
- @google-cloud/storage (GCS)
- @google-cloud/vision (OCR)
- axios (OpenAI API)
- ioredis (Redis client)
- winston (Logging)
