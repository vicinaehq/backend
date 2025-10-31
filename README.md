# Vicinae Backend

Backend for the Vicinae extension store.

Currently hosted by [@aurelleb](https://github.com/aurelleb) on a [hetzner](https://www.hetzner.com/) VPS.

## Architecture

The architecture of this service is very simple on purpose.

- Hono to serve web requests
- Prisma + sqlite to maintain the list of available extensions in database
- Assets and extension code stored on the local filesystem (could be easily moved to an actual object storage service if needed)

## Vicinae integration

The Vicinae extension store command makes requests to this backend service to retrieve extension-related content.

Vicinae does **not** contact the service outside of this command.

## Development

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
