# Order management system

Next.js application and API for order workflows, divisions, SLA, and admin tooling.

## Repository layout

The runnable project lives under **`apps/web`**. Open that directory for dependencies, environment variables, database migrations, and scripts.

## Quick start

```bash
cd apps/web
npm ci
# Configure environment (see apps/web/README.md and your deployment docs)
npx prisma migrate deploy
npm run dev
```

For load testing, deployment, and other details, see [apps/web/README.md](apps/web/README.md).
