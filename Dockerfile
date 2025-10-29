# Multi-stage Dockerfile for Vicinae Extension Store

# Base stage with Bun runtime
FROM oven/bun:1 AS base
WORKDIR /app

# Dependencies stage - install production dependencies only
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Build stage - generate Prisma client and prepare app
FROM base AS build
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Generate Prisma client
RUN bun prisma generate

# Production stage - minimal runtime image
FROM oven/bun:1-alpine AS production
WORKDIR /app

# Install sqlite3 for runtime
RUN apk add --no-cache sqlite

# Copy dependencies and built artifacts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

# Create storage directory
RUN mkdir -p /app/storage

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Run the application
CMD ["bun", "run", "src/index.ts"]
