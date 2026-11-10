# Guest AI Allowance

Guest access remains available without sign-in. The server enforces a shared
USD 0.30 daily allowance per public IP across Deity chat, Places chat and optional
RazinFlix AI enrichment. Signed-in requests use the same IP allowance; signing in
does not bypass it. Shared networks/VPNs share an allowance. IP rotation cannot be
fully prevented; a USD 3.00 site-wide daily backstop bounds distributed abuse.

The allowance resets at midnight Asia/Dubai. It meters conservative estimated
OpenAI API usage, not an invoice, taxes, exchange rates, other Google services or
other applications sharing the billing project. Reservations include the maximum
completion cost and are adjusted only when provider usage is confirmed. Unknown
usage and provider errors retain their reservation until reset. A near-limit
request may be declined if its maximum possible completion would exceed the cap.

## Implementation

- `nsso_chat_budget_daily` and `nsso_chat_budget_requests` are server-only RLS
  tables. Anonymous and authenticated database clients have no privileges.
- SECURITY INVOKER RPCs serialize reservations and settlements under one
  transaction-level advisory lock. Reservations and settlement are idempotent.
- Each generation uses GPT-6 Luna, bounded output, reasoning disabled and a
  bounded provider timeout. The main chat retries at most once for an explicit
  HTTP 503 before any response stream exists, only with enough deadline remaining.
  The first reservation is retained and a separate second reservation must pass
  the same IP/global caps. Billing/authentication/model errors and partial streams
  are never automatically retried. There is no background retry loop.
- Failure to access the database or identify the trusted client IP pauses paid
  requests. There is no process-local budget fallback.
- Only Vercel's normalized forwarding headers identify production clients.
  Unknown production hosting fails closed. Local development uses loopback.
- IP addresses are HMAC-SHA256 hashed with `NSSO_CHAT_IP_HASH_SECRET`; the ledger
  stores no raw IPs, prompts, profile data or API keys. Technical records expire
  after 30 days. Do not rotate this secret during a day without accounting for
  the resulting new IP identities.
- A shared US$5 UTC calendar-month ceiling covers chat, Places, editorial work and operator indexing. It supplements the existing IP/day and site/day limits and uses the same locked durable reservations across production, preview and development. Unknown charges remain retained across month boundaries.
- Input reservations conservatively use US$0.25/M tokens (covering published cache-write rates), output US$0.50/M and embeddings US$0.02/M with UTF-8 byte token ceilings. No hosted paid tools are enabled. Exact model and prices are pinned in code; review before changing them.
- Provider access failures and credible usage exceeding the reservation hold the service for explicit operator review. User sign-in failures never create a provider hold. Disabled/unconfigured AI acquires no paid reservation.
- Source: https://developers.openai.com/api/docs/pricing

## Visitor Experience

Daily exhaustion returns HTTP 429 with a typed error and a fixed CTA:
"Request more access on LinkedIn", linking only to
https://www.linkedin.com/in/raminhoodeh/.
The main chat, its profile-action follow-ups and Places all display this response.
The CTA neither takes a payment nor automatically grants more allowance.
Optional RazinFlix enrichment instead falls back to verified TMDB metadata.

## Operations

Production requires `OPENAI_API_KEY` (nsso's dedicated server key), `NSSO_AI_ENABLED=true`,
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

Apply both OpenAI accounting/index migrations before release. Use the separate versioned 1,536-dimensional index; never compare or write OpenAI vectors in the original 768-dimensional index. See `openai-migration.md` and `../scripts/OPENAI_OPERATIONS.md` for cutover/recovery. Key retirement is separately recorded in the private migration ledger; source checks alone are not proof of provider revocation.
