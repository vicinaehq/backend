# Vicinae Store Backend

This repository hosts the backend API for the Vicinae extension store. It handles extension submission, validation, storage, and discovery.

## Architecture 

This backend application has been made very simple by design:
- Hono as the main HTTP framework, lightweight and has support for all the good stuff
- SQLITE as the database provider
- Local filesystem to store blobs such as uploaded extensions, icons...

The main idea is that the backend should be very easy to deploy on a single VPS and to backup.
Given what we use it for, it is good enough, and can still be upgraded to using a dedicated object storage or somehing like if necessary.

## Quick Start

**Install dependencies:**
```sh
bun install
```

**Set up environment variables:**
```sh
cp .env.example .env
# Edit .env and set your API_SECRET and other configuration
```

**Set up database:**
```sh
# Generate Prisma client
bun prisma generate

# Run migrations
bun prisma migrate dev
```

**Run development server:**
```sh
bun run dev
```
