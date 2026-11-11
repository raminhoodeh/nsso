# OpenAI operator commands

Applied operator work requires explicit coordinator authorization. Run the offline proof with
`node scripts/check-openai-operator.mjs`. It replaces every network request and
uses temporary checkpoint files, including the base64/float32/recovery proof.
Deployment, paid-operation and coverage evidence belong in the coordinator's
release records, not an assumption derived from this source document.

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
or pooled. Embedding replies request `encoding_format:base64`; each vector must
contain exactly 8,192 canonical characters decoding to 6,144 bytes and 1,536
little-endian Float32 values. Invalid lengths/encoding, nonfinite or all-zero
vectors, and mismatched indexes fail closed. The embedding body deadline is
120 seconds; text remains 45 seconds. Both keep one provider attempt.
The coordinator's read-only database measurement found 29,308 rows,
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

An explicit `--after <reviewed-UUID>` restricts new source selection to IDs
strictly above that UUID. It does not release, settle or retry unknown operations
below the cursor. Generated paid receipts are still recovered first without
another provider call. A `rangeOnly:true` checkpoint is not complete index
coverage; skipped unknown claims require separate operator reconciliation.

Validated vectors are saved before database settlement/write in mode-0600
atomic checkpoint files under `~/.config/nsso/openai-operator-v1` (or the protected
`NSSO_OPENAI_CHECKPOINT_DIR`). Restart first settles/commits those receipts without
calling OpenAI again. Completed checkpoints retain metadata only, dropping the
large vector payload. Do not delete uncertain checkpoints or release their
server claims to bypass review. A missing paid receipt requires explicit
provider/billing reconciliation before the coordinator clears a claim.

Checkpoints keep numeric arrays, including receipts created by the former float
transport. Only the index commit RPC encodes vectors with nine significant
decimal digits after Float32 normalization, preserving their stored Float32
values. The existing JSONB signed-zero normalization is unchanged. A private
in-memory receipt marker skips only an immediately repeated settlement with the
same request ID and acknowledged charge. Clones, restored files and changed
financial fields always call the durable idempotent settlement RPC. No marker
is persisted, and transport changes do not change terminal operation hashes.

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

Offline tests never publish a category/description, clear the source table,
change user profiles or make a purchase. Live coverage, retrieval acceptance,
Google key retirement and checkpoint retention remain coordinator-owned checks.
