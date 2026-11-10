/** Offline proof: replaces all network with explicit fixtures and uses temporary receipts. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { embeddings, generateFilm, fingerprint, readCheckpoints } from './operator-openai.mjs';
import { backfill } from './reembed-openai-index.mjs';
import { maintainFilms } from './operator-film-maintenance.mjs';
import { ingestSources } from './operator-ingestion.mjs';

const originalFetch = globalThis.fetch, originalLog = console.log, originalArgv = [...process.argv];
const checkpointRoot = await mkdtemp(path.join(tmpdir(), 'nsso-openai-operator-proof-'));
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only', OPENAI_API_KEY: 'fixture-only', NSSO_AI_ENABLED: 'true', NSSO_OPENAI_OPERATOR_ENABLED: 'true', NSSO_OPENAI_CHECKPOINT_DIR: checkpointRoot });
delete process.env.OPENAI_BASE_URL;
const source = { id: '11111111-1111-1111-1111-111111111111', content: 'Synthetic source text for migration proof.', metadata: {}, content_hash: 'a'.repeat(32) };
let events, claims, mode, indexed, providerCalls, sourceWrites, currentFilms;
function reset(nextMode = 'success') { events = []; claims = new Set(); mode = nextMode; indexed = false; providerCalls = 0; sourceWrites = 0; currentFilms = []; }
function reply(value, status = 200) { return new Response(value === null ? null : JSON.stringify(value), { status }); }
globalThis.fetch = async (url, options = {}) => {
  const route = String(url), body = options.body ? JSON.parse(options.body) : null;
  if (route.startsWith('https://fixture.supabase.co/rest/v1/')) {
    const action = route.split('/rpc/')[1];
    events.push(action || options.method || 'GET');
    if (action === 'reserve_nsso_chat_budget') return reply({ allowed: mode !== 'budget_denied' });
    if (action === 'claim_nsso_openai_ingestion') {
      assert(events.includes('reserve_nsso_chat_budget'));
      assert(body.p_operation_hashes.every(hash => /^[a-f0-9]{64}$/.test(hash)));
      if (body.p_operation_hashes.some(hash => claims.has(hash))) return reply({ claimed: false });
      body.p_operation_hashes.forEach(hash => claims.add(hash)); return reply({ claimed: true });
    }
    if (action === 'finish_nsso_chat_budget') { assert(Number.isSafeInteger(body.p_micros) && body.p_confirmed); return reply(null); }
    if (action === 'nsso_openai_index_batch') return reply(indexed ? [] : [source]);
    if (action === 'commit_nsso_openai_index_batch') {
      if (mode === 'commit_down') return reply({}, 503);
      assert.equal(body.p_rows[0].content_hash, source.content_hash);
      assert.equal(body.p_rows[0].embedding.length, 1536);
      indexed = true; return reply({ committed: 1 });
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
  if (route.endsWith('/embeddings')) {
    assert.equal(body.model, 'text-embedding-3-small'); assert.equal(body.dimensions, 1536); assert(body.input.length <= 128);
    return reply({ data: body.input.map((text, index) => ({ index, embedding: Array(mode === 'bad_dimensions' ? 768 : 1536).fill(0.01) })), ...(mode === 'missing_usage' ? {} : { usage: { prompt_tokens: 20, total_tokens: 20 } }) });
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
  for (const failure of ['budget_denied', 'timeout', 'auth', 'missing_usage', 'bad_dimensions']) {
    reset(failure);
    await assert.rejects(embeddings([source]), error => error.code.startsWith('operator_'));
    assert.equal(providerCalls, failure === 'budget_denied' ? 0 : 1);
    if (['timeout', 'auth', 'missing_usage'].includes(failure)) assert(!events.includes('finish_nsso_chat_budget'));
    checks++;
  }
  reset(); await assert.rejects(embeddings([{ ...source, content: 'x'.repeat(8001) }])); assert.equal(providerCalls, 0); checks++;
  await assert.rejects(embeddings(Array(129).fill(source))); assert.equal(providerCalls, 0); checks++;
  for (const failure of ['refusal', 'incomplete']) {
    reset(failure);
    await assert.rejects(generateFilm({ id: 'film-fixture' }, 'categories', 'Synthetic classification', { properties: { category: { enum: ['Japanese Anime'] } } }));
    assert.equal(providerCalls, 1); assert(events.includes('finish_nsso_chat_budget')); checks++;
  }
  // Validated vectors survive database failure and resume without a paid replay.
  reset('commit_down'); await assert.rejects(backfill({ apply: true, maxBatches: 1 })); assert.equal(providerCalls, 1);
  mode = 'success'; const resumed = await backfill({ apply: true, maxBatches: 1 }); assert.equal(providerCalls, 1); assert.equal(resumed.rows, 1); checks++;
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
  globalThis.fetch = originalFetch; console.log = originalLog; process.argv = originalArgv;
  await rm(checkpointRoot, { recursive: true, force: true });
}
console.log(`OpenAI operator proof passed: ${checks} offline budget/claim/schema/resume/preservation checks; no real network or database requests.`);
