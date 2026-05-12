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

## Vercel

In the Vercel project, set **Root Directory** to `apps/web` (Settings → General). That way installs and builds run in the Next.js app folder instead of the repository root.

If you ever add an npm **workspace** at the repo root, npm will create a symlink such as `node_modules/order-management-web` → `apps/web`. That is one project, not a copy; your editor may still show both trees.
