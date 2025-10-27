# Vicinae Store Backend

This repository hosts the backend API for the Vicinae extension store. It handles extension submission, validation, storage, and discovery.

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

The API will be available at http://localhost:3000

## API Endpoints

- `POST /extension/upload` - Upload/update extensions (requires API_SECRET)
- `GET /extensions/list` - List extensions with pagination
- `POST /extensions/download-callback` - Track downloads
- `GET /storage/*` - Serve files (local storage only)

See [CLAUDE.md](./CLAUDE.md) for detailed API documentation.

## Storage Options

The API supports two storage backends:

**Local filesystem** (default):
- Files stored in `./storage` directory
- Served directly by the API via `/storage/*` endpoint

**Vercel Blob storage**:
- Serverless blob storage from Vercel
- Public URLs for downloads
- Configure via environment variables (see `.env.example`)

## Extension Format

Extensions must:
- Be ZIP archives containing `package.json` at root
- Use `@vicinae/api` dependency (not `@raycast/api`)
- Pass manifest schema validation
- Be under 10MB (configurable)
- Target Linux platform

Extension identity is determined by `author + name` combination.
