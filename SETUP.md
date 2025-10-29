# Server Setup Guide

Step-by-step guide to deploy the Vicinae Extension Store on a production server.

## Prerequisites

- Ubuntu/Debian server (or similar Linux distro)
- Domain name pointing to your server
- Root/sudo access

## 1. Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Add Bun to PATH for all users
sudo ln -s ~/.bun/bin/bun /usr/local/bin/bun

# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Verify installations
bun --version
caddy version
```

## 2. Create Application User

```bash
# Create system user for running the app
sudo useradd -r -s /bin/bash -m -d /opt/vicinae-store vicinae

# Verify user created
id vicinae
```

## 3. Clone and Setup Application

```bash
# Clone repository
sudo -u vicinae git clone https://github.com/vicinaehq/store.git /opt/vicinae-store

# Navigate to directory
cd /opt/vicinae-store

# Install dependencies
sudo -u vicinae bun install

# Create .env file
sudo -u vicinae cp .env.example .env

# Edit environment variables
sudo -u vicinae nano .env
```

**Required environment variables:**
```bash
DATABASE_URL="file:./prisma/dev.db"
API_SECRET="generate-strong-secret-here"  # Use: openssl rand -hex 32
DOMAIN=store.vicinae.dev
LOCAL_STORAGE_PATH=/opt/vicinae-store/storage
LOCAL_STORAGE_URL=https://store.vicinae.dev/storage
GITHUB_TOKEN=  # Optional: your GitHub personal access token
```

## 4. Initialize Database

```bash
# Create directories
sudo -u vicinae mkdir -p /opt/vicinae-store/storage
sudo -u vicinae mkdir -p /opt/vicinae-store/prisma

# Generate Prisma client
sudo -u vicinae bun prisma generate

# Run migrations
sudo -u vicinae bun prisma migrate deploy
```

## 5. Setup systemd Service

```bash
# Copy service file to systemd directory
sudo cp /opt/vicinae-store/vicinae-store.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable vicinae-store

# Start service
sudo systemctl start vicinae-store

# Check status
sudo systemctl status vicinae-store
```

**Common systemd commands:**
```bash
# View logs
sudo journalctl -fu vicinae-store

# Restart service
sudo systemctl restart vicinae-store

# Stop service
sudo systemctl stop vicinae-store

# View recent logs
sudo journalctl -u vicinae-store -n 100 --no-pager
```

## 6. Configure Caddy

```bash
# Edit Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Add the following configuration:

```caddyfile
store.vicinae.dev {
    # Enable compression
    encode gzip zstd

    # Reverse proxy to Bun app
    reverse_proxy localhost:3000 {
        # Health check
        health_uri /
        health_interval 30s
        health_timeout 5s

        # Headers
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    # Security headers
    header {
        -Server
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Access-Control-Allow-Origin "*"
        Access-Control-Allow-Methods "GET, POST, OPTIONS"
        Access-Control-Allow-Headers "Content-Type, Authorization"
    }

    # Logging
    log {
        output file /var/log/caddy/vicinae-store.log {
            roll_size 100mb
            roll_keep 5
        }
    }
}
```

```bash
# Test Caddy configuration
sudo caddy validate --config /etc/caddy/Caddyfile

# Reload Caddy
sudo systemctl reload caddy

# Check Caddy status
sudo systemctl status caddy
```

## 7. Configure Firewall

```bash
# Allow SSH, HTTP, and HTTPS
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

## 8. Verify Deployment

```bash
# Check if service is running
sudo systemctl status vicinae-store

# Check if Caddy is running
sudo systemctl status caddy

# Test local endpoint
curl http://localhost:3000/

# Test public endpoint
curl https://store.vicinae.dev/
```

## 9. Setup GitHub Deploy Key (for CI/CD)

```bash
# Generate SSH key for deployment
sudo -u vicinae ssh-keygen -t ed25519 -C "deploy@vicinae-store" -f /opt/vicinae-store/.ssh/deploy_key -N ""

