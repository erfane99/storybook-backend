# Deployment Configuration Guide

This directory contains configuration templates and guides for deploying the background job system across different platforms.

## Quick Start

1. Choose your deployment platform
2. Follow the platform-specific guide below
3. Configure environment variables
4. Set up monitoring and webhooks
5. Verify deployment with health checks

## Deployment Platforms

### Netlify (Recommended)

**Advantages:**
- Excellent Edge Functions support
- Built-in form handling
- Easy environment variable management
- Automatic SSL certificates

**Configuration:**

1. **netlify.toml** (already configured):
```toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "18"

[[plugins]]
  package = "@netlify/plugin-nextjs"

[functions]
  node_bundler = "esbuild"

[[headers]]
  for = "/_next/static/*"
  [headers.values]
    cache-control = "public, max-age=31536000, immutable"
```

2. **Environment Variables Setup:**
```bash
# In Netlify dashboard > Site settings > Environment variables
# Add all variables from .env.production.example
```

3. **Edge Functions:**
```bash
# Edge functions are automatically deployed from netlify/edge-functions/
# No additional configuration needed
```

4. **Webhooks:**
```bash
# Set up external cron service to call:
# https://your-site.netlify.app/api/cron/process-jobs
```

### Vercel

**Advantages:**
- Excellent Next.js integration
- Built-in cron jobs
- Serverless functions
- Global CDN

**Configuration:**

1. **vercel.json**:
```json
{
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 300
    }
  },
  "crons": [
    {
      "path": "/api/cron/process-jobs",
      "schedule": "*/30 * * * * *"
    }
  ]
}
```

2. **Environment Variables:**
```bash
# In Vercel dashboard > Project > Settings > Environment Variables
# Add all variables from .env.production.example
```

3. **Build Configuration:**
```bash
# Build Command: npm run build
# Output Directory: .next
# Install Command: npm install
```

### Railway

**Advantages:**
- Simple deployment process
- Built-in PostgreSQL
- Automatic scaling
- Good for full-stack apps

**Configuration:**

1. **railway.toml**:
```toml
[build]
  builder = "nixpacks"

[deploy]
  startCommand = "npm start"
  restartPolicyType = "always"

[env]
  NODE_ENV = "production"
```

2. **Database Setup:**
```bash
# Railway provides PostgreSQL addon
# Use provided DATABASE_URL in your environment
```

3. **Scaling:**
```bash
# Configure in Railway dashboard
# Recommended: 1GB RAM, 1 vCPU for starter
```

### Render

**Advantages:**
- Free tier available
- Automatic SSL
- Built-in PostgreSQL
- Docker support

**Configuration:**

1. **render.yaml**:
```yaml
services:
  - type: web
    name: storybook-app
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
```

2. **Environment Variables:**
```bash
# In Render dashboard > Service > Environment
# Add all variables from .env.production.example
```

## Docker Configuration

For containerized deployments:

**Dockerfile**:
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/jobs/health || exit 1

# Start application
CMD ["npm", "start"]
```

**docker-compose.yml**:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: storybook
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  postgres_data:
```

## Database Configuration

### Supabase (Recommended)

1. **Connection Setup:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

2. **Connection Pooling:**
```sql
-- In Supabase dashboard > Settings > Database
-- Enable connection pooling
-- Set pool size: 15
-- Set pool timeout: 30s
```

3. **Performance Optimization:**
```sql
-- Add performance indexes
CREATE INDEX CONCURRENTLY idx_background_jobs_processing 
ON background_jobs(status, created_at) 
WHERE status IN ('pending', 'processing');
```

### Self-Hosted PostgreSQL

1. **Connection Configuration:**
```env
DATABASE_URL=postgresql://user:password@host:5432/database
DATABASE_POOL_SIZE=10
DATABASE_POOL_TIMEOUT=30000
```

2. **Backup Strategy:**
```bash
# Daily backups
0 2 * * * pg_dump -h host -U user database > backup_$(date +%Y%m%d).sql

# Weekly cleanup
0 3 * * 0 find /backups -name "backup_*.sql" -mtime +7 -delete
```

## External Cron Setup

### GitHub Actions

Create `.github/workflows/cron-jobs.yml`:

```yaml
name: Background Job Processing
on:
  schedule:
    - cron: '*/30 * * * *'  # Every 30 seconds
  workflow_dispatch:

jobs:
  process-jobs:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Job Processing
        run: |
          curl -X POST ${{ secrets.SITE_URL }}/api/cron/process-jobs \
            -H "x-github-token: ${{ secrets.GITHUB_WEBHOOK_SECRET }}" \
            -H "Content-Type: application/json" \
            -d '{"maxJobs": 10}'
```

