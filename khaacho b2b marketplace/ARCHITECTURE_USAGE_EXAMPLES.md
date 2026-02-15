# 🎯 Architecture Usage Examples

## Quick Reference Guide

### Example 1: Simple CRUD Operation

#### Controller
```javascript
// src/api/controllers/ProductController.js
const ProductService = require('../../core/services/ProductService');
const ApiResponse = require('../../shared/utils/ApiResponse');
const asyncHandler = require('../../shared/utils/asyncHandler');
const prisma = require('../../infrastructure/database');

class ProductController {
  constructor() {
    this.productService = new ProductService(prisma);
  }

  getProduct = asyncHandler(async (req, res) => {
    const product = await this.productService.getById(req.params.id);
    return ApiResponse.success(res, product);
  });

  listProducts = asyncHandler(async (req, res) => {
    const result = await this.productService.getList(req.query);
    return ApiResponse.paginated(res, result.items, result.pagination);
  });

  createProduct = asyncHandler(async (req, res) => {
    const product = await this.productService.create(req.body);
    return ApiResponse.success(res, product, 'Product created', 201);
  });
}

module.exports = new ProductController();
```

#### Service
```javascript
// src/core/services/ProductService.js
const ProductRepository = require('../repositories/ProductRepository');
const { NotFoundError, ValidationError } = require('../../shared/errors');
const logger = require('../../shared/logger');

class ProductService {
  constructor(prisma) {
    this.productRepository = new ProductRepository(prisma);
  }

  async getById(productId) {
    const product = await this.productRepository.findById(productId);
    
    if (!product) {
      throw new NotFoundError('Product', productId);
    }
    
    return product;
  }

  async getList(filters) {
    const { page = 1, limit = 20, category, search } = filters;
    
    const where = {};
    if (category) where.category = category;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    
    return await this.productRepository.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async create(data) {
    this.validateProductData(data);
    
    return await this.productRepository.create(data);
  }

  validateProductData(data) {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('Product name is required');
    }
    
    if (data.price < 0) {
      throw new ValidationError('Price cannot be negative');
    }
  }
}

module.exports = ProductService;
```

#### Repository
```javascript
// src/core/repositories/ProductRepository.js
const BaseRepository = require('./BaseRepository');

class ProductRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, 'product');
  }

  // Inherits: findById, findMany, create, update, delete, count
  
  // Add custom methods if needed
  async findByCategory(category) {
    return await this.model.findMany({
      where: { category },
      orderBy: { name: 'asc' },
    });
  }
}

module.exports = ProductRepository;
```

#### Routes
```javascript
// src/api/routes/product.routes.js
const express = require('express');
const ProductController = require('../controllers/ProductController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/:id', ProductController.getProduct);
router.get('/', ProductController.listProducts);
router.post('/', authenticate, authorize('ADMIN'), ProductController.createProduct);

module.exports = router;
```

---

### Example 2: Complex Business Logic

#### Service with Multiple Operations
```javascript
// src/core/services/OrderService.js
class OrderService {
  constructor(prisma) {
    this.orderRepository = new OrderRepository(prisma);
    this.productRepository = new ProductRepository(prisma);
    this.creditService = new CreditService(prisma);
    this.notificationService = new NotificationService();
  }

  async createOrder(orderData, userId, userRole) {
    logger.info('Creating order', { userId, itemCount: orderData.items.length });

    // 1. Validate order data
    this.validateOrderData(orderData);

    // 2. Check product availability
    await this.checkProductAvailability(orderData.items);

    // 3. Check credit limit
    const retailer = await this.getRetailer(orderData.retailerId);
    const orderTotal = this.calculateTotal(orderData.items);
    await this.creditService.checkCreditLimit(retailer.id, orderTotal);

    // 4. Create order (transaction)
    const order = await this.orderRepository.createWithItems(
      {
        orderNumber: await this.generateOrderNumber(),
        retailerId: orderData.retailerId,
        status: 'PENDING',
        total: orderTotal,
      },
      orderData.items
    );

    // 5. Update credit balance
    await this.creditService.reserveCredit(retailer.id, orderTotal);

    // 6. Send notifications
    await this.notificationService.sendOrderConfirmation(order);

    logger.info('Order created successfully', { orderId: order.id });

    return order;
  }

  async checkProductAvailability(items) {
    for (const item of items) {
      const product = await this.productRepository.findById(item.productId);
      
      if (!product) {
        throw new NotFoundError('Product', item.productId);
      }
      
      if (!product.isAvailable) {
        throw new BusinessLogicError(
          `Product ${product.name} is not available`,
          { productId: product.id }
        );
      }
    }
  }
}
```

