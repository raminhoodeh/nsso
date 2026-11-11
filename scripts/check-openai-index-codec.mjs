/** Offline codec/recovery proof: every HTTP request is mocked; receipts are synthetic. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { decodeBase64Embedding, float32Decimal, encodeIndexCommit } from './openai-index-wire.mjs';
const checkpointRoot = await mkdtemp(path.join(tmpdir(), 'nsso-index-optimization-proof-'));
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only', OPENAI_API_KEY: 'fixture-only', NSSO_AI_ENABLED: 'true', NSSO_OPENAI_OPERATOR_ENABLED: 'true', NSSO_OPENAI_CHECKPOINT_DIR: checkpointRoot });
delete process.env.OPENAI_BASE_URL; delete process.env.NSSO_OPENAI_DB_TIMINGS;
const original = { fetch: globalThis.fetch, log: console.log, timer: globalThis.setTimeout, timeout: AbortSignal.timeout };
const source = { id: '11111111-1111-4111-8111-111111111111', content: 'Synthetic index source.', content_hash: 'a'.repeat(32) };
const sourceRows = [source, { ...source, id: '22222222-2222-4222-8222-222222222222' }];
let mode, providerCalls, finishCalls, commitCalls, reserveCalls, claimCalls, indexed, reservations, lastOrdinaryBody, operationClaims, deadlines;
function base64Vector(values = Array(1536).fill(0.01)) {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return bytes.toString('base64');
}
async function reset(next) {
  mode = next; providerCalls = finishCalls = commitCalls = reserveCalls = claimCalls = 0; indexed = false; reservations = new Map();
  operationClaims = new Set(); deadlines = [];
  await rm(checkpointRoot, { recursive: true }); await mkdir(checkpointRoot, { mode: 0o700 });
}
const response = (value, status = 200) => new Response(value === null ? null : JSON.stringify(value), { status });
globalThis.fetch = async (url, options) => {
  const route = String(url); const body = JSON.parse(options.body);
  if (route === 'https://api.openai.com/v1/embeddings') {
    providerCalls++; assert.equal(providerCalls, 1, 'A paid operation was replayed');
    assert.equal(reserveCalls, 1); assert.equal(claimCalls, 1);
    assert.equal(body.encoding_format, 'base64'); assert.equal(body.dimensions, 1536); assert.equal(deadlines.at(-1), 120000);
    if (mode === 'body_lost') return { ok: true, status: 200, headers: new Headers({ 'x-request-id': 'req_codec_fixture' }), json: async () => { throw new DOMException('Synthetic body timeout', 'TimeoutError'); } };
    const data = body.input.map((_, index) => ({ index, embedding: base64Vector() }));
    if (mode === 'truncated') data[0].embedding = data[0].embedding.slice(0, -1);
    if (mode === 'oversized') data[0].embedding += 'AAAA';
    if (mode === 'padding') data[0].embedding = data[0].embedding.slice(0, -1) + '=';
    if (mode === 'whitespace') data[0].embedding = '\n' + data[0].embedding.slice(1);
    if (mode === 'url_safe') data[0].embedding = '_' + data[0].embedding.slice(1);
    if (mode === 'float_array') data[0].embedding = Array(1536).fill(0.01);
    if (mode === 'nan' || mode === 'infinity') data[0].embedding = base64Vector([mode === 'nan' ? NaN : Infinity, ...Array(1535).fill(0.01)]);
    if (mode === 'zero') data[0].embedding = base64Vector(Array(1536).fill(0));
    if (mode === 'bad_index') data[0].index = 4;
    if (mode === 'duplicate_index') data[1].index = 0;
    if (mode === 'missing_row') data.pop();
    if (mode === 'null_row') data[0] = null;
    return response({ data, usage: { prompt_tokens: 20 } });
  }
  assert(route.startsWith('https://fixture.supabase.co/rest/v1/'), 'Unmocked HTTP destination');
  const action = route.split('/rpc/')[1];
  if (action === 'reserve_nsso_chat_budget') { reserveCalls++; reservations.set(body.p_request_id, { charge: body.p_micros, settled: false }); return response({ allowed: true }); }
  if (action === 'claim_nsso_openai_ingestion') {
    claimCalls++;
    const expected = createHash('sha256').update(`index-v1:text-embedding-3-small:${source.id}:${source.content_hash}`).digest('hex');
    assert.equal(body.p_operation_hashes[0], expected, 'Transport must not change terminal operation identity');
    if (body.p_operation_hashes.some(hash => operationClaims.has(hash))) return response({ claimed: false });
    body.p_operation_hashes.forEach(hash => operationClaims.add(hash)); return response({ claimed: true });
  }
  if (action === 'finish_nsso_chat_budget') {
    finishCalls++; const r = reservations.get(body.p_request_id); assert(r); assert(body.p_confirmed);
    if (mode === 'settle_down') return response({}, 503);
    if (!r.settled) { r.charge = body.p_micros; r.settled = true; }
    if (mode === 'settle_ack_lost') throw new DOMException('Synthetic lost settlement acknowledgement', 'TimeoutError');
    return response(null);
  }
  if (action === 'nsso_openai_index_batch') return response(indexed ? [] : sourceRows);
  if (action === 'commit_nsso_openai_index_batch') {
    commitCalls++; assert.equal(body.p_rows.length, 2);
    for (const row of body.p_rows) { assert.equal(row.embedding.length, 1536); for (const value of row.embedding) assert.equal(Math.fround(value), Math.fround(0.01)); }
    if (mode === 'commit_down') return response({}, 503);
    if (mode === 'commit_zero') return response({ committed: 0 });
    if (mode === 'commit_partial') return response({ committed: 1 });
    indexed = true;
    if (mode === 'commit_ack_lost') throw new DOMException('Synthetic lost commit acknowledgement', 'TimeoutError');
    return response({ committed: 2 });
  }
  if (route.endsWith('/ordinary_fixture')) { lastOrdinaryBody = options.body; return response(null); }
  assert.fail('Unexpected fixture route');
};
globalThis.setTimeout = (fn, _delay) => original.timer(fn, 0);
AbortSignal.timeout = milliseconds => { deadlines.push(milliseconds); return new AbortController().signal; };
console.log = () => {};
const { embeddings, readCheckpoints, settleCheckpoint, database } = await import('./operator-openai.mjs');
const { backfill, commitReceipt } = await import('./reembed-openai-index.mjs');
let checks = 0, bitChecks = 0, base64BitChecks = 0;
try {
  await reset('success');
  assert.deepEqual(await backfill({ apply: true, maxBatches: 1 }), { rows: 2, batches: 1 });
  assert.equal(finishCalls, 1, 'Fresh confirmed receipt should settle once'); assert.equal(providerCalls, 1); assert.equal(commitCalls, 1);
  assert.equal((await readCheckpoints('index')).length, 0); checks++;
  for (const malformed of ['truncated', 'oversized', 'padding', 'whitespace', 'url_safe', 'float_array', 'nan', 'infinity', 'zero', 'bad_index', 'duplicate_index', 'missing_row', 'null_row']) {
    await reset(malformed);
    await assert.rejects(embeddings(sourceRows), error => error.code === 'operator_embedding_contract_rejected');
    assert.equal(providerCalls, 1); assert.equal(finishCalls, 1); assert.equal((await readCheckpoints('index')).length, 0);
    await assert.rejects(embeddings(sourceRows), error => error.code === 'operator_operation_already_claimed_review_required');
    assert.equal(providerCalls, 1); assert.equal([...reservations.values()][0].charge, 1); checks++;
  }
  await reset('body_lost');
  await assert.rejects(embeddings(sourceRows), error => error.code === 'operator_unknown_reply_maximum_retained');
  const unknown = [...reservations.values()][0]; const retainedMaximum = unknown.charge;
  assert(!unknown.settled && retainedMaximum > 1); assert.equal(finishCalls, 0);
  await assert.rejects(embeddings(sourceRows), error => error.code === 'operator_operation_already_claimed_review_required');
  assert.equal(providerCalls, 1); assert(!unknown.settled && unknown.charge === retainedMaximum); checks++;
  for (const failure of ['settle_down', 'settle_ack_lost', 'commit_down', 'commit_ack_lost', 'commit_zero', 'commit_partial']) {
    await reset(failure);
    await assert.rejects(backfill({ apply: true, maxBatches: 1 }));
    const pending = await readCheckpoints('index'); assert.equal(pending.length, 1); assert.equal(pending[0].rows.length, 2);
    assert.equal(providerCalls, 1); assert.equal(reserveCalls, 1); assert.equal(claimCalls, 1);
    const beforeFinish = finishCalls;
    mode = 'success';
    assert.equal((await backfill({ apply: true, maxBatches: 1 })).rows, 2);
    assert.equal(finishCalls, beforeFinish + 1, 'Restored receipt must always settle idempotently');
    assert.equal(providerCalls, 1); assert.equal(reserveCalls, 1); assert.equal(claimCalls, 1);
    assert.equal((await readCheckpoints('index')).length, 0);
    assert.equal([...reservations.values()][0].charge, 1); checks++;
  }
  await reset('success');
  const fresh = await embeddings(sourceRows);
  const [numericCheckpoint] = await readCheckpoints('index');
  assert(Array.isArray(numericCheckpoint.rows[0].embedding)); assert.equal(numericCheckpoint.rows[0].embedding.length, 1536);
  assert(numericCheckpoint.rows[0].embedding.every(value => typeof value === 'number' && Number.isFinite(value))); checks++;
  const clone = JSON.parse(JSON.stringify(fresh)); clone.settled = true;
  await commitReceipt(clone); assert.equal(finishCalls, 2, 'Clones and forged flags cannot bypass settlement'); checks++;
  await reset('success');
  const changed = await embeddings(sourceRows); changed.actualMicros++;
  await settleCheckpoint(changed); assert.equal(finishCalls, 2, 'Changed financial fields invalidate marker'); checks++;
  await reset('success');
  const disk = await embeddings(sourceRows);
  const file = path.join(checkpointRoot, `${disk.requestId}.json`);
  const stored = JSON.parse(await readFile(file, 'utf8')); stored.settled = true;
  assert(!JSON.stringify(stored).includes('acknowledgedSettlements'));
  await writeFile(file, JSON.stringify(stored));
  const [restored] = await readCheckpoints('index'); await commitReceipt(restored);
  assert.equal(finishCalls, 2, 'Persisted flags cannot bypass settlement'); checks++;
  await reset('success');
  const oldRequest = '33333333-3333-4333-8333-333333333333';
  reservations.set(oldRequest, { charge: 42, settled: false });
  await writeFile(path.join(checkpointRoot, `${oldRequest}.json`), JSON.stringify({ requestId: oldRequest, kind: 'index', state: 'generated', actualMicros: 1,
    rows: sourceRows.map(row => ({ id: row.id, content_hash: row.content_hash, model: 'text-embedding-3-small', embedding: Array(1536).fill(0.01) })) }));
  assert.equal((await backfill({ apply: true, maxBatches: 1 })).rows, 2);
  assert.equal(providerCalls, 0); assert.equal(reserveCalls, 0); assert.equal(claimCalls, 0); assert.equal(finishCalls, 1); checks++;
  const ordinary = { embedding: [0.12345678901234566] };
  await database('ordinary_fixture', { method: 'POST', body: ordinary }); assert.equal(lastOrdinaryBody, JSON.stringify(ordinary)); checks++;
  const view = new DataView(new ArrayBuffer(4));
  const asBits = value => { view.setFloat32(0, value); return view.getUint32(0); };
  const codecWords = [];
  const check = word => { view.setUint32(0, word); const value = view.getFloat32(0); if (!Number.isFinite(value)) return; assert.equal(asBits(JSON.parse(float32Decimal(value))), word >>> 0); codecWords.push(word >>> 0); bitChecks++; };
  for (const sign of [0, 0x80000000]) for (let exponent = 0; exponent <= 254; exponent++) for (const mantissa of [0, 1, 2, 3, 0x3ffffe, 0x3fffff, 0x400000, 0x400001, 0x7ffffc, 0x7ffffd, 0x7ffffe, 0x7fffff]) check((sign | (exponent << 23) | mantissa) >>> 0);
  let random = 0xa9b1e7f3;
  for (let i = 0; i < 2_000_000; i++) { random ^= random << 13; random ^= random >>> 17; random ^= random << 5; check(random >>> 0); } checks++;
  for (let offset = 0; offset < codecWords.length; offset += 1536) {
    const words = codecWords.slice(offset, offset + 1536); const bytes = Buffer.alloc(6144);
    words.forEach((word, index) => bytes.writeUInt32LE(word, index * 4));
    const decoded = decodeBase64Embedding(bytes.toString('base64'));
    for (let index = 0; index < words.length; index++) { assert.equal(asBits(decoded[index]), words[index]); base64BitChecks++; }
  } checks++;
  for (const value of [NaN, Infinity, -Infinity, Number.MAX_VALUE, -Number.MAX_VALUE, 1e-300, -1e-300, '0.2']) assert.throws(() => float32Decimal(value)); checks++;
  const adversarial = { id: 'quoted"\\id', content_hash: 'escaped\\"hash', embedding: Array.from({ length: 1536 }, (_, i) => i === 0 ? -0 : i === 1 ? Math.fround(1.401298464324817e-45) : Math.fround(0.01)) };
  const roundtrip = JSON.parse(encodeIndexCommit({ p_rows: [adversarial] })).p_rows[0];
  assert.equal(roundtrip.id, adversarial.id); assert.equal(roundtrip.content_hash, adversarial.content_hash);
  for (let i = 0; i < 1536; i++) assert.equal(asBits(roundtrip.embedding[i]), asBits(adversarial.embedding[i])); checks++;
  for (const body of [{ p_rows: [] }, { p_rows: Array(129).fill(adversarial) }, { p_rows: [{ ...adversarial, embedding: [1] }] }, { p_rows: [{ ...adversarial, embedding: new Array(1536) }] }, { p_rows: new Array(1) }, { p_rows: [adversarial], extra: 'unused' }]) assert.throws(() => encodeIndexCommit(body)); checks++;
} finally {
  globalThis.fetch = original.fetch; globalThis.setTimeout = original.timer; AbortSignal.timeout = original.timeout; console.log = original.log;
  await rm(checkpointRoot, { recursive: true, force: true });
}
console.log(JSON.stringify({ checks, float32WireBitRoundTrips: bitChecks, base64Float32BitRoundTrips: base64BitChecks, realNetworkRequests: 0, realDatabaseWrites: 0, realProviderCalls: 0 }));
