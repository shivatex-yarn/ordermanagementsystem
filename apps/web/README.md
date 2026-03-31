This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Performance / load testing (k6)

This app is designed to scale via:
- Postgres connection pooling (Neon pooler URL)
- Redis caching (`REDIS_URL`)
- Smaller API payloads for list views

To *validate* concurrency in your environment, use k6:

1) Install k6 (macOS):

```bash
brew install k6
```

2) Get an auth cookie:
- Sign in in the browser
- Copy the `oms_token` cookie value

3) Run a quick smoke test:

```bash
cd apps/web
k6 run -e BASE_URL="http://127.0.0.1:3000" -e COOKIE="oms_token=PASTE_HERE" loadtest/k6-smoke.js
```

Increase load (example):

```bash
cd apps/web
k6 run -e BASE_URL="http://127.0.0.1:3000" -e COOKIE="oms_token=PASTE_HERE" -e VUS=1000 -e DURATION=60s loadtest/k6-smoke.js
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
