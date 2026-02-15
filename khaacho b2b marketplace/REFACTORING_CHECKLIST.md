# ✅ Refactoring Checklist

## Overview

Use this checklist to track the refactoring progress of your backend to the new clean architecture.

---

## Phase 1: Foundation (✅ COMPLETED)

- [x] Create error handling system
  - [x] `src/shared/errors/AppError.js`
  - [x] `src/shared/errors/index.js` (all error types)
  - [x] `src/api/middleware/errorHandler.js`

- [x] Create utilities
  - [x] `src/shared/utils/asyncHandler.js`
  - [x] `src/shared/utils/ApiResponse.js`
  - [x] `src/shared/logger/index.js`

- [x] Create base repository
  - [x] `src/core/repositories/BaseRepository.js`

- [x] Setup infrastructure
  - [x] `src/infrastructure/database/index.js`

- [x] Create documentation
  - [x] `REFACTORING_PLAN.md`
  - [x] `REFACTORING_MIGRATION_GUIDE.md`
  - [x] `CLEAN_ARCHITECTURE_SUMMARY.md`
  - [x] `ARCHITECTURE_USAGE_EXAMPLES.md`

---

## Phase 2: Reference Implementation (✅ COMPLETED)

- [x] Refactor Order module (complete example)
  - [x] `src/core/repositories/OrderRepository.js`
  - [x] `src/core/services/OrderService.js`
  - [x] `src/api/controllers/OrderController.js`
  - [x] `src/api/routes/order.routes.js`

- [x] Refactor external services
  - [x] `src/infrastructure/external/vision/VisionOCRService.js`
  - [x] `src/infrastructure/external/openai/OpenAIService.js`

---

## Phase 3: Core Modules Migration

### Authentication & Authorization
- [ ] Create `src/core/repositories/UserRepository.js`
- [ ] Create `src/core/services/AuthService.js`
- [ ] Refactor `src/api/controllers/AuthController.js`
- [ ] Update `src/api/routes/auth.routes.js`
- [ ] Update `src/api/middleware/auth.js` (use new structure)

### Products
- [ ] Create `src/core/repositories/ProductRepository.js`
- [ ] Create `src/core/services/ProductService.js`
- [ ] Refactor `src/api/controllers/ProductController.js`
- [ ] Update `src/api/routes/product.routes.js`

### Credit Management
- [ ] Create `src/core/repositories/CreditRepository.js`
- [ ] Create `src/core/services/CreditService.js`
- [ ] Refactor `src/api/controllers/CreditController.js`
- [ ] Update `src/api/routes/credit.routes.js`

### Retailers
- [ ] Create `src/core/repositories/RetailerRepository.js`
- [ ] Create `src/core/services/RetailerService.js`
- [ ] Refactor `src/api/controllers/RetailerController.js`
- [ ] Update routes

### Wholesalers
- [ ] Create `src/core/repositories/WholesalerRepository.js`
- [ ] Create `src/core/services/WholesalerService.js`
- [ ] Refactor `src/api/controllers/WholesalerController.js`
- [ ] Update routes

---

## Phase 4: Advanced Features Migration

### Image Upload & Processing
- [ ] Create `src/core/repositories/UploadedOrderRepository.js`
- [ ] Create `src/core/services/ImageOrderService.js`
- [ ] Refactor `src/api/controllers/ImageUploadController.js`
- [ ] Update `src/api/routes/imageUpload.routes.js`
- [ ] Move `src/infrastructure/external/gcs/GCSService.js`

### WhatsApp Integration
- [ ] Create `src/core/repositories/WhatsAppOrderRepository.js`
- [ ] Create `src/core/services/WhatsAppService.js`
- [ ] Refactor `src/api/controllers/WhatsAppController.js`
- [ ] Update routes
- [ ] Move `src/infrastructure/external/twilio/TwilioService.js`

### Analytics
- [ ] Create `src/core/repositories/AnalyticsRepository.js`
- [ ] Create `src/core/services/AnalyticsService.js`
- [ ] Refactor `src/api/controllers/AnalyticsController.js`
- [ ] Update routes

### Vendor Performance
- [ ] Create `src/core/repositories/VendorPerformanceRepository.js`
- [ ] Create `src/core/services/VendorPerformanceService.js`
- [ ] Refactor controller
- [ ] Update routes

### Price Intelligence
- [ ] Create `src/core/repositories/PriceIntelligenceRepository.js`
- [ ] Create `src/core/services/PriceIntelligenceService.js`
- [ ] Refactor controller
- [ ] Update routes

### Risk Management
- [ ] Create `src/core/repositories/RiskRepository.js`
- [ ] Create `src/core/services/RiskService.js`
- [ ] Refactor controller
- [ ] Update routes

### Delivery Management
- [ ] Create `src/core/repositories/DeliveryRepository.js`
- [ ] Create `src/core/services/DeliveryService.js`
- [ ] Refactor controller
- [ ] Update routes

### Pricing Engine
- [ ] Create `src/core/repositories/PricingRepository.js`
- [ ] Create `src/core/services/PricingService.js`
- [ ] Refactor controller
- [ ] Update routes

---

## Phase 5: Workers Migration

### Order Processing Worker
- [ ] Update `src/workers/order.worker.js`
  - [ ] Use OrderService instead of direct Prisma
  - [ ] Remove business logic
  - [ ] Add proper logging

### Image Processing Worker
- [ ] Update `src/workers/uploadedOrderProcessor.worker.js`
  - [ ] Use ImageOrderService
  - [ ] Remove direct Prisma queries
  - [ ] Use external services properly