---

### Example 3: Using External Services

#### Service Using External APIs
```javascript
// src/core/services/ImageOrderService.js
const UploadedOrderRepository = require('../repositories/UploadedOrderRepository');
const VisionOCRService = require('../../infrastructure/external/vision/VisionOCRService');
const OpenAIService = require('../../infrastructure/external/openai/OpenAIService');
const logger = require('../../shared/logger');

class ImageOrderService {
  constructor(prisma) {
    this.uploadedOrderRepository = new UploadedOrderRepository(prisma);
    this.visionOCR = VisionOCRService;
    this.openAI = OpenAIService;
  }

  async processImageOrder(uploadedOrderId) {
    logger.info('Processing image order', { uploadedOrderId });

    const order = await this.uploadedOrderRepository.findById(uploadedOrderId);

    // 1. Extract text using Vision OCR
    const ocrResult = await this.visionOCR.extractTextFromGCS(order.imageUrl);
    
    await this.uploadedOrderRepository.update(uploadedOrderId, {
      extractedText: ocrResult.text,
    });

    // 2. Extract items using OpenAI
    const items = await this.openAI.extractItems(ocrResult.text);
    
    await this.uploadedOrderRepository.update(uploadedOrderId, {
      parsedData: { items },
    });

    // 3. Normalize items
    const normalizedItems = await this.normalizeItems(items);

    // 4. Update status
    await this.uploadedOrderRepository.update(uploadedOrderId, {
      status: 'COMPLETED',
      processedAt: new Date(),
    });

    logger.info('Image order processed', { uploadedOrderId, itemCount: items.length });

    return { items: normalizedItems };
  }
}

module.exports = ImageOrderService;
```

---

### Example 4: Worker Using Services

#### Background Worker
```javascript
// src/workers/imageOrder.worker.js
const ImageOrderService = require('../core/services/ImageOrderService');
const prisma = require('../infrastructure/database');
const logger = require('../shared/logger');

const imageOrderService = new ImageOrderService(prisma);

async function processImageOrder(job) {
  const { uploadedOrderId } = job.data;

  logger.info('Worker: Processing image order', {
    jobId: job.id,
    uploadedOrderId,
    attempt: job.attemptsMade + 1,
  });

  try {
    // Use service layer - same as controller
    const result = await imageOrderService.processImageOrder(uploadedOrderId);

    logger.info('Worker: Image order processed', {
      jobId: job.id,
      uploadedOrderId,
      itemCount: result.items.length,
    });

    return result;
  } catch (error) {
    logger.error('Worker: Image order processing failed', {
      jobId: job.id,
      uploadedOrderId,
      error: error.message,
    });

    throw error; // Let queue handle retry
  }
}

module.exports = processImageOrder;
```

---

### Example 5: Error Handling

#### Throwing Errors
```javascript
// In Service
const { NotFoundError, ValidationError, BusinessLogicError } = require('../../shared/errors');

// Not found
if (!user) {
  throw new NotFoundError('User', userId);
}

// Validation
if (!email || !email.includes('@')) {
  throw new ValidationError('Invalid email format', { email });
}

// Business logic
if (order.status === 'COMPLETED') {
  throw new BusinessLogicError('Cannot modify completed order', { orderId });
}

// External service
if (!apiKey) {
  throw new ExternalServiceError('OpenAI', 'API key not configured');
}
```

#### Catching Errors (Automatic)
```javascript
// Controller - errors automatically caught by asyncHandler
getOrder = asyncHandler(async (req, res) => {
  // If service throws error, asyncHandler catches it
  // and passes to errorHandler middleware
  const order = await this.orderService.getById(req.params.id);
  return ApiResponse.success(res, order);
});
```

---

### Example 6: Testing

#### Testing Service (No HTTP)
```javascript
// tests/services/OrderService.test.js
const OrderService = require('../../src/core/services/OrderService');
const { NotFoundError } = require('../../src/shared/errors');

describe('OrderService', () => {
  let orderService;
  let mockPrisma;

  beforeEach(() => {
    mockPrisma = {
      order: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    orderService = new OrderService(mockPrisma);
  });

  test('getById should return order', async () => {
    const mockOrder = { id: '123', status: 'PENDING' };
    mockPrisma.order.findUnique.mockResolvedValue(mockOrder);

    const result = await orderService.getById('123');

    expect(result).toEqual(mockOrder);
    expect(mockPrisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: '123' },
    });
  });

  test('getById should throw NotFoundError', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);

    await expect(orderService.getById('123')).rejects.toThrow(NotFoundError);
  });
});
```

