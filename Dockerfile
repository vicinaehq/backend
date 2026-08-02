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

# Generate Prisma client (generation validates the configured datasource but does
# not create or access this temporary database).
RUN DATABASE_URL=file:/tmp/build.db bun prisma generate

# Production stage - minimal runtime image
FROM oven/bun:1-alpine AS production
WORKDIR /app

# sqlite is used by Prisma. Bubblewrap enforces the Codex sandbox; the remaining
# tools support its read-only reference lookups.
RUN apk add --no-cache bubblewrap file sqlite

# Copy dependencies and built artifacts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

# Create storage and analytics data directories
RUN mkdir -p /app/storage /app/data/codex
ENV ANALYTICS_DB_PATH=/app/data/analytics.duckdb

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Run the application
CMD ["bun", "run", "src/index.ts"]
