# OpenAI operator commands

These commands are implemented but have not made a real provider request or
modified application data during migration. Run the offline proof with
`node scripts/check-openai-operator.mjs`. It replaces every network request and
uses temporary checkpoint files. The shared application's database/provider
review, migration application and live retrieval evaluation remain release gates.

All old AI ingestion/enrichment commands now default to a dry run. Film mutation
requires `--apply`; the curated `ingest-razinflix-new-2026.mjs` command also uses
`--apply` in place of its former `--commit` flag. Existing Google Maps enrichment
in `build-dubai-places.mjs` is independent and is intentionally preserved.

The protected server environment must provide `OPENAI_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NSSO_AI_ENABLED=true`
and a separate `NSSO_OPENAI_OPERATOR_ENABLED=true`. No browser variable carries
the OpenAI key. Custom `OPENAI_BASE_URL` is rejected. Each paid attempt reserves
the conservative maximum against the same durable **US$5/month application
budget** through `reserve_nsso_chat_budget`, route `ingestion`, before the
atomic per-item `claim_nsso_openai_ingestion` RPC and fixed-origin request. A
previously claimed operation is never replayed automatically; its unused fresh
reservation settles at zero. Unknown outcomes retain their full reservation and
terminal claim. Account/429/timeout/contract errors stop the command without
retries or another provider.

`text-embedding-3-small` uses 1,536 dimensions and US$0.02/million tokens. Input
UTF-8 bytes provide a conservative token ceiling: no more than 8,000 bytes per
source and 250,000 bytes/128 inputs per request. Source text is never truncated
or pooled. The coordinator's read-only database measurement found 29,308 rows,
maximum 6,609 content bytes, and zero rows above this bound. Film editorial
requests use `gpt-6-luna`, no tools, strict JSON, `store:false`, fixed default
service tier and at most 512 output tokens. Costs reserve all input at
US$0.25/million and output at US$0.60/million, covering published cache-write
rates without assuming cached discounts.

Run `node scripts/reembed-openai-index.mjs` for the no-network dry plan.
After the coordinator applies/reviews the SQL and authorizes the canary:

```sh
node scripts/reembed-openai-index.mjs --apply --max-batches 1
```

The default maximum is 1,000 batches; increase only through the bounded flag if
needed. The script reads stale/unindexed source rows through
`nsso_openai_index_batch(p_after:null,p_limit:128)`, using the database's canonical
`md5(content || coalesce(metadata::text,''))`. Each input has its own durable
provider/model/id/content-hash claim, so changed batch grouping cannot replay
uncertain source work. Writes go solely through
`commit_nsso_openai_index_batch(p_rows)` into `agent_knowledge_openai_v1`, with
current source hash/row locks and dimension validation. Original `agent_knowledge`
text, metadata and old vectors remain intact. Query/index cutover is separately
owned by the coordinator and must follow coverage/retrieval acceptance tests.

Validated vectors are saved before database settlement/write in mode-0600
atomic checkpoint files under `~/.config/nsso/openai-operator-v1` (or the protected
`NSSO_OPENAI_CHECKPOINT_DIR`). Restart first settles/commits those receipts without
calling OpenAI again. Completed checkpoints retain metadata only, dropping the
large vector payload. Do not delete uncertain checkpoints or release their
server claims to bypass review. A missing paid receipt requires explicit
provider/billing reconciliation before the coordinator clears a claim.

`ingest-context.ts`, `ingest-database.ts` and `ingest-films.ts` now add original
text only, with `embedding:null`, only under `--apply`. Exact existing content is
skipped and new row IDs derive from a deterministic content fingerprint to
prevent concurrent duplicate inserts. Original local CSV/Markdown files stay
unchanged. A following versioned backfill supplies the OpenAI vector. Oversized
new sources require reviewed chunking; the script refuses them. The old
`clear-and-reingest.ts` is a safe backfill alias and permanently refuses
`--clear`, `--delete` and `--truncate`.

Film enrichment/cleanup defaults to a zero-network dry run. An applied run is
bounded to 25 selected films by default (`--limit`, maximum 500), preserves `New`
and `Japanese Anime`, rejects invalid categories instead of defaulting to an
invented category, and uses optimistic original-field predicates on writes.
Generated receipts resume a failed database write without another paid call;
concurrent authored edits cause a safe stop. Completed local receipts skip
unchanged already-processed films. `cleanup` counts categories across the source
catalogue, rather than treating the bounded mutation sample as the catalogue.

No migration test invokes these commands with real `--apply`, publishes a
category/description, clears the source table, changes user profiles or makes a
purchase. Live embedding coverage, retrieval quality, operator account access,
Google key retirement and external checkpoint storage policy remain pending.
