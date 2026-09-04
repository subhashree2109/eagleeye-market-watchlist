# EagleEye - Smart Market Watchlist

EagleEye is a full-stack Next.js app for CODE 2026. Instead of a wall of tickers, it remembers a user's last check-in and shows what changed, why it matters, data confidence, and a suggested next action.

## Run locally

Requires Node 20+.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Evaluators can use `npm ci` for the exact locked dependency versions.

## Live data setup

1. Create a Finnhub account at https://finnhub.io/register.
2. Copy `.env.example` to `.env.local`.
3. Put the token in `FINNHUB_API_KEY`, then restart the server.

For Vercel persistence, also set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (see `.env.example`). EagleEye uses Supabase's server-side REST API directly, so no additional Supabase npm package is required.

The token is used only by server routes. Do not use a `NEXT_PUBLIC_` variable and do not commit `.env.local` publicly.

## What it does

- Live US equity quotes through Finnhub, refreshing every 30 seconds.
- Provider-backed search by company name or ticker, then add to the watchlist.
- Durable demo watchlists and quote baselines in `data.json`.
- A Change Ledger comparing the quote against the user's previous check-in.
- Meaningful signals: at least 1% since check-in, high urgency, or feed uncertainty.
- Honest statuses: `LIVE`, `DELAYED FEED`, and `MARKET CLOSED`.
- **Verify feed** bypasses the server cache and rechecks the provider.
- **Investigate now** opens the selected company quote page for deeper research.

## How it is built

- `app/page.js`: responsive frontend and interactions.
- `app/api`: dashboard, search, and watchlist backend routes.
- `lib/watchlist-db.js`: live quote adapter, scoring, freshness rules, and persistence.
- `data.json`: simple durable demonstration storage.

This is intentionally one Next.js application: no premature microservices, ORM, Redis, WebSockets, or authentication setup. The product value comes from the visit-aware comparison, not unnecessary infrastructure.

## Reliability and scale

Quotes include provider timestamps. A stale quote during US market hours is marked `DELAYED FEED`; after-hours quotes are `MARKET CLOSED`, not a feed error. Provider HTTP 403 errors are shown as an API-key configuration problem.

For production cross-device accounts, replace the file adapter with Postgres (Supabase or Neon) and authenticated users. For larger scale, cache quotes by symbol, use a scheduled quote worker, calculate ledger changes asynchronously, and introduce a secondary provider to handle conflicts and outages.

## Deploy

Deploy on **Vercel** (recommended) or Render:

1. Push the project to a private GitHub repository (without `.env.local`).
2. Import it into Vercel.
3. Add `FINNHUB_API_KEY` in Project Settings -> Environment Variables.
4. Deploy using the standard Next.js defaults.

## API

- `GET /api/dashboard`: dashboard quotes and the Change Ledger.
- `GET /api/search?q=...`: live symbol search for US common stocks.
- `POST /api/watchlist`: add an asset.
- `DELETE /api/watchlist/:symbol`: remove an asset.