---

### Example 7: Transactions

#### Service with Transaction
```javascript
// src/core/services/OrderService.js
class OrderService {
  async createOrderWithPayment(orderData, paymentData) {
    // Use Prisma transaction
    return await this.prisma.$transaction(async (tx) => {
      // Create order
      const order = await tx.order.create({
        data: orderData,
      });

      // Create payment
      const payment = await tx.payment.create({
        data: {
          ...paymentData,
          orderId: order.id,
        },
      });

      // Update credit balance
      await tx.creditLedger.create({
        data: {
          retailerId: order.retailerId,
          amount: -order.total,
          type: 'ORDER_PAYMENT',
          orderId: order.id,
        },
      });

      return { order, payment };
    });
  }
}
```

---

### Example 8: Pagination

#### Service with Pagination
```javascript
async getOrders(filters) {
  const { page = 1, limit = 20, status } = filters;
  
  const where = {};
  if (status) where.status = status;
  
  const result = await this.orderRepository.findMany({
    where,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
  
  return {
    orders: result.items,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: result.total,
    },
  };
}
```

#### Controller with Pagination
```javascript
getOrders = asyncHandler(async (req, res) => {
  const result = await this.orderService.getOrders(req.query);
  
  return ApiResponse.paginated(
    res,
    result.orders,
    result.pagination,
    'Orders retrieved successfully'
  );
});
```

---

### Example 9: Authorization

#### Service with Authorization
```javascript
class OrderService {
  async getOrderById(orderId, userId, userRole) {
    const order = await this.orderRepository.findById(orderId);
    
    if (!order) {
      throw new NotFoundError('Order', orderId);
    }
    
    // Check access
    this.checkOrderAccess(order, userId, userRole);
    
    return order;
  }

  checkOrderAccess(order, userId, userRole) {
    // Admins can access all
    if (userRole === 'ADMIN' || userRole === 'OPERATOR') {
      return;
    }
    
    // Retailers can only access their orders
    if (userRole === 'RETAILER' && order.retailerId !== userId) {
      throw new ForbiddenError('You do not have access to this order');
    }
    
    // Wholesalers can only access orders with their items
    if (userRole === 'WHOLESALER') {
      const hasAccess = order.items?.some(item => item.wholesalerId === userId);
      if (!hasAccess) {
        throw new ForbiddenError('You do not have access to this order');
      }
    }
  }
}
```

---

### Example 10: Logging

#### Structured Logging
```javascript
const logger = require('../../shared/logger');

class OrderService {
  async createOrder(orderData, userId) {
    // Log with context
    logger.info('Creating order', {
      userId,
      retailerId: orderData.retailerId,
      itemCount: orderData.items.length,
      total: orderData.total,
    });

    try {
      const order = await this.orderRepository.create(orderData);
      
      logger.info('Order created successfully', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId,
      });
      
      return order;
    } catch (error) {
      logger.error('Order creation failed', {
        userId,
        error: error.message,
        stack: error.stack,
      });
      
      throw error;
    }
  }
}
```

---

## Common Patterns Summary

### Pattern 1: Controller → Service → Repository
```
Controller: Parse request → Call service → Format response
Service: Validate → Business logic → Call repository
Repository: Execute query → Return data
```

### Pattern 2: Service → External Service
```
Service: Prepare data → Call external service → Process result
External Service: API call → Error handling → Return data
```

### Pattern 3: Worker → Service
```
Worker: Get job data → Call service → Log result
Service: Same business logic as controller uses
```

### Pattern 4: Error Handling
```
Anywhere: throw new CustomError()
asyncHandler: Catches error
errorHandler: Processes and sends response
```

### Pattern 5: Transaction
```
Service: Use prisma.$transaction()
All operations succeed or all fail
```

---

## Quick Tips

1. **Controllers**: Keep them thin - just HTTP handling
2. **Services**: Put all business logic here
3. **Repositories**: All Prisma queries go here
4. **Errors**: Use error classes, not res.status()
5. **Async**: Always use asyncHandler in routes
6. **Logging**: Log with context (userId, orderId, etc.)
7. **Testing**: Test services without HTTP
8. **Reuse**: Same service in controller and worker

---

**Reference**: See `src/api/controllers/OrderController.js` for complete example
