/** Offline paid-receipt recovery proof. All HTTP is mocked; only temp fixtures are written. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const checkpointRoot = await mkdtemp(path.join(tmpdir(), 'nsso-index-chunk-proof-'));
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only', OPENAI_API_KEY: 'fixture-only', NSSO_AI_ENABLED: 'true', NSSO_OPENAI_OPERATOR_ENABLED: 'true', NSSO_OPENAI_CHECKPOINT_DIR: checkpointRoot });
delete process.env.OPENAI_BASE_URL; delete process.env.NSSO_OPENAI_DB_TIMINGS;
const original = { fetch: globalThis.fetch, log: console.log, timer: globalThis.setTimeout };
const sourceRows = Array.from({ length: 128 }, (_, index) => ({ id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`, content: 'Synthetic chunk recovery source.', content_hash: 'a'.repeat(32) }));
const vectorBytes = Buffer.alloc(6144);
for (let index = 0; index < 1536; index++) vectorBytes.writeFloatLE(0.01, index * 4);
const encodedVector = vectorBytes.toString('base64');
let mode, providerCalls, finishCalls, reserveCalls, claimCalls, commitBodies, indexed, charges, receiptId, expectedRows;
async function reset(next = 'success', rows = 128) {
  mode = next; expectedRows = rows; providerCalls = finishCalls = reserveCalls = claimCalls = 0; commitBodies = []; indexed = new Set(); charges = new Map(); receiptId = null;
  await rm(checkpointRoot, { recursive: true }); await mkdir(checkpointRoot, { mode: 0o700 });
}
const reply = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status });
globalThis.setTimeout = (callback, _milliseconds) => original.timer(callback, 0);
globalThis.fetch = async (url, options) => {
  const route = String(url), body = JSON.parse(options.body);
  if (route === 'https://api.openai.com/v1/embeddings') {
    providerCalls++; assert.equal(providerCalls, 1, 'The paid operation must never replay');
    assert.equal(body.input.length, expectedRows); assert.equal(body.encoding_format, 'base64');
    return reply({ data: body.input.map((_, index) => ({ index, embedding: encodedVector })), usage: { prompt_tokens: 20 } });
  }
  assert(route.startsWith('https://fixture.supabase.co/rest/v1/rpc/'), 'Unexpected network destination');
  const action = route.split('/rpc/')[1];
  if (action === 'reserve_nsso_chat_budget') { reserveCalls++; charges.set(body.p_request_id, { settled: false, amount: body.p_micros, settlements: 0 }); return reply({ allowed: true }); }
  if (action === 'claim_nsso_openai_ingestion') { claimCalls++; assert.equal(body.p_operation_hashes.length, expectedRows); return reply({ claimed: true }); }
  if (action === 'finish_nsso_chat_budget') {
    finishCalls++; const charge = charges.get(body.p_request_id); assert(charge); assert.equal(body.p_confirmed, true);
    if (!charge.settled) { charge.settled = true; charge.amount = body.p_micros; charge.settlements++; }
    else assert.equal(body.p_micros, charge.amount, 'Recovery must settle the identical paid receipt');
    return reply(null);
  }
  if (action === 'nsso_openai_index_batch') { assert.equal(indexed.size, expectedRows, 'Recovery must finish the full receipt before selecting new work'); return reply([]); }
  if (action === 'commit_nsso_openai_index_batch') {
    assert(body.p_rows.length >= 1 && body.p_rows.length <= 32 && body.p_rows.length <= 128, 'Each transaction must respect both bounds');
    const saved = JSON.parse(await readFile(path.join(checkpointRoot, `${receiptId}.json`), 'utf8'));
    assert.equal(saved.state, 'generated'); assert.equal(saved.rows.length, expectedRows, 'Never replace a generated receipt with a partial checkpoint');
    commitBodies.push(body.p_rows);
    if (mode === 'fail_after_two' && commitBodies.length >= 3) return reply({ code: '57014' }, 500);
    if (mode === 'zero_after_two' && commitBodies.length === 3) return reply({ committed: 0 });
    if (mode === 'partial_after_two' && commitBodies.length === 3) return reply({ committed: body.p_rows.length - 1 });
    body.p_rows.forEach(row => { assert.equal(row.embedding.length, 1536); assert.equal(row.content_hash, 'a'.repeat(32)); indexed.add(row.id); });
    return reply({ committed: body.p_rows.length });
  }
  assert.fail('Unexpected fixture RPC');
};
console.log = () => {};
const { embeddings, readCheckpoints } = await import('./operator-openai.mjs');
const { backfill, commitReceipt } = await import('./reembed-openai-index.mjs');
let checks = 0;
try {
  await reset();
  const fresh = await embeddings(sourceRows); receiptId = fresh.requestId;
  assert.equal(await commitReceipt(fresh), 128);
  assert.deepEqual(commitBodies.map(rows => rows.length), [32, 32, 32, 32]);
  assert.deepEqual(commitBodies.flat().map(row => row.id), sourceRows.map(row => row.id));
  assert.equal(finishCalls, 1, 'Fresh receipt settlement must happen once, outside the chunk loop');
  assert.equal(charges.get(receiptId).settlements, 1); assert.equal((await readCheckpoints('index')).length, 0); checks++;

  await reset('success', 16);
  const small = await embeddings(sourceRows.slice(0, 16)); receiptId = small.requestId;
  assert.equal(await commitReceipt(small), 16); assert.deepEqual(commitBodies.map(rows => rows.length), [16]);
  assert.equal(providerCalls, 1); assert.equal(finishCalls, 1); checks++;

  for (const failure of ['fail_after_two', 'zero_after_two', 'partial_after_two']) {
    await reset(failure);
    const paid = await embeddings(sourceRows); receiptId = paid.requestId;
    const receiptPath = path.join(checkpointRoot, `${receiptId}.json`), before = await readFile(receiptPath);
    const unknownPath = path.join(checkpointRoot, '99999999-9999-4999-8999-999999999999.json');
    const unknown = JSON.stringify({ requestId: '99999999-9999-4999-8999-999999999999', kind: 'index', state: 'claimed', maximumMicros: 881, operationHashes: Array(128).fill('b'.repeat(64)) });
    await writeFile(unknownPath, unknown, { mode: 0o600 });
    await assert.rejects(commitReceipt(paid), error => error.code === (failure === 'fail_after_two' ? 'operator_database_request_rejected' : 'operator_index_commit_unconfirmed'));
    assert.equal(indexed.size, 64); assert.equal(finishCalls, 1);
    assert.deepEqual(await readFile(receiptPath), before, 'Partial failure must preserve the full generated receipt byte for byte');
    const pending = await readCheckpoints('index'); assert.equal(pending.length, 1); assert.equal(pending[0].rows.length, 128); checks++;
    const priorCommits = commitBodies.length;
    mode = 'success';
    assert.deepEqual(await backfill({ apply: true, maxBatches: 1 }), { rows: 128, batches: 0 });
    assert.deepEqual(commitBodies.slice(priorCommits).map(rows => rows.length), [32, 32, 32, 32]);
    assert.deepEqual(commitBodies.slice(priorCommits).flat().map(row => row.id), sourceRows.map(row => row.id));
    assert.equal(indexed.size, 128); assert.equal(providerCalls, 1); assert.equal(reserveCalls, 1); assert.equal(claimCalls, 1);
    assert.equal(finishCalls, 2, 'Disk recovery must settle idempotently once, not once per chunk');
    assert.equal(charges.get(receiptId).settlements, 1); assert.equal(charges.get(receiptId).amount, 1);
    assert.equal((await readCheckpoints('index')).length, 0);
    assert.equal(await readFile(unknownPath, 'utf8'), unknown, 'Uncertain claimed operations must remain untouched'); checks++;
  }
  const beforeInvalid = { finishCalls, commits: commitBodies.length };
  for (const rows of [[], Array(129).fill(sourceRows[0]), [...sourceRows.slice(0, 127), sourceRows[0]]]) {
    await assert.rejects(commitReceipt({ requestId: receiptId, actualMicros: 1, rows }), error => error.code === 'operator_index_receipt_contract_rejected');
    assert.deepEqual({ finishCalls, commits: commitBodies.length }, beforeInvalid); checks++;
  }
} finally {
  globalThis.fetch = original.fetch; console.log = original.log; globalThis.setTimeout = original.timer;
  await rm(checkpointRoot, { recursive: true, force: true });
}
console.log(JSON.stringify({ checks, maximumCommitRows: 32, providerReplayCalls: 0, realNetworkRequests: 0, realDatabaseWrites: 0, realProviderCalls: 0 }));
