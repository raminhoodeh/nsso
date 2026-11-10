/** Offline proof: replaces all network with explicit fixtures and uses temporary receipts. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { embeddings, generateFilm, fingerprint, readCheckpoints } from './operator-openai.mjs';
import { backfill } from './reembed-openai-index.mjs';
import { maintainFilms } from './operator-film-maintenance.mjs';
import { ingestSources } from './operator-ingestion.mjs';

const originalFetch = globalThis.fetch, originalLog = console.log, originalArgv = [...process.argv], originalTimer = globalThis.setTimeout;
const checkpointRoot = await mkdtemp(path.join(tmpdir(), 'nsso-openai-operator-proof-'));
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only', OPENAI_API_KEY: 'fixture-only', NSSO_AI_ENABLED: 'true', NSSO_OPENAI_OPERATOR_ENABLED: 'true', NSSO_OPENAI_CHECKPOINT_DIR: checkpointRoot });
delete process.env.OPENAI_BASE_URL;
// Retry policy timings have their own transport proof; these fixtures need no
// real wall-clock delay while exercising the same retry/resume branches.
globalThis.setTimeout = (callback, _milliseconds) => originalTimer(callback, 0);
const source = { id: '11111111-1111-1111-1111-111111111111', content: 'Synthetic source text for migration proof.', metadata: {}, content_hash: 'a'.repeat(32) };
let events, claims, mode, indexed, providerCalls, sourceWrites, currentFilms, held, lastCharge, maximum, commitCalls, lastCursor;
function reset(nextMode = 'success') { events = []; claims = new Set(); mode = nextMode; indexed = false; providerCalls = 0; sourceWrites = 0; currentFilms = []; held = false; lastCharge = 0; maximum = 0; commitCalls = 0; }
function reply(value, status = 200) { return new Response(value === null ? null : JSON.stringify(value), { status }); }
function base64Vector(dimensions = 1536) {
  const bytes = Buffer.alloc(dimensions * 4);
  for (let index = 0; index < dimensions; index++) bytes.writeFloatLE(0.01, index * 4);
  return bytes.toString('base64');
}
globalThis.fetch = async (url, options = {}) => {
  const route = String(url), body = options.body ? JSON.parse(options.body) : null;
  if (route.startsWith('https://fixture.supabase.co/rest/v1/')) {
    const action = route.split('/rpc/')[1];
    events.push(action || options.method || 'GET');
    if (action === 'reserve_nsso_chat_budget') { maximum = body.p_micros; return reply({ allowed: mode !== 'budget_denied' && !held }); }
    if (action === 'hold_nsso_ai_budget') { assert(['provider_access_requires_review', 'usage_bound_exceeded'].includes(body.p_code)); held = true; return reply(null); }
    if (action === 'claim_nsso_openai_ingestion') {
      assert(events.includes('reserve_nsso_chat_budget'));
      assert(body.p_operation_hashes.every(hash => /^[a-f0-9]{64}$/.test(hash)));
      if (body.p_operation_hashes.some(hash => claims.has(hash))) return reply({ claimed: false });
      body.p_operation_hashes.forEach(hash => claims.add(hash)); return reply({ claimed: true });
    }
    if (action === 'finish_nsso_chat_budget') { assert(Number.isSafeInteger(body.p_micros) && body.p_confirmed); lastCharge = body.p_micros; return reply(null); }
    if (action === 'nsso_openai_index_batch') { lastCursor = body.p_after; return reply(indexed ? [] : [source]); }
    if (action === 'commit_nsso_openai_index_batch') {
      commitCalls++;
      if (mode === 'commit_down') return reply({}, 503);
      if (mode === 'commit_zero') return reply({ committed: 0 });
      if (mode === 'commit_partial') return reply({ committed: 1 });
      assert.equal(body.p_rows[0].content_hash, source.content_hash);
      assert.equal(body.p_rows[0].embedding.length, 1536);
      indexed = true;
      if (mode === 'commit_reply_lost' && commitCalls === 1) throw new DOMException('private database response lost after commit', 'TimeoutError');
      return reply({ committed: 1 });
    }
    if (route.includes('razinflix_films?') && (!options.method || options.method === 'GET')) return reply(currentFilms);
    if (route.includes('razinflix_films?') && options.method === 'PATCH') { sourceWrites++; return reply([{ id: 'film-fixture' }]); }
    if (route.includes('agent_knowledge?')) return reply([]);
    if (route.endsWith('/agent_knowledge') && options.method === 'POST') { assert.equal(body.embedding, null); assert(body.content.includes('Synthetic')); sourceWrites++; return reply(null); }
    assert.fail(`Unexpected fixture database request ${action || options.method}`);
  }
  assert(['https://api.openai.com/v1/embeddings', 'https://api.openai.com/v1/responses'].includes(route));
  assert(events.includes('claim_nsso_openai_ingestion') && events.includes('reserve_nsso_chat_budget'));
  events.push('provider'); providerCalls++;
  assert.equal(options.redirect, 'error'); assert(options.signal);
  if (mode === 'timeout') throw new DOMException('private fixture timeout body', 'TimeoutError');
  if (mode === 'auth') return new Response('private upstream HTML', { status: 401 });
  if (mode === 'body_lost') return { ok: true, status: 200, headers: new Headers({ 'x-request-id': 'req_safe_fixture' }), json: async () => { throw new DOMException('private body timeout', 'TimeoutError'); } };
  if (route.endsWith('/embeddings')) {
    assert.equal(body.model, 'text-embedding-3-small'); assert.equal(body.dimensions, 1536); assert.equal(body.encoding_format, 'base64'); assert(body.input.length <= 128);
    return reply({ data: body.input.map((text, index) => ({ index, embedding: base64Vector(mode === 'bad_dimensions' ? 768 : 1536) })), ...(mode === 'missing_usage' ? {} : { usage: { prompt_tokens: mode === 'overspend' ? 1000000 : 20, total_tokens: mode === 'overspend' ? 1000000 : 20 } }) });
  }
  assert.equal(body.model, 'gpt-6-luna'); assert.equal(body.store, false);
  return reply({ status: mode === 'incomplete' ? 'incomplete' : 'completed', usage: { input_tokens: 40, output_tokens: 20 }, output: [{ content: mode === 'refusal' ? [{ type: 'refusal', refusal: 'private refusal' }] : [{ type: 'output_text', text: JSON.stringify({ category: 'Japanese Anime' }) }] }] });
};
let checks = 0;
try {
  console.log = () => {};
  reset(); const embedded = await embeddings([source]);
  assert.equal(embedded.rows[0].embedding.length, 1536); assert.equal(providerCalls, 1); checks++;
  const receipts = await readCheckpoints('index'); assert.equal(receipts.length, 1);
  const receiptPath = path.join(checkpointRoot, `${embedded.requestId}.json`);
  assert.equal((await stat(receiptPath)).mode & 0o777, 0o600); assert.equal(JSON.parse(await readFile(receiptPath, 'utf8')).state, 'generated'); checks++;
  await assert.rejects(embeddings([source]), error => error.code === 'operator_operation_already_claimed_review_required'); assert.equal(providerCalls, 1); checks++;
  await rm(receiptPath);
  for (const failure of ['budget_denied', 'timeout', 'body_lost', 'auth', 'missing_usage', 'bad_dimensions', 'overspend']) {
    reset(failure);
    await assert.rejects(embeddings([source]), error => error.code.startsWith('operator_'));
    assert.equal(providerCalls, failure === 'budget_denied' ? 0 : 1);
    if (['timeout', 'body_lost', 'auth', 'missing_usage'].includes(failure)) assert(!events.includes('finish_nsso_chat_budget'));
    if (failure === 'body_lost') {
      const saved = await Promise.all((await readdir(checkpointRoot)).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(path.join(checkpointRoot, name), 'utf8'))));
      assert(saved.some(value => value.providerRequestId === 'req_safe_fixture' && value.providerStatus === 200 && value.state === 'claimed'));
    }
    if (failure === 'auth' || failure === 'overspend') {
      assert(held); if (failure === 'overspend') assert(lastCharge > maximum);
      await assert.rejects(embeddings([{ ...source, id: '22222222-2222-2222-2222-222222222222' }]));
      assert.equal(providerCalls, 1);
    }
    checks++;
  }
  reset(); await assert.rejects(embeddings([{ ...source, content: 'x'.repeat(8001) }])); assert.equal(providerCalls, 0); checks++;
  reset(); await assert.rejects(backfill({ apply: true, after: 'invalid-cursor' }), error => error.code === 'invalid_backfill_cursor'); assert.equal(events.length, 0); checks++;
  reset(); indexed = true; await backfill({ apply: true, after: source.id }); assert.equal(lastCursor, source.id); assert.equal(providerCalls, 0); checks++;
  await assert.rejects(embeddings(Array(129).fill(source))); assert.equal(providerCalls, 0); checks++;
  for (const failure of ['refusal', 'incomplete']) {
    reset(failure);
    await assert.rejects(generateFilm({ id: 'film-fixture' }, 'categories', 'Synthetic classification', { properties: { category: { enum: ['Japanese Anime'] } } }));
    assert.equal(providerCalls, 1); assert(events.includes('finish_nsso_chat_budget')); checks++;
  }
  // Validated vectors survive database failure and resume without a paid replay.
  reset('commit_down'); await assert.rejects(backfill({ apply: true, maxBatches: 1 })); assert.equal(providerCalls, 1);
  mode = 'success'; const resumed = await backfill({ apply: true, maxBatches: 1 }); assert.equal(providerCalls, 1); assert.equal(resumed.rows, 1); checks++;
  reset('commit_reply_lost'); const recovered = await backfill({ apply: true, maxBatches: 1 });
  assert.equal(recovered.rows, 1); assert.equal(providerCalls, 1); assert.equal(commitCalls, 2); checks++;
  for (const acknowledgement of ['commit_zero', 'commit_partial']) {
    reset(acknowledgement);
    const second = { ...source, id: '33333333-3333-3333-3333-333333333333' };
    const paid = await embeddings([source, second]);
    const { commitReceipt } = await import('./reembed-openai-index.mjs');
    await assert.rejects(commitReceipt(paid), error => error.code === 'operator_index_commit_unconfirmed');
    assert((await readCheckpoints('index')).some(receipt => receipt.requestId === paid.requestId));
    await rm(path.join(checkpointRoot, `${paid.requestId}.json`)); checks++;
  }
  reset(); process.argv = originalArgv.filter(argument => argument !== '--apply');
  await maintainFilms('categories'); await maintainFilms('descriptions'); await maintainFilms('cleanup');
  assert.equal(events.length, 0); assert.equal(providerCalls, 0); assert.equal(sourceWrites, 0); checks++;
  reset(); process.argv = [...originalArgv, '--apply'];
  currentFilms = [{ id: 'new-film', categories: ['New'] }, { id: 'anime', categories: ['Japanese Anime'] }];
  for (const operation of ['categories', 'descriptions', 'cleanup']) { await maintainFilms(operation); assert.equal(providerCalls, 0); assert.equal(sourceWrites, 0); checks++; }
  reset(); const sources = await mkdtemp(path.join(tmpdir(), 'nsso-openai-sources-'));
  process.env.NSSO_CONTEXT_DIR = sources;
  await writeFile(path.join(sources, 'fixture.csv'), 'Title,Description\nSynthetic film,Synthetic evidence\n');
  process.argv = originalArgv; await ingestSources(); assert.equal(sourceWrites, 0); assert.equal(providerCalls, 0); checks++;
  process.argv = [...originalArgv, '--apply']; await ingestSources(); assert.equal(sourceWrites, 1); assert.equal(providerCalls, 0); checks++;
  await rm(sources, { recursive: true });
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 })); checks++;
  for (const file of ['ingest-context.ts', 'ingest-database.ts', 'ingest-films.ts', 'clear-and-reingest.ts', 'enrich-categories.ts', 'enrich-descriptions.ts', 'cleanup-categories.mjs']) {
    const text = await readFile(new URL(file, import.meta.url), 'utf8');
    assert(!/GoogleGenerativeAI|generativelanguage\.googleapis|GEMINI_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY|\.delete\(/.test(text));
  } checks++;
} finally {
  globalThis.fetch = originalFetch; console.log = originalLog; process.argv = originalArgv; globalThis.setTimeout = originalTimer;
  await rm(checkpointRoot, { recursive: true, force: true });
}
process.stdout.write(execFileSync(process.execPath, [new URL('./check-openai-index-codec.mjs', import.meta.url).pathname], { encoding: 'utf8', timeout: 10000 }));
process.stdout.write(execFileSync(process.execPath, [new URL('./check-openai-index-chunks.mjs', import.meta.url).pathname], { encoding: 'utf8', timeout: 10000 }));
console.log(`OpenAI operator proof passed: ${checks} offline budget/claim/schema/resume/preservation checks; no real network or database requests.`);
