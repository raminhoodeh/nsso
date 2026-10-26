# nsso

**New sovereign self online — all of you, all in one place.**

nsso is an AI-assisted personal homepage that combines a link-in-bio, a structured résumé and portfolio, and a creator storefront at `nsso.me/[username]`.

## Current product

- Profiles contain a bio, links, contact methods, experience, qualifications, projects and products/services.
- The dashboard edits that information, crops and uploads images, and supports drag-and-drop ordering.
- Deity reads the user's profile, proposes structured edits, and recommends resources from a curated knowledge library. Review Mode requires approval; optional Fast Mode applies proposed changes automatically.
- My nsso stores personal connections, meeting details and notes, with QR profile sharing.
- Creators can sell products and services through purchase links, PayPal buttons and dedicated sales pages. These seller payments are separate from platform account access.
- Premium account access and username claims are currently free, without a fixed expiry. Platform subscription checkout, cancellation and billing webhooks are disabled. Legacy billing endpoints return HTTP 410 and perform no billing or account changes.
- Historical referral records are retained. New subscription-based earnings are paused while accounts are free.
- Web3 integration is planned. Wallet connection scaffolding is isolated from the current application shell; wallet authentication and crypto checkout are not active account features.

News Feed has implementation scaffolding but remains marked as coming soon in normal navigation.

## Separate personal apps

RazinFlix (`/film/razinflix`) and UAE Places (`/places/dubai`) are personal web apps made for Ramin and his partner. They share this repository and domain for convenience; they are separate from the nsso product roadmap. Their routes, data, provider integrations and regression suites are maintained independently.

The repository also contains Dreamsea pages and the standalone MyNas map. Keep these hosted experiences separate when changing nsso's profile or account flows.

## Architecture

| Area | Implementation |
| --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript |
| Interface | Tailwind CSS 4 and a custom Tahoe/Liquid Glass system |
| Identity and data | Supabase Auth, PostgreSQL, row-level security and Storage |
| Profile assistant | Gemini conversation, structured function calls, frontend action review |
| Knowledge retrieval | Gemini embeddings and Supabase/pgvector hybrid search |
| Creator payments | PayPal HTML/hosted buttons and external purchase links |
| Personal Places assistant | Separate read-only public catalog, validated structured recommendations |

`src/app` contains routes and API handlers. `src/components` contains the profile editor, shared providers, navigation and reusable interface components. `src/lib` contains integration logic. `supabase` contains the core schema and incremental SQL. `tests` contains regression suites. `scripts` contains retained ingestion and maintenance tools.

The public profile is rendered on the server. Interactive editors and assistants use client components. The current Next.js request boundary is `src/proxy.ts`; session refresh and route protection are implemented in `src/lib/supabase/middleware.ts`.

Deity gets authenticated profile context through `get_agent_context`. Knowledge requests use query and profile embeddings plus keyword ranking through `intelligent_search`; profile-edit requests expose structured tools. Guest requests do not receive profile-mutation tools. See the SQL function and chat handler for the executable retrieval weights and limits.

## Local development

Use Node.js 24 and npm. From this application directory:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Fill in Supabase configuration for account/profile operations and the Gemini key for AI features. PayPal, TMDB, YouTube and Google Maps configuration is specific to the features that use those providers. Platform subscription credentials are not required.

Private knowledge-source CSVs stay in the gitignored `nsso agent context database/` directory or the directory specified by `NSSO_CONTEXT_DIR`. Runtime retrieval uses Supabase, not those local files. See [context ingestion](docs/chatbot-context.md).

For an existing database, retain its data and applied SQL history. A code update does not require clearing or re-ingesting user profiles. Archived experiments and one-off diagnostics are outside the active application and are not part of its setup. The two historical profile-metadata migration versions remain as no-op markers; their original SQL is archived, and this cleanup does not drop columns from an existing database.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The general regression suite uses fixtures and mocked providers. Optional live provider checks in maintenance scripts are separate from `npm test`. A passing build does not confirm production credentials, database policies, payment completion or deployment.

## Working copy

Use `git fetch origin` and inspect `git status --short --branch` before starting work. Preserve uncommitted work before updating branches. The primary app is this `nsso-app` checkout; `nsso-meta-pixel-release` is a separate worktree, and historical backups are not release sources.
