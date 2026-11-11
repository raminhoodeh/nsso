# OpenAI migration operations

The migration uses dedicated server-only production and development keys in the nsso OpenAI project. The project enforces US$5/month within the shared four-application US$24/month organisation ceiling. Automatic credit recharge is disabled. Application reservations supplement delayed provider metering; the user's £30 total includes a conservative currency/tax reserve.

Runtime configuration: `OPENAI_API_KEY`, `NSSO_AI_ENABLED=true`, existing Supabase service configuration and `NSSO_CHAT_IP_HASH_SECRET`. Disabled or absent provider configuration makes no paid reservation. Preserve Google Maps, YouTube and OAuth settings; they are independent of AI. No Gemini SDK, active fallback or browser/iOS provider key is used.

GPT-6 Luna uses Responses with `store:false`, reasoning `none`, fixed Standard tier and no hosted paid tools. Profile tools only prepare validated proposals; existing account verification and explicit user confirmation remain required. The transport handles typed text/tool/terminal SSE events, aborts interrupted requests, and never replays partial streams. One explicit pre-stream HTTP503 may acquire a separately charged retry. Provider access failures create a durable manual hold, distinct from a user's expired login.

`openai_monthly_budget` and `openai_knowledge_index` were applied as Supabase versions20261110135549 and20261110135550. Required transaction-rollback, anonymous/authenticated denial and real concurrent REST claims passed; their synthetic rows were removed and counters reconciled. Monthly settlement retains credible actual charges and holds new work if a reservation bound was exceeded.

The OpenAI index is `agent_knowledge_openai_v1`, using `text-embedding-3-small` and1536dimensions. `intelligent_search_openai_v1` joins original text/metadata only when its canonical database content hash matches. Original29308rows/text/metadata and768-dimensional vectors are retained. Never compare vectors from different providers or restore an old Google key as recovery. The safe backfill and its terminal claims/checkpoints are documented in `../scripts/OPENAI_OPERATIONS.md`.

Recovery preserves ordinary profiles, purchases and personal apps: set `NSSO_AI_ENABLED=false` and redeploy, or retain a durable provider hold. An index problem can pause recommendations while product/profile assistance is repaired; it cannot justify mixing vector spaces. Review the exact cause, current prices, key scope and uncertain receipts before manually clearing `nsso_ai_control.blocked`. Do not delete unknown paid claims to force a retry. A previous verified OpenAI artifact is the rollback target.

Required source verification: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run verify:secrets` and the operator's mocked safety proof. Actual provider, corpus coverage/retrieval, browser, released revision and Google resource-retirement evidence live in the private coordinator ledger at `/Users/raminhoodeh/.config/ramin-vision/openai-migration-20261110`; source tests alone do not prove those release gates.

Current prices and endpoint behaviour were checked against official documentation on10November2026:
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/models/text-embedding-3-small
- https://developers.openai.com/api/docs/guides/spend-limits
- https://developers.openai.com/api/docs/guides/your-data
