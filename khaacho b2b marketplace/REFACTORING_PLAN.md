# 🏗️ Backend Refactoring Plan

## New Architecture

```
src/
├── api/
│   ├── controllers/          # HTTP request/response handling
│   ├── routes/              # Route definitions
│   └── middleware/          # Express middleware
├── core/
│   ├── services/            # Business logic layer
│   ├── repositories/        # Database access layer (Prisma)
│   └── domain/              # Domain models & types
├── infrastructure/
│   ├── external/            # External service integrations
│   │   ├── gcs/            # Google Cloud Storage
│   │   ├── vision/         # Google Vision OCR
│   │   ├── openai/         # OpenAI LLM
│   │   ├── twilio/         # WhatsApp messaging
│   │   └── email/          # Email service
│   ├── queue/              # Queue management
│   └── database/           # Database config
├── workers/                # Background job processors
├── shared/
│   ├── utils/              # Utility functions
│   ├── errors/             # Error classes
│   ├── logger/             # Logging
│   └── validators/         # Input validation
└── config/                 # Configuration

```

## Layer Responsibilities

### Controllers (api/controllers/)
- Parse request parameters
- Validate input (basic)
- Call service methods
- Format responses
- Handle HTTP status codes
- NO business logic
- NO database queries

### Services (core/services/)
- Business logic
- Orchestrate operations
- Call repositories
- Call external services
- Transaction management
- NO HTTP handling
- NO direct Prisma queries

### Repositories (core/repositories/)
- ALL Prisma queries
- Data access abstraction
- Query optimization
- NO business logic
- Return domain models

### External Services (infrastructure/external/)
- Third-party API integrations
- Retry logic
- Error handling
- Rate limiting
- NO business logic

### Workers (workers/)
- Background job processing
- Independent from API
- Long-running tasks
- Scheduled jobs

## Refactoring Steps

1. ✅ Create new folder structure
2. ✅ Create base classes and utilities
3. ✅ Refactor Order module (complete example)
4. ✅ Create migration guide
5. Document patterns

## Benefits

- Clear separation of concerns
- Easy to test each layer
- Scalable architecture
- Maintainable codebase
- Reusable components
- Independent workers