### Analytics Worker
- [ ] Update `src/workers/analytics.worker.js`
  - [ ] Use AnalyticsService
  - [ ] Remove business logic

### Credit Score Worker
- [ ] Update `src/workers/creditScore.worker.js`
  - [ ] Use CreditService
  - [ ] Remove direct queries

### Order Routing Worker
- [ ] Update `src/workers/orderRouting.worker.js`
  - [ ] Use OrderService
  - [ ] Remove business logic

### Vendor Performance Worker
- [ ] Update `src/workers/vendorPerformance.worker.js`
  - [ ] Use VendorPerformanceService

### Price Intelligence Worker
- [ ] Update `src/workers/priceIntelligence.worker.js`
  - [ ] Use PriceIntelligenceService

### Recovery Worker
- [ ] Update `src/workers/recovery.worker.js`
  - [ ] Use appropriate services

### WhatsApp Worker
- [ ] Update `src/workers/whatsapp.worker.js`
  - [ ] Use WhatsAppService

---

## Phase 6: External Services

### Google Cloud Storage
- [ ] Create `src/infrastructure/external/gcs/GCSService.js`
- [ ] Move from `src/services/imageUpload.service.js`
- [ ] Remove business logic
- [ ] Add error handling

### Twilio/WhatsApp
- [ ] Create `src/infrastructure/external/twilio/TwilioService.js`
- [ ] Move from `src/services/twilio.service.js`
- [ ] Remove business logic

### Email Service
- [ ] Create `src/infrastructure/external/email/EmailService.js`
- [ ] Implement email sending
- [ ] Add templates

---

## Phase 7: Cleanup

### Remove Old Files
- [ ] Remove old `src/controllers/` (after migration)
- [ ] Remove old `src/services/` (after migration)
- [ ] Remove old `src/config/database.js` (use new one)
- [ ] Remove old `src/utils/` (use shared/)
- [ ] Remove duplicate error handlers

### Update Imports
- [ ] Update all imports to use new paths
- [ ] Update `src/server.js` imports
- [ ] Update test imports

### Update Main Files
- [ ] Update `src/server.js`
  - [ ] Use new error handler
  - [ ] Use new logger
  - [ ] Use new database config
- [ ] Update `src/routes/index.js`
  - [ ] Use new route files

---

## Phase 8: Testing

### Unit Tests
- [ ] Test repositories (mock Prisma)
- [ ] Test services (mock repositories)
- [ ] Test controllers (mock services)
- [ ] Test external services (mock APIs)

### Integration Tests
- [ ] Test complete flows
- [ ] Test error handling
- [ ] Test transactions
- [ ] Test authorization

### Manual Testing
- [ ] Test all API endpoints
- [ ] Test worker jobs
- [ ] Test error scenarios
- [ ] Test edge cases

---

## Phase 9: Documentation

### Code Documentation
- [ ] Add JSDoc comments to all classes
- [ ] Document complex business logic
- [ ] Add usage examples

### API Documentation
- [ ] Update API documentation
- [ ] Document new error responses
- [ ] Add request/response examples

### Developer Guide
- [ ] Update developer onboarding docs
- [ ] Create architecture diagrams
- [ ] Document patterns and conventions

---

## Phase 10: Deployment

### Pre-Deployment
- [ ] Run all tests
- [ ] Check for breaking changes
- [ ] Update environment variables
- [ ] Review error handling

### Deployment
- [ ] Deploy to staging
- [ ] Test in staging
- [ ] Monitor logs
- [ ] Deploy to production

### Post-Deployment
- [ ] Monitor error rates
- [ ] Check performance
- [ ] Verify all features working
- [ ] Collect feedback

---

## Progress Tracking

### Completed Modules
- [x] Order (reference implementation)
- [x] Error handling system
- [x] Logging system
- [x] Base repository
- [x] External services (Vision, OpenAI)

### In Progress
- [ ] (Add modules you're currently working on)

### Remaining
- [ ] Authentication
- [ ] Products
- [ ] Credit
- [ ] Retailers
- [ ] Wholesalers
- [ ] Image Upload
- [ ] WhatsApp
- [ ] Analytics
- [ ] Vendor Performance
- [ ] Price Intelligence
- [ ] Risk Management
- [ ] Delivery
- [ ] Pricing Engine
- [ ] All Workers

---

## Estimated Timeline

- **Phase 1**: ✅ Completed
- **Phase 2**: ✅ Completed
- **Phase 3**: 2-3 days (core modules)
- **Phase 4**: 3-4 days (advanced features)
- **Phase 5**: 1-2 days (workers)
- **Phase 6**: 1 day (external services)
- **Phase 7**: 1 day (cleanup)
- **Phase 8**: 2-3 days (testing)
- **Phase 9**: 1 day (documentation)
- **Phase 10**: 1 day (deployment)

**Total**: ~12-17 days

---

## Tips for Success

1. **One module at a time** - Don't try to refactor everything at once
2. **Test after each module** - Ensure functionality unchanged
3. **Use Order module as reference** - Follow the same pattern
4. **Keep old code until tested** - Don't delete until new code works
5. **Update tests incrementally** - Test as you go
6. **Document as you refactor** - Add comments and docs
7. **Get code reviews** - Have team review changes
8. **Monitor in production** - Watch for issues after deployment

---

## Questions?

- Review `REFACTORING_MIGRATION_GUIDE.md` for detailed instructions
- Check `ARCHITECTURE_USAGE_EXAMPLES.md` for code examples
- Look at Order module for reference implementation
- Ask team for help when stuck

---

**Status**: Foundation complete, Order module refactored  
**Next**: Start Phase 3 - Core modules migration
