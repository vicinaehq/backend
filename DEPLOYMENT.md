# Deployment Guide

This guide covers deploying the Vicinae Extension Store using Docker Compose with Caddy for automatic HTTPS.

## Prerequisites

- Docker and Docker Compose installed
- A domain name pointing to your server
- Ports 80 and 443 available

## Quick Start

1. **Clone and configure environment:**
   ```bash
   git clone <repository-url>
   cd store
   cp .env.example .env
   ```

2. **Edit `.env` file:**
   ```bash
   # Required: Set your domain
   DOMAIN=store.vicinae.dev

   # Required: Generate a strong API secret
   API_SECRET=your-strong-secret-here

   # Optional: GitHub token to avoid rate limits
   GITHUB_TOKEN=ghp_your_token_here
   ```

3. **Create data directories:**
   ```bash
   mkdir -p data/db data/storage data/caddy/data data/caddy/config
   ```

4. **Run database migrations:**
   ```bash
   # First time only - initialize database
   docker-compose run --rm app bun prisma migrate deploy
   ```

5. **Start services:**
   ```bash
   docker-compose up -d
   ```

6. **Check logs:**
   ```bash
   docker-compose logs -f
   ```

## Architecture

```
Internet
   ↓
Caddy (ports 80, 443)
   ↓ reverse proxy
Hono App (port 3000, internal only)
```

**Caddy handles:**
- Automatic HTTPS certificate provisioning (Let's Encrypt)
- Certificate renewal
- TLS termination
- Compression (gzip, zstd)
- Security headers
- Rate limiting
- Access logging

**Hono App handles:**
- Extension upload/validation
- Extension listing
- File storage
- Database operations

## Data Persistence

All data is stored in `./data/`:
- `data/db/` - SQLite database
- `data/storage/` - Uploaded extensions and assets
- `data/caddy/` - SSL certificates and Caddy config

**Backup strategy:**
```bash
# Backup everything
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# Restore
tar -xzf backup-YYYYMMDD.tar.gz
```

## Maintenance

**View logs:**
```bash
# All services
docker-compose logs -f

# Just the app
docker-compose logs -f app

# Just Caddy
docker-compose logs -f caddy
```

**Restart services:**
```bash
docker-compose restart
```

**Update application:**
```bash
git pull
docker-compose build app
docker-compose up -d
```

**Run migrations:**
```bash
docker-compose run --rm app bun prisma migrate deploy
```

## Environment Variables

### Required
- `DOMAIN` - Your domain name (e.g., store.vicinae.dev)
- `API_SECRET` - Secret for authenticating extension uploads

### Optional
- `GITHUB_TOKEN` - GitHub personal access token (avoid rate limits)
- `MAX_UPLOAD_SIZE` - Max extension size in bytes (default: 10MB)
- `DEFAULT_PAGE_SIZE` - Default pagination size (default: 100)

## Troubleshooting

**Certificate issues:**
```bash
# Check Caddy logs
docker-compose logs caddy

# Verify domain DNS points to server
dig +short $DOMAIN

# Ensure ports 80/443 are open
sudo ufw status
```

**Database issues:**
```bash
# Check database file exists
ls -lh data/db/

# Run migrations manually
docker-compose run --rm app bun prisma migrate deploy

# Reset database (WARNING: deletes all data)
rm -rf data/db/dev.db*
docker-compose run --rm app bun prisma migrate deploy
```

**Storage issues:**
```bash
# Check permissions
ls -lh data/storage/

# Fix permissions if needed
sudo chown -R 1000:1000 data/storage/
```

## Security Notes

1. **API_SECRET**: Generate with `openssl rand -hex 32`
2. **Firewall**: Only ports 80 and 443 should be publicly accessible
3. **Updates**: Keep Docker images updated regularly
4. **Backups**: Automated backups of `data/` directory recommended
5. **Rate limiting**: Configured in Caddyfile (100 uploads/min per IP)

## Production Checklist

- [ ] Domain DNS configured and pointing to server
- [ ] Strong `API_SECRET` set in `.env`
- [ ] Firewall configured (ports 80, 443 open)
- [ ] `data/` directories created with correct permissions
- [ ] Database migrations run successfully
- [ ] Backup strategy in place
- [ ] Monitoring configured (optional but recommended)
- [ ] Log rotation configured for Caddy logs

## Scaling Considerations

**Current setup (single server):**
- SQLite database
- Local file storage
- Single app instance

**For higher scale, consider:**
- PostgreSQL instead of SQLite (minimal schema changes needed)
- Object storage (S3, R2) instead of local files
- Multiple app instances behind Caddy load balancer
- Separate database server
- CDN for static assets

To switch to PostgreSQL:
1. Update `datasource db` in `prisma/schema.prisma` to `provider = "postgresql"`
2. Update `DATABASE_URL` to PostgreSQL connection string
3. Run migrations: `bun prisma migrate deploy`
