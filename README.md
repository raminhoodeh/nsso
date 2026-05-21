# nsso

`nsso` is a Next.js application for building a richer personal identity layer online. The product combines public profiles, a member dashboard, AI-assisted profile editing, referral and earnings flows, product pages, and a film-library showcase called RazinFlix.

## What is in this repo

- **App Router frontend** built with Next.js, React, TypeScript, and Tailwind CSS.
- **Supabase backend integration** for profiles, links, contacts, products, referrals, news feed data, and RazinFlix records.
- **Deity AI assistant** that uses Gemini plus a Supabase-backed knowledge base to help edit and reason over profile context.
- **Web3 wallet plumbing** through Wagmi, Viem, and Solana wallet adapters.
- **Payment integrations** for Polar and PayPal-powered flows.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

The app can render without every integration enabled, but feature areas that call Supabase, Gemini, Polar, PayPal, TMDB, or wallet providers require the matching environment variables in `.env.local`.

## Useful commands

```bash
npm run dev
npm run lint
npm run build
```

## Environment

`.env.example` documents the expected variables. Use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for client-safe reads, and keep `SUPABASE_SERVICE_ROLE_KEY` server-only.

The chatbot ingestion source CSVs are intentionally not published. Keep private context files in the local `nsso agent context database/` directory or point `NSSO_CONTEXT_DIR` at another private folder before running ingestion scripts.

## Documentation

- [Chatbot context ingestion](docs/chatbot-context.md)

## Public repo notes

Generated build output, local environment files, chatbot context CSV dumps, database diagnostics, and one-off maintenance logs are excluded from version control. The committed code should be enough to understand and run the app, while private operational data stays local.
