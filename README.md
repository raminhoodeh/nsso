<div align="center">

# nsso

### *new sovereign self online*

**The most beautiful way to present yourself online.**

One URL. Every side of you. Powered by AI that knows you by name.

[**nsso.me**](https://nsso.me) · [**Live Profile Demo**](https://nsso.me/ramin)

---

</div>

## What is nsso?

Professional identity online is a fragmentation problem masquerading as a presentation problem. You have a LinkedIn, a Linktree, a personal site, a portfolio, a payment link, and a WhatsApp number — none of which speak to each other, and none of which present you at the depth your work actually deserves.

**nsso** solves this. It is a unified professional homepage — one URL, one identity surface — that triples as a **next-gen résumé**, a **link-in-bio tool**, and a **personal storefront**. Built around the belief that presenting yourself well is an act of clarity, not vanity.

> *"Give a man a purpose and the ability to achieve it, and he'll walk over broken glass with a smile."*

---

## Core Features

### 🪪 Profile & Identity Layer

- **Free claimable domain** at `nsso.me/[username]` — no subdomain fees, no waitlist
- Fully structured CV: experiences, qualifications, and projects with images and URLs
- **Drag-and-drop reordering** of all CV sections via `@dnd-kit/core` with keyboard accessibility and optimistic Supabase state updates — reorders commit to the database in the background without blocking the UI
- **Image cropper modal** with configurable aspect ratios (1:1 for products, 16:9 for projects), producing a cropped `Blob` before upload — no low-quality or misaligned images enter the database
- Contact methods (WhatsApp, email, phone, Telegram) and social/professional links with platform auto-detection
- **QR-code networking** — shareable profile QR for in-person introductions; "Add to My NSSO" connection system on every public profile
- **Profile completeness scoring (0–100)** calculated server-side across five weighted dimensions — surfaced to the AI agent for targeted coaching nudges

### 🤖 Deity — Agentic AI Profile Coach

Deity is not a chatbot that gives advice about your profile. It is an **AI agent that directly reads, writes, and mutates your live profile in real time**, with full contextual awareness of everything in it.

**How it works:**

Every request fetches your complete profile via a Supabase RPC (`get_agent_context`) — all fields, experiences, qualifications, projects, products, links, and contacts — serialised into a structured context string and injected into the system prompt on every turn. The agent always has a complete, current read of who you are.

**Hybrid RAG — personalised retrieval that adapts to you:**

In parallel, Deity generates two 768-dimension embeddings using `gemini-embedding-001`:

1. A **query embedding** of your message
2. A **profile embedding** of your professional background

Both feed into a `pgvector`-powered similarity search across a proprietary curated knowledge corpus: angel investor databases, VC databases, UK business grants, startup accelerators, career coaching resources, remote job boards, US tech companies, and more. Results are **re-ranked in the database** using a weighted scorer — 50% vector similarity, 20% source diversity, 30% profile-text relevance. Two people asking the same question receive different top results based on their industry and work history.

**Direct profile mutation — nine tool schemas:**

When Deity identifies profile intent, it operates with nine declared function schemas: `update_profile_field`, `add_experience`, `add_project`, `add_qualification`, `add_product`, `add_link`, `update_link`, `remove_link`, `reorder_links`. Each proposed change is intercepted mid-stream and surfaced as a **Review Mode confirmation card** — showing the field name, current value, and proposed value. No profile mutation is ever silent, irreversible, or autonomously applied. A **Fast Mode** toggle is available for users who prefer immediate auto-execution.

**Intent arbitration:**

`contextManager.ts` classifies every message as profile intent or knowledge intent via keyword heuristics, with a sticky context mechanism that biases classification toward the previous turn's mode — preventing topic bleeding during multi-turn conversations.

**Prompt injection protection:**

Tool declarations are entirely omitted for guest sessions. There is no function schema in scope for the model to call, meaning a malicious prompt cannot trigger a tool invocation regardless of how it is phrased.

### ✍️ Intros — AI-Generated Audience-Tailored Bios

Gemini 2.0 Flash generates three distinct bio variants for three target audiences the user specifies (e.g. "investors," "clients," "collaborators") — each rewritten in tone and emphasis for that reader. No manual copy needed.

### 🛍️ Storefront & Monetisation Layer

- **Product listings** with name, price, description, and image (same upload + crop pipeline as project photos)
- **Sales Page Creator** — each product can have a dedicated, full-page hosted sales page with a comprehensive CRO field set: headline, tagline, intro text, value proposition, benefits list, testimonials, video embed URL, and a PayPal payment embed field
- **PayPal HTML Injection Protection** — real-time DOMPurify sanitisation with a strict allowlist, secondary regex domain verification, `ShieldCheck`/`ShieldAlert` UI feedback, and a human-readable security verdict. Power users get full PayPal embed functionality; the platform stays clean
- **Referral Earnings Programme** — unique referral code per user (`NEWCV[3-digit]`), 40% commission at £8/month (£3.20/referred user/month), `/earnings` dashboard with active referral count, expected monthly earnings, and PayPal.me payout routing
- PayPal Hosted Button SDK and one-off payment support
- Polar integration for subscription product billing
- Web3 wallet integration (Solana) — architecture in place, pending regulatory approval

---

## Design System

nsso is built on a custom multi-variant glass rendering system — not a Tailwind plugin, not a library. Real composited glass.

### Liquid Glass Components

The `GlassCard` component exposes five rendering variants:

| Variant | Technique |
|---|---|
| `default` | `backdrop-blur: 40px`, specular highlight pseudo-element |
| `strong` | `backdrop-blur: 50px`, modal and overlay surfaces |
| `subtle` | `backdrop-blur: 30px`, secondary containers |
| `apple` | Near-zero base opacity, `saturate(200%)`, CSS mask composite `xor` — the iOS vibrancy effect |
| `ultimate` | `saturate(220%)`, fractal noise SVG filter (`feTurbulence`), three-layer stack with `mix-blend-mode: overlay` |

The `CleanGlassCard` on the landing page uses a separate multi-layer compositing approach: `mix-blend-color-burn` + `mix-blend-luminosity` + a purple accent tint + a Siri-gradient PNG at 40% opacity — iridescent shimmer without depending on `backdrop-filter` alone.

### 3D Cloud Hero Typography

Five words stacked vertically at `text-7xl`/`text-8xl` with graduated opacity (`/40 → /60 → /100 → /60 → /40`) create a volumetric depth illusion. No SVG filter, no 3D CSS transform, no canvas, no JavaScript. Pure CSS typographic sculpture.

### Liquid Glass Username Input

Six composited layers produce a physically plausible glass surface on the landing page `nsso.me/[username]` claim input: `mix-blend-color-burn` grey, `mix-blend-luminosity` desaturation, purple accent tint, Siri-gradient PNG shimmer, inner shadow bottom-edge light refraction, and a gradient border bevel on the CLAIM IT button consistent with Apple HIG glass conventions.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript |
| Styling | Tailwind CSS 4, custom multi-variant glass design system |
| Database | Supabase Postgres, pgvector |
| Storage | Supabase Storage (avatars, project images, product images) |
| AI Agent | Google Gemini 2.0 Flash |
| Embeddings | Gemini Embedding 001 (768 dimensions) |
| Tool Calling | Gemini Function Declarations (9 schemas) |
| Drag and Drop | @dnd-kit/core, @dnd-kit/sortable |
| HTML Sanitisation | DOMPurify |
| Payments | PayPal HTML buttons, PayPal Hosted Button SDK, Polar |

---

## Architecture Highlights

**Why `pgvector` over a dedicated vector store?**
The knowledge base is a static, curated corpus. A co-located vector index in the same Postgres instance means retrieval is a single authenticated SQL call — no cross-service API call, no extra auth layer, no cold-start penalty. The performance justification for Pinecone or Weaviate doesn't exist until the corpus grows by at least an order of magnitude.

**Why Review Mode over full AI autonomy?**
Professional identity content is high-stakes in a way a calendar entry is not. A wrong bio on a live public profile is a trust and credibility problem. Presenting each proposed change as a card — field, before, after — and requiring explicit confirmation puts the user in control of final output while the agent does 95% of the work.

**Why dual-embedding re-ranking?**
RAG retrieval over a generic knowledge base produces generic results. A designer and a startup founder asking "what investors should I approach?" should not receive the same top documents. Re-ranking by profile-text relevance — computed as a weighted scorer inside the Supabase RPC at the database layer — means the personalisation runs with no additional round-trip.

---

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

The app renders without every integration enabled, but feature areas that call Supabase, Gemini, Polar, PayPal, or wallet providers require the matching environment variables in `.env.local`.

```bash
npm run dev      # start dev server
npm run lint     # run linter
npm run build    # production build
```

### Environment Variables

`.env.example` documents all expected variables. Use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for client-safe reads; keep `SUPABASE_SERVICE_ROLE_KEY` server-only.

> The knowledge base ingestion CSVs are not published in this repo. Keep private context files in a local `nsso agent context database/` directory or point `NSSO_CONTEXT_DIR` at another private folder before running ingestion scripts.

---

## Documentation

- [RazinFlix AI pipeline](docs/razinflix/ai_pipeline.md)
- [RazinFlix database schema](docs/razinflix/database_schema.md)
- [RazinFlix UI architecture](docs/razinflix/ui_architecture.md)
- [Chatbot context ingestion](docs/chatbot-context.md)

---

## Live Demo

| | |
|---|---|
| **Landing page** | [nsso.me](https://nsso.me) — username claim, Deity in guest mode, full product tour |
| **Example profile** | [nsso.me/ramin](https://nsso.me/ramin) — live profile with Deity agent, product listings, and social links |

---

<div align="center">

*nsso is specifically designed to present yourself in a way that not only makes you feel clear, but proud, of who you are.*

</div>