# Add public key to GitHub repository
# Settings > Deploy keys > Add deploy key
cat /opt/vicinae-store/.ssh/deploy_key.pub

# Configure git to use the deploy key
sudo -u vicinae git config --global core.sshCommand "ssh -i /opt/vicinae-store/.ssh/deploy_key"
```

## Maintenance

### Update Application

```bash
# Pull latest changes
cd /opt/vicinae-store
sudo -u vicinae git pull origin main

# Install new dependencies (if any)
sudo -u vicinae bun install

# Run migrations (if any)
sudo -u vicinae bun prisma migrate deploy

# Restart service
sudo systemctl restart vicinae-store
```

### Backup Database

```bash
# Create backup directory
sudo -u vicinae mkdir -p /opt/vicinae-store/backups

# Backup database
sudo -u vicinae cp /opt/vicinae-store/prisma/dev.db \
  /opt/vicinae-store/backups/dev.db.$(date +%Y%m%d_%H%M%S)

# Automated backup (add to crontab)
sudo -u vicinae crontab -e
# Add: 0 2 * * * cp /opt/vicinae-store/prisma/dev.db /opt/vicinae-store/backups/dev.db.$(date +\%Y\%m\%d)
```

### View Logs

```bash
# Application logs
sudo journalctl -fu vicinae-store

# Caddy logs
sudo journalctl -fu caddy

# Or view Caddy file logs
sudo tail -f /var/log/caddy/vicinae-store.log
```

### Monitor Service

```bash
# Check service status
sudo systemctl status vicinae-store

# Check resource usage
top -p $(pgrep -f "bun run start")

# Check disk usage
df -h /opt/vicinae-store
du -sh /opt/vicinae-store/storage
```

## Troubleshooting

### Service won't start

```bash
# Check logs
sudo journalctl -u vicinae-store -n 50

# Verify permissions
ls -la /opt/vicinae-store
sudo -u vicinae bun run start  # Test running as vicinae user
```

### Database issues

```bash
# Check database file exists
ls -la /opt/vicinae-store/prisma/dev.db

# Regenerate Prisma client
sudo -u vicinae bun prisma generate

# Run migrations
sudo -u vicinae bun prisma migrate deploy
```

### Caddy SSL issues

```bash
# Check Caddy logs
sudo journalctl -u caddy -n 50

# Verify DNS
dig +short store.vicinae.dev

# Test Caddy config
sudo caddy validate --config /etc/caddy/Caddyfile
```

### Permission issues

```bash
# Fix ownership
sudo chown -R vicinae:vicinae /opt/vicinae-store

# Fix storage permissions
sudo chmod 755 /opt/vicinae-store/storage
```

## Security Checklist

- [ ] Strong `API_SECRET` generated (use `openssl rand -hex 32`)
- [ ] Firewall configured (only ports 22, 80, 443 open)
- [ ] Service running as unprivileged user (vicinae)
- [ ] Database backups automated
- [ ] Caddy automatic HTTPS enabled
- [ ] GitHub deploy key configured (not personal SSH key)
- [ ] `.env` file has correct permissions (600)
- [ ] Regular system updates scheduled

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `file:./prisma/dev.db` | SQLite database path |
| `API_SECRET` | Yes | - | Secret for upload authentication |
| `DOMAIN` | Yes | - | Your domain name |
| `LOCAL_STORAGE_PATH` | Yes | `./storage` | Path for file storage |
| `LOCAL_STORAGE_URL` | Yes | - | Public URL for storage files |
| `GITHUB_TOKEN` | No | - | GitHub token to avoid rate limits |
| `MAX_UPLOAD_SIZE` | No | `10485760` | Max file size in bytes (10MB) |
| `DEFAULT_PAGE_SIZE` | No | `100` | Pagination default |
