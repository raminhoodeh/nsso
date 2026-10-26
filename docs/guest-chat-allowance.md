# Guest AI Allowance

Guest access remains available without sign-in. The server enforces a shared
USD 0.30 daily allowance per public IP across Deity chat, Places chat and optional
RazinFlix AI enrichment. Signed-in requests use the same IP allowance; signing in
does not bypass it. Shared networks/VPNs share an allowance. IP rotation cannot be
fully prevented; a USD 3.00 site-wide daily backstop bounds distributed abuse.

The allowance resets at midnight Asia/Dubai. It meters conservative estimated
Gemini API usage, not an invoice, taxes, exchange rates, other Google services or
other applications sharing the billing project. Reservations include the maximum
completion cost and are adjusted only when provider usage is confirmed. Unknown
usage and provider errors retain their reservation until reset. A near-limit
request may be declined if its maximum possible completion would exceed the cap.

## Implementation

- `nsso_chat_budget_daily` and `nsso_chat_budget_requests` are server-only RLS
  tables. Anonymous and authenticated database clients have no privileges.
- SECURITY INVOKER RPCs serialize reservations and settlements under one
  transaction-level advisory lock. Reservations and settlement are idempotent.
- Each generation uses Gemini 2.5 Flash, bounded output, thinking disabled and a
  bounded provider timeout. No automatic provider retry occurs.
- Failure to access the database or identify the trusted client IP pauses paid
  requests. There is no process-local budget fallback.
- Only Vercel's normalized forwarding headers identify production clients.
  Unknown production hosting fails closed. Local development uses loopback.
- IP addresses are HMAC-SHA256 hashed with `NSSO_CHAT_IP_HASH_SECRET`; the ledger
  stores no raw IPs, prompts, profile data or API keys. Technical records expire
  after 30 days. Do not rotate this secret during a day without accounting for
  the resulting new IP identities.
- The server prices text input at USD 0.30/M tokens and output including thinking
  at USD 2.50/M tokens. Embeddings use a conservative UTF-8 byte upper bound at
  the text-input rate. Cached input is not discounted in allowance accounting.
  Review these assumptions before changing models or enabling paid grounding.
  Source: https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash

## Visitor Experience

Daily exhaustion returns HTTP 429 with a typed error and a fixed CTA:
"Request more access on LinkedIn", linking only to
https://www.linkedin.com/in/raminhoodeh/.
The main chat, its profile-action follow-ups and Places all display this response.
The CTA neither takes a payment nor automatically grants more allowance.
Optional RazinFlix enrichment instead falls back to verified TMDB metadata.

## Operations

Production requires `GOOGLE_GENERATIVE_AI_API_KEY` (NSSO's dedicated server key),
`NSSO_CHAT_IP_HASH_SECRET` (at least 32 characters, generated randomly),
`NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
Never expose either private key as a `NEXT_PUBLIC_` variable. Apply the checked-in
`guest_ai_allowance` migration before deploying the application. Preserve the
HMAC secret across deployments. Preview/development must have their own explicit
configuration; do not silently fall back to an unmetered production key.

Verification: `npm test`, `npm run typecheck`, `npm run build`, rollback-only SQL
assertions for caps/reset/idempotency/privileges, and concurrent service-role RPC
claims. New tables intentionally have no client policies: that is a deny-all
design, not a missing public read policy.

Unrelated existing Supabase findings (including disabled RLS on
`razinflix_films` and public SECURITY DEFINER functions) are not repaired by this
allowance feature. They require a separate policy/access review. This release
does not revoke old Google keys or complete Dreamsea's backend migration.
