/** Offline transport proof. No provider request, database write or source data. */
import assert from 'node:assert/strict';
import { database, rpc } from './operator-openai.mjs';

const original = { fetch: globalThis.fetch, timeout: AbortSignal.timeout, timer: globalThis.setTimeout, error: console.error };
const previous = Object.fromEntries(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NSSO_OPENAI_DB_TIMINGS'].map(name => [name, process.env[name]]));
const commitPayload = { p_rows: [{ id: '11111111-1111-4111-8111-111111111111', content_hash: 'a'.repeat(32), embedding: Array(1536).fill(0.123456789) }] };
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'private-diagnostic-fixture', NSSO_OPENAI_DB_TIMINGS: 'true' });
let calls, deadlines, delays, diagnostics;
function reset(handler) {
  calls = 0; deadlines = []; delays = []; diagnostics = [];
  globalThis.fetch = async (...args) => { calls++; return handler(calls, ...args); };
}
let checks = 0;
try {
  AbortSignal.timeout = milliseconds => { deadlines.push(milliseconds); return new AbortController().signal; };
  globalThis.setTimeout = (callback, milliseconds) => { delays.push(milliseconds); return original.timer(callback, 0); };
  console.error = line => diagnostics.push(JSON.parse(line));
  reset(attempt => attempt < 3 ? new Response('{"code":"57014","message":"private SQL text"}', { status: 500 }) : Response.json({ committed: 1 }));
  assert.deepEqual(await rpc('commit_nsso_openai_index_batch', commitPayload), { committed: 1 });
  assert.equal(calls, 3); assert.deepEqual(deadlines, [120000, 120000, 120000]); assert.deepEqual(delays, [2000, 4000]); checks++;
  reset(attempt => attempt === 1 ? { ok: true, status: 200, text: async () => { throw new DOMException('private read failure', 'TimeoutError'); } } : new Response(null));
  assert.equal(await rpc('finish_nsso_chat_budget', { p_request_id: 'private-receipt-id', p_micros: 12, p_confirmed: true }), null);
  assert.equal(calls, 2); assert.deepEqual(deadlines, [60000, 60000]); assert.equal(diagnostics[0].headersMs !== null, true); checks++;
  for (const operation of ['reserve_nsso_chat_budget', 'claim_nsso_openai_ingestion']) {
    reset(() => { throw new DOMException('private uncertain claim', 'TimeoutError'); });
    await assert.rejects(rpc(operation, {}), error => error.code === 'operator_database_unavailable');
    assert.equal(calls, 1); assert.deepEqual(delays, []); assert.deepEqual(deadlines, [15000]); checks++;
  }
  reset(() => new Response('{"code":"42501","message":"private access detail"}', { status: 403 }));
  await assert.rejects(rpc('commit_nsso_openai_index_batch', commitPayload), error => error.code === 'operator_database_request_rejected');
  assert.equal(calls, 1); assert.deepEqual(delays, []); checks++;
  reset(() => { throw new DOMException('private exhausted fixture', 'TimeoutError'); });
  await assert.rejects(rpc('nsso_openai_index_batch', {}), error => error.code === 'operator_database_unavailable');
  assert.equal(calls, 3); assert.deepEqual(deadlines, [30000, 30000, 30000]); assert.deepEqual(delays, [2000, 4000]); checks++;
  reset(() => new Response('private non-JSON body'));
  await assert.rejects(rpc('finish_nsso_chat_budget', {}), error => error.code === 'operator_database_invalid_reply');
  assert.equal(calls, 1); checks++;
  reset(() => Response.json([]));
  await database('agent_knowledge?content=eq.private-query-text', { method: 'GET' });
  const serialized = JSON.stringify(diagnostics);
  assert(!/private|fixture\.supabase|Bearer|embedding|content_hash|apikey|Authorization/.test(serialized));
  assert.equal(diagnostics[0].operation, 'agent_knowledge'); assert.equal(diagnostics[0].outcome, 'ok');
  assert.equal(diagnostics[0].requestBytes, 0); assert.equal(diagnostics[0].responseBytes, 2); checks++;
} finally {
  globalThis.fetch = original.fetch; AbortSignal.timeout = original.timeout; globalThis.setTimeout = original.timer; console.error = original.error;
  for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
}
console.log(`OpenAI database reliability proof passed: ${checks} offline deadline/retry/claim/privacy checks; no real network or database requests.`);