### External Cron Services

**Cron-job.org:**
```bash
# URL: https://your-domain.com/api/cron/process-jobs
# Method: POST
# Headers: x-webhook-secret: your-secret
# Interval: Every 30 seconds
```

**EasyCron:**
```bash
# URL: https://your-domain.com/api/cron/process-jobs
# Method: POST
# Headers: x-webhook-secret: your-secret
# Cron Expression: */30 * * * * *
```

## Monitoring Setup

### Health Check Monitoring

**UptimeRobot:**
```bash
# Monitor: https://your-domain.com/api/jobs/health
# Type: HTTP(s)
# Interval: 5 minutes
# Alert when: Status code is not 200
```

**Pingdom:**
```bash
# URL: https://your-domain.com/api/jobs/health
# Check type: HTTP
# Check interval: 1 minute
# Alert conditions: Response time > 30s OR status != 200
```

### Log Management

**Centralized Logging:**
```bash
# Use your platform's logging service:
# - Netlify: Functions logs
# - Vercel: Function logs
# - Railway: Application logs
# - Render: Service logs
```

**Log Aggregation:**
```bash
# Optional: Send logs to external service
# - Logtail
# - Papertrail
# - Datadog
# - New Relic
```

### Error Tracking

**Sentry Configuration:**
```env
SENTRY_DSN=https://your-sentry-dsn
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
```

## Security Configuration

### SSL/TLS

All platforms provide automatic SSL certificates. Ensure:
- HTTPS is enforced
- HTTP redirects to HTTPS
- HSTS headers are set

### API Security

1. **Rate Limiting:**
```typescript
// Implement in middleware
const rateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
};
```

2. **CORS Configuration:**
```typescript
const corsOptions = {
  origin: process.env.NEXT_PUBLIC_SITE_URL,
  credentials: true,
  optionsSuccessStatus: 200
};
```

3. **Webhook Security:**
```typescript
// Validate webhook signatures
const isValidSignature = (payload, signature, secret) => {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};
```

## Performance Optimization

### CDN Configuration

**Cloudflare:**
```bash
# Cache static assets
# Minify CSS/JS
# Enable Brotli compression
# Set up page rules for API routes
```

**Platform CDN:**
```bash
# Most platforms include CDN automatically
# Configure cache headers for optimal performance
```

### Database Optimization

```sql
-- Connection pooling
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET shared_buffers = '256MB';

-- Query optimization
ANALYZE;
VACUUM;

-- Index maintenance
REINDEX DATABASE your_database;
```

## Backup and Recovery

### Database Backups

**Automated Backups:**
```bash
# Supabase: Automatic daily backups included
# Self-hosted: Set up pg_dump cron jobs
0 2 * * * pg_dump database > backup_$(date +%Y%m%d).sql
```

**Point-in-Time Recovery:**
```bash
# Supabase: Available in dashboard
# Self-hosted: Configure WAL archiving
```

### Application Backups

```bash
# Code: Git repository
# Environment: Secure environment variable backup
# Configuration: Infrastructure as code
```

## Disaster Recovery

### Recovery Procedures

1. **Database Recovery:**
   - Restore from latest backup
   - Verify data integrity
   - Update connection strings

2. **Application Recovery:**
   - Redeploy from Git
   - Restore environment variables
   - Verify all services are running

3. **Monitoring Recovery:**
   - Check all health endpoints
   - Verify job processing is working
   - Test critical user flows

### Failover Strategy

```bash
# Primary site down:
1. Switch DNS to backup deployment
2. Update webhook URLs
3. Verify all services operational
4. Monitor for issues

# Database failover:
1. Promote read replica
2. Update connection strings
3. Restart application services
4. Verify data consistency
```

## Deployment Checklist

### Pre-Deployment

- [ ] Environment variables configured
- [ ] Database migrations executed
- [ ] SSL certificates valid
- [ ] External services accessible
- [ ] Webhook endpoints configured
- [ ] Monitoring alerts set up
- [ ] Backup strategy implemented

### Post-Deployment

- [ ] Health check returns 200
- [ ] Test job creation and processing
- [ ] Verify webhook functionality
- [ ] Check monitoring alerts
- [ ] Test error scenarios
- [ ] Validate performance metrics
- [ ] Confirm backup procedures

### Rollback Plan

- [ ] Previous deployment tagged in Git
- [ ] Database rollback scripts ready
- [ ] Environment variable backup
- [ ] Monitoring for rollback verification
- [ ] Communication plan for users

For platform-specific deployment guides, see the individual configuration files in this directory.