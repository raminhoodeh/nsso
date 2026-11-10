/** Protected operator-only AI requests. No SDK retries, cloud URL overrides or raw errors. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });

export const TEXT_MODEL = 'gpt-6-luna';
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const DIMENSIONS = 1536;
const INPUT_MICROS = 0.25; // Highest published cache-write rate; no cached discounts.
const OUTPUT_MICROS = 0.60;
const EMBEDDING_MICROS = 0.02;
const OPERATOR_HASH = createHash('sha256').update('nsso-reviewed-operator-ingestion-v1').digest('hex');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export class OperatorError extends Error { constructor(code, { retryable = false } = {}) { super(code); this.code = code; this.retryable = retryable; } }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
export function fingerprint(value) { return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex'); }
export function applyMode(argv = process.argv.slice(2)) { return argv.includes('--apply'); }
export function numericOption(name, fallback, maximum, argv = process.argv.slice(2)) {
  const index = argv.indexOf(name);
  const value = index < 0 ? fallback : Number(argv[index + 1]);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new OperatorError('invalid_operator_bounds');
  return value;
}
export function reportFailure(error) { console.error(JSON.stringify({ ok: false, code: error instanceof OperatorError ? error.code : 'operator_failed_safely' })); process.exitCode = 1; }
function databaseConfig() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) || !key) throw new OperatorError('operator_database_not_configured');
  return { url, key };
}
function databaseTiming(value) {
  if (process.env.NSSO_OPENAI_DB_TIMINGS === 'true' || process.argv.includes('--db-timings')) console.error(JSON.stringify({ kind: 'openai-operator-database-timing', ...value }));
}
const DATABASE_RPC_POLICIES = Object.freeze({
  // These exact SQL functions are safe to repeat after an ambiguous HTTP result:
  // read-only selection, same-receipt settlement, or same hash-checked vector upsert.
  nsso_openai_index_batch: { timeoutMs: 30_000, attempts: 3 },
  finish_nsso_chat_budget: { timeoutMs: 60_000, attempts: 3 },
  commit_nsso_openai_index_batch: { timeoutMs: 120_000, attempts: 3 },
});
export async function database(route, { method = 'GET', body, headers = {}, timeoutMs = 15_000, attempt = 1 } = {}) {
  const { url, key } = databaseConfig();
  const started = performance.now();
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  // Route query parameters may contain authored text. Only a code-owned table or
  // RPC identifier is diagnostic; never log a URL, request body, response or key.
  const identifier = route.replace(/^rpc\//, '').split('?')[0];
  const operation = /^[a-z0-9_]+$/.test(identifier) ? identifier : 'database';
  const metadata = { operation, attempt, timeoutMs, requestBytes: encoded === undefined ? 0 : Buffer.byteLength(encoded), headersMs: null, responseBytes: null, httpStatus: null };
  try {
    const response = await fetch(`${url}/rest/v1/${route}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...headers }, ...(encoded === undefined ? {} : { body: encoded }), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    metadata.headersMs = Math.round(performance.now() - started);
    metadata.httpStatus = response.status;
    const text = await response.text();
    metadata.responseBytes = Buffer.byteLength(text);
    if (!response.ok) {
      let code;
      try { code = JSON.parse(text)?.code; } catch { /* Error bodies stay private. */ }
      if (typeof code === 'string' && /^[A-Z0-9]{5,12}$/.test(code)) metadata.databaseCode = code;
      throw new OperatorError('operator_database_request_rejected', { retryable: [408, 429, 500, 502, 503, 504].includes(response.status) || ['57014', '40001', '40P01', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003'].includes(code) });
    }
    let value = null;
    try { if (text) value = JSON.parse(text); } catch { throw new OperatorError('operator_database_invalid_reply'); }
    databaseTiming({ ...metadata, elapsedMs: Math.round(performance.now() - started), outcome: 'ok' });
    return value;
  } catch (error) {
    const failure = error instanceof OperatorError ? error : new OperatorError('operator_database_unavailable', { retryable: true });
    databaseTiming({ ...metadata, elapsedMs: Math.round(performance.now() - started), outcome: failure.code, errorClass: error instanceof OperatorError ? 'OperatorError' : /^[A-Za-z]+$/.test(error?.name || '') ? error.name : 'TransportError' });
    throw failure;
  }
}
export async function rpc(name, values) {
  const policy = Object.hasOwn(DATABASE_RPC_POLICIES, name) ? DATABASE_RPC_POLICIES[name] : { timeoutMs: 15_000, attempts: 1 };
  for (let attempt = 1; attempt <= policy.attempts; attempt++) {
    try { return await database(`rpc/${name}`, { method: 'POST', body: values, timeoutMs: policy.timeoutMs, attempt }); }
    catch (error) {
      if (!error.retryable || attempt === policy.attempts) throw error;
      const delayMs = attempt * 2_000;
      databaseTiming({ operation: name, attempt, outcome: 'idempotent_retry_scheduled', delayMs });
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
function checkpointDirectory() { return path.resolve(process.env.NSSO_OPENAI_CHECKPOINT_DIR || path.join(os.homedir(), '.config/nsso/openai-operator-v1')); }
export async function saveCheckpoint(id, value) {
  if (!UUID.test(id)) throw new OperatorError('invalid_checkpoint_id');
  const directory = checkpointDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${id}.${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, path.join(directory, `${id}.json`));
}
export async function readCheckpoints(kind, state = 'generated') {
  const directory = checkpointDirectory();
  let names;
  try { names = await readdir(directory); } catch (error) { if (error.code === 'ENOENT') return []; throw new OperatorError('operator_checkpoint_unavailable'); }
  const results = [];
  for (const name of names.filter(name => UUID.test(name.replace(/\.json$/, '')) && name.endsWith('.json'))) {
    let value;
    try { value = JSON.parse(await readFile(path.join(directory, name), 'utf8')); } catch { throw new OperatorError('operator_checkpoint_corrupt'); }
    if (value.kind === kind && value.state === state) results.push(value);
  }
  return results;
}
async function reserve(requestId, micros) {
  if (!Number.isSafeInteger(micros) || micros < 1 || micros > 100_000) throw new OperatorError('operator_request_budget_unreviewed');
  const value = await rpc('reserve_nsso_chat_budget', { p_ip_hash: OPERATOR_HASH, p_request_id: requestId, p_route: 'ingestion', p_micros: micros });
  if (value?.allowed !== true) throw new OperatorError('operator_budget_unavailable_or_exhausted');
}
async function settle(requestId, usage, kind, maximum) {
  const input = kind === 'embedding' ? usage?.prompt_tokens : usage?.input_tokens;
  const output = kind === 'embedding' ? 0 : usage?.output_tokens;
  if (![input, output].every(value => Number.isSafeInteger(value) && value >= 0)) throw new OperatorError('operator_usage_unknown_maximum_retained');
  const actual = Math.ceil(input * (kind === 'embedding' ? EMBEDDING_MICROS : INPUT_MICROS) + output * OUTPUT_MICROS);
  await rpc('finish_nsso_chat_budget', { p_request_id: requestId, p_micros: actual, p_confirmed: true });
  if (actual > maximum) {
    await rpc('hold_nsso_ai_budget', { p_code: 'usage_bound_exceeded' });
    throw new OperatorError('operator_usage_overrun_review_required');
  }
  return actual;
}
export async function paidRequest({ kind, body, operationHashes, checkpoint, validate }) {
  if (!operationHashes?.length || operationHashes.length > 128 || operationHashes.some(hash => !/^[a-f0-9]{64}$/.test(hash))) throw new OperatorError('operator_claims_invalid');
  if (process.env.NSSO_AI_ENABLED !== 'true' || process.env.NSSO_OPENAI_OPERATOR_ENABLED !== 'true' || !process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) throw new OperatorError('operator_ai_disabled_or_unconfigured');
  const requestId = randomUUID();
  const encoded = JSON.stringify(body);
  const maximum = kind === 'embedding'
    ? Math.ceil((body.input.reduce((total, text) => total + Buffer.byteLength(text, 'utf8'), 0) + 2048) * EMBEDDING_MICROS)
    : Math.ceil((Buffer.byteLength(encoded, 'utf8') + 2048) * INPUT_MICROS + body.max_output_tokens * OUTPUT_MICROS);
  // Server claims are atomic per source operation. Unknown outcomes stay claimed
  // across workers/restarts until explicit operator reconciliation, never a retry.
  await reserve(requestId, maximum);
  const claim = await rpc('claim_nsso_openai_ingestion', { p_operation_hashes: operationHashes, p_request_id: requestId });
  if (claim?.claimed !== true) {
    await rpc('finish_nsso_chat_budget', { p_request_id: requestId, p_micros: 0, p_confirmed: true });
    throw new OperatorError('operator_operation_already_claimed_review_required');
  }
  await saveCheckpoint(requestId, { requestId, ...checkpoint, state: 'claimed', operationHashes });
  let response;
  try {
    response = await fetch(`https://api.openai.com/v1/${kind === 'embedding' ? 'embeddings' : 'responses'}`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: encoded, redirect: 'error', signal: AbortSignal.timeout(45_000) });
  } catch { throw new OperatorError('operator_unknown_outcome_maximum_retained'); }
  if (!response.ok) {
    await response.body?.cancel();
    if ([401, 402, 403].includes(response.status)) {
      await rpc('hold_nsso_ai_budget', { p_code: 'provider_access_requires_review' });
      throw new OperatorError('operator_account_review_required');
    }
    throw new OperatorError(response.status === 429 ? 'operator_rate_limited_no_retry' : 'operator_provider_failed_no_retry');
  }
  let reply;
  try { reply = await response.json(); } catch { throw new OperatorError('operator_unknown_reply_maximum_retained'); }
  const input = kind === 'embedding' ? reply.usage?.prompt_tokens : reply.usage?.input_tokens;
  const output = kind === 'embedding' ? 0 : reply.usage?.output_tokens;
  if (![input, output].every(value => Number.isSafeInteger(value) && value >= 0)) throw new OperatorError('operator_usage_unknown_maximum_retained');
  const actualMicros = Math.ceil(input * (kind === 'embedding' ? EMBEDDING_MICROS : INPUT_MICROS) + output * OUTPUT_MICROS);
  if (actualMicros > maximum) await settle(requestId, reply.usage, kind, maximum);
  let validated;
  try { validated = validate(reply); } catch (error) {
    await settle(requestId, reply.usage, kind, maximum);
    throw error;
  }
  // Persist the validated paid result before a settlement/database outage can
  // lose it. Recovery uses this result only, never another provider attempt.
  await saveCheckpoint(requestId, { requestId, ...checkpoint, ...validated, state: 'generated', actualMicros });
  await settle(requestId, reply.usage, kind, maximum);
  return { requestId, ...validated, actualMicros };
}
export async function embeddings(rows) {
  if (!rows.length || rows.length > 128 || rows.some(row => typeof row.content !== 'string' || !row.content.trim() || Buffer.byteLength(row.content, 'utf8') > 8000)) throw new OperatorError('embedding_source_exceeds_reviewed_token_bound');
  if (rows.reduce((sum, row) => sum + Buffer.byteLength(row.content, 'utf8'), 0) > 250_000) throw new OperatorError('embedding_batch_exceeds_reviewed_token_bound');
  return paidRequest({ kind: 'embedding', body: { model: EMBEDDING_MODEL, input: rows.map(row => row.content), dimensions: DIMENSIONS, encoding_format: 'float' }, operationHashes: rows.map(row => fingerprint(`index-v1:${EMBEDDING_MODEL}:${row.id}:${row.content_hash}`)), checkpoint: { kind: 'index', sources: rows.map(({ id, content_hash }) => ({ id, content_hash })) }, validate(reply) {
    const data = reply.data;
    if (!Array.isArray(data) || data.length !== rows.length || data.some((row, index) => row.index !== index || !Array.isArray(row.embedding) || row.embedding.length !== DIMENSIONS || !row.embedding.every(Number.isFinite) || !row.embedding.some(value => value !== 0))) throw new OperatorError('operator_embedding_contract_rejected');
    return { rows: rows.map((row, index) => ({ id: row.id, content_hash: row.content_hash, model: EMBEDDING_MODEL, embedding: data[index].embedding })) };
  } });
}

export async function generateFilm(film, operation, prompt, schema) {
  const body = { model: TEXT_MODEL, input: [{ role: 'user', content: prompt }], text: { format: { type: 'json_schema', name: `film_${operation}`, strict: true, schema } }, max_output_tokens: 512, reasoning: { effort: 'none' }, service_tier: 'default', store: false };
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 22_000) throw new OperatorError('operator_film_input_too_large');
  return paidRequest({ kind: 'text', body, operationHashes: [fingerprint(`film:${operation}:v1:${film.id}:${fingerprint(film)}`)], checkpoint: { kind: 'film', filmId: film.id, operation, source: film }, validate(reply) {
    const parts = (reply.output || []).flatMap(row => row.content || []);
    if (reply.status !== 'completed' || parts.some(part => part.type === 'refusal')) throw new OperatorError('operator_film_refused_or_incomplete');
    let value;
    try { value = JSON.parse(parts.filter(part => part.type === 'output_text').map(part => part.text || '').join('')); } catch { throw new OperatorError('operator_film_contract_rejected'); }
    const key = operation === 'descriptions' ? 'description' : 'category';
    if (!value || Object.keys(value).join(',') !== key || typeof value[key] !== 'string') throw new OperatorError('operator_film_contract_rejected');
    if (operation === 'descriptions' && (value.description.trim().length < 40 || value.description.length > 1600)) throw new OperatorError('operator_film_contract_rejected');
    if (operation !== 'descriptions' && !schema.properties.category.enum.includes(value.category)) throw new OperatorError('operator_film_contract_rejected');
    return { value, update: operation === 'descriptions' ? { description: value.description.trim() } : { categories: [value.category] } };
  } });
}
export async function settleCheckpoint(receipt) {
  if (Number.isSafeInteger(receipt.actualMicros) && receipt.actualMicros >= 0) await rpc('finish_nsso_chat_budget', { p_request_id: receipt.requestId, p_micros: receipt.actualMicros, p_confirmed: true });
}
