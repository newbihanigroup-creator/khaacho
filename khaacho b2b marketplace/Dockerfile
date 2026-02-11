# Multi-stage build for production
FROM node:18-bullseye-slim AS builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y openssl libssl-dev && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Generate Prisma Client
RUN npx prisma generate

# Production stage
FROM node:18-bullseye-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Copy application code
COPY src ./src
COPY package*.json ./

# Create logs directory
RUN mkdir -p logs

# Set environment
ENV NODE_ENV=production

# Expose port (honors PORT env if provided, defaults to 3000)
EXPOSE 3000
EXPOSE 10000

# Health check using standard PORT env or 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "const port = process.env.PORT || 3000; require('http').get('http://localhost:' + port + '/api/v1/monitoring/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
# Start application directly with node (bypassing npm signals)
CMD ["node", "src/server-web.js"]
