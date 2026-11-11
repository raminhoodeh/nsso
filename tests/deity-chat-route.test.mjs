import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../src/', import.meta.url);
const previousEnv = { ...process.env };
Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: 'https://chat-test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-not-a-real-service-key',
  OPENAI_API_KEY: 'test-only-not-a-real-openai-key', NSSO_AI_ENABLED: 'true',
  NSSO_CHAT_IP_HASH_SECRET: 'test-only-hmac-secret-longer-than-32-characters', VERCEL: '1',
});
const hooks = registerHooks({ resolve(specifier, context, next) {
  // Route behavior is isolated here; guarded dispatch and accounting are tested independently.
  if (specifier === '@/lib/server/runtime-route') return {url:'data:text/javascript,export const withRuntimeGuard = handler => handler;',shortCircuit:true};
  if (specifier === 'server-only') return {url:'data:text/javascript,export {};',shortCircuit:true};
  if (specifier === 'next/server') return next('next/server.js',context);
  if (specifier.startsWith('@/')) return next(new URL(`${specifier.slice(2)}.ts`, source).href, context);
  if (specifier.startsWith('.') && context.parentURL?.startsWith(source.href)) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return next(url.href, context);
  }
  return next(specifier, context);
} });
const { POST } = await import(new URL('app/api/deity/chat/route.ts', source));
const { NSSO_PRODUCT_CONTEXT, isNssoProductQuestion } = await import(new URL('lib/deity/product-context.ts', source));
const { chatFailureDetails } = await import(new URL('lib/deity/chat-diagnostics.ts', source));
const { boundedChatHistory } = await import(new URL('lib/deity/chat-allowance.ts', source));
const { detectCategory, detectResourceFiles } = await import(new URL('lib/deity/contextManager.ts', source));
const { startChatWithRecovery } = await import(new URL('lib/deity/chat-recovery.ts', source));
const { splitActionPayload, parseActionList } = await import(new URL('lib/deity/actionParser.ts', source));
hooks.deregister();

const realFetch = globalThis.fetch;
let mode;
let calls;
let providerAborted;
const privateText = 'AQ.SHOULD_NEVER_LEAK_or_log_private_prompt';
const fixtureOwnerId = '11111111-1111-4111-8111-111111111111';
const fixtureLinkId = '22222222-2222-4222-8222-222222222222';
const invalidProposalMessage = 'Deity could not prepare a valid profile change. Nothing was changed. Please try again.';
beforeEach(() => {
  mode = 'success'; calls = []; providerAborted = false;
  globalThis.fetch = async (url, init) => {
    const parsedUrl = new URL(String(url));
    const path = parsedUrl.pathname;
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, body, query: Object.fromEntries(parsedUrl.searchParams), method: init?.method || 'GET' });
    if (path.endsWith('/reserve_nsso_chat_budget')) return Response.json(mode === 'quota'
      ? { allowed: false, code: 'daily_ip_allowance_exhausted' } : { allowed: true });
    if (path.endsWith('/finish_nsso_chat_budget')) return Response.json(null);
    if (path.endsWith('/hold_nsso_ai_budget')) return Response.json(null);
    if (path === '/auth/v1/user') {
      if (mode === 'auth_unavailable') return Response.json({ code: 'unexpected_failure', msg: privateText }, { status: 503 });
      if (mode === 'auth_invalid') return Response.json({ code: 'bad_jwt', msg: privateText }, { status: 401 });
      if (mode === 'auth_transport_failure') throw new TypeError(privateText);
      return Response.json({ id: fixtureOwnerId, aud: 'authenticated', role: 'authenticated' });
    }
    if (path.endsWith('/get_agent_context')) {
      if (mode === 'context_unavailable') return Response.json({ code: 'fixture', message: privateText }, { status: 503 });
      if (mode === 'context_missing') return Response.json(null);
      if (mode === 'context_malformed') return Response.json({ profile: [] });
      // Production's legacy RPC contains names/URLs but NO link IDs.
      return Response.json({ profile: { full_name: 'Fixture Creator', headline: 'Fixture headline', bio: 'Fixture biography' }, links: [{ link_name: 'Legacy link label', link_url: 'https://legacy.example.test/' }] });
    }
    if (path === '/rest/v1/links') {
      assert.equal(parsedUrl.searchParams.get('select'), 'id,user_id,link_name,link_url');
      assert.equal(parsedUrl.searchParams.get('user_id'), `eq.${fixtureOwnerId}`);
      assert.equal(parsedUrl.searchParams.get('limit'), '501');
      assert.equal(parsedUrl.searchParams.get('order'), 'display_order.asc,id.asc');
      assert.equal(init?.method || 'GET', 'GET');
      const row = { id: fixtureLinkId, user_id: fixtureOwnerId, link_name: 'Canonical fixture link', link_url: 'https://example.test/' };
      if (mode === 'links_unavailable') return Response.json({ code: 'fixture', message: privateText }, { status: 503 });
      if (mode === 'links_missing') return Response.json(null);
      if (mode === 'links_malformed') return Response.json(row);
      if (mode === 'links_empty') return Response.json([]);
      if (mode === 'links_wrong_owner') return Response.json([{ ...row, user_id: fixtureLinkId }]);
      if (mode === 'links_missing_owner') return Response.json([{ id: row.id, link_name: row.link_name, link_url: row.link_url }]);
      if (mode === 'links_missing_id') return Response.json([{ user_id: row.user_id, link_name: row.link_name, link_url: row.link_url }]);
      if (mode === 'links_invalid_id') return Response.json([{ ...row, id: privateText }]);
      if (mode === 'links_legacy_url') return Response.json([{ ...row, link_url: 'legacy-invalid-url' }]);
      if (mode === 'links_nullable_fields') return Response.json([{ ...row, link_name: null, link_url: null }]);
      if (mode === 'links_blank_fields') return Response.json([{ ...row, link_name: '', link_url: '' }]);
      if (mode === 'links_invalid_url') return Response.json([{ ...row, link_url: 123 }]);
      if (mode === 'links_invalid_name') return Response.json([{ ...row, link_name: [] }]);
      if (mode === 'links_oversized_url') return Response.json([{ ...row, link_url: 'x'.repeat(4097) }]);
      if (mode === 'links_oversized_name') return Response.json([{ ...row, link_name: 'x'.repeat(301) }]);
      if (mode === 'links_duplicate_ids') return Response.json([row, row]);
      if (mode === 'links_too_many') return Response.json(Array.from({ length: 501 }, () => row));
      return Response.json([row]);
    }
    if (path.endsWith('/intelligent_search_openai_v1') && mode === 'retrieval_error') return Response.json({code:'57014'}, {status:500});
    if (path.endsWith('/intelligent_search_openai_v1') && mode === 'fallback_error') return body.filter_files ? Response.json([]) : Response.json({code:'57014'}, {status:500});
    if (path.endsWith('/intelligent_search_openai_v1') && mode === 'empty_scoped' && body.filter_files) return Response.json([]);
    if (path.endsWith('/intelligent_search_openai_v1') && mode === 'accelerator') return Response.json([{content:'Acme Accelerator: https://acme.example.test/ Mentorship for early stage SaaS founders.',metadata:{source:'ACCELERATORS.csv'},similarity:0.48,combined_score:0.33}]);
    if (path.endsWith('/intelligent_search_openai_v1')) return Response.json([{ content: 'Network School is in Malaysia.', metadata: { source: 'unrelated.csv', url: 'https://fixtures.example.test/books' } }]);
    if (path.endsWith('/v1/embeddings')) {
      if (mode === 'profile_embedding_auth' && calls.filter(call => call.path.endsWith('/v1/embeddings')).length === 2) return Response.json({ error: { message: privateText } }, { status: 401 });
      if (['profile_embedding_billing', 'profile_embedding_rate_limit'].includes(mode) && calls.filter(call => call.path.endsWith('/v1/embeddings')).length === 2) return Response.json({ error: { code: mode === 'profile_embedding_billing' ? 'project_spend_limit_exceeded' : 'slow_down', message: privateText } }, { status: 429 });
      return Response.json({ data: [{ embedding: Array(1536).fill(0.01) }] });
    }
        if (path.endsWith('/v1/responses')) {
      if (mode === 'stream_billing') return new Response([
        { type: 'response.output_text.delta', delta: 'Partial fixture response.' },
        { type: 'error', code: 'credit_balance_exhausted', message: privateText },
      ].map(value => `data: ${JSON.stringify(value)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
      if (mode === 'pending_headers') return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => { providerAborted = true; reject(new DOMException('Fixture cancelled', 'AbortError')); }, { once: true });
      });
      if (mode === 'hanging_stream') {
        return new Response(new ReadableStream({ start(controller) {
          init.signal.addEventListener('abort', () => { providerAborted = true; controller.error(new DOMException('Fixture cancelled', 'AbortError')); }, { once: true });
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Partial fixture response' })}\n\n`));
        } }), { headers: { 'content-type': 'text/event-stream' } });
      }
      if (mode === 'retired') return Response.json({ error: { code: 404, message: `Model retired ${privateText}` } }, { status: 404 });
      if (mode === 'always_busy' || (mode === 'busy_once' && calls.filter(c => c.path.endsWith('/v1/responses')).length === 1)) {
        return Response.json({ error: { code: 503, message: `Busy ${privateText}` } }, { status: 503 });
      }
      const validTool = { functionCall: { name: 'update_link', args: { linkId: fixtureLinkId, name: 'Fixture renamed link' } } };
      const invalidTool = { functionCall: { name: 'update_link', args: { linkId: privateText, name: privateText } } };
      const parts = mode === 'empty' ? []
        : mode === 'tool_with_tip' ? [{ text: "I don't have extra context, but I can prepare that link change." }, validTool]
        : mode === 'tool_only' ? [validTool]
        : mode === 'invalid_tool_only' ? [invalidTool]
        : mode === 'unknown_tool_only' ? [{ functionCall: { name: privateText, args: { value: privateText } } }]
        : mode === 'mixed_tools' ? [validTool, invalidTool]
        : mode === 'tool_broken_stream' ? [{ text: 'A partial fixture response.' }, validTool]
        : [{ text: 'NSSO stands for new sovereign self online.' }];
      const events = parts.flatMap(part => part.text ? [{ type: 'response.output_text.delta', delta: part.text }]
        : [{ type: 'response.output_item.added', item: { id: 'call-item', type: 'function_call', name: part.functionCall.name } },
          { type: 'response.function_call_arguments.done', item_id: 'call-item', arguments: JSON.stringify(part.functionCall.args) }]);
      const broken = ['broken_stream', 'tool_broken_stream'].includes(mode);
      if (!broken) events.push({ type: 'response.completed', response: { usage: { input_tokens: 500, output_tokens: 20 } } });
      const wire = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + (broken ? 'data: {broken JSON}\n\n' : '');
      return new Response(wire, { headers: { 'content-type': 'text/event-stream' } });
    }
    throw new Error(`Unexpected test network call: ${path}`);
  };
});
after(() => { globalThis.fetch = realFetch; process.env = previousEnv; });
const request = (patch = {}, signal) => new Request('https://www.nsso.me/api/deity/chat', { method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://www.nsso.me', 'x-vercel-forwarded-for': '192.0.2.100' },
  body: JSON.stringify({ message: 'what is nsso?', history: [], ...patch }), signal });
const ownerRequest = (patch = {}) => {
  const input = request({ message: 'Rename my fixture AI link.', ...patch });
  input.headers.set('authorization', 'Bearer fixture-only-token');
  return input;
};
const assertNoMutationOrRetry = () => {
  assert.equal(calls.filter(call => call.path.endsWith('/v1/responses')).length, 1);
  assert.equal(calls.filter(call => call.path.endsWith('/reserve_nsso_chat_budget')).length, 2);
  assert.equal(calls.filter(call => call.path.endsWith('/finish_nsso_chat_budget')).length, 1);
  const allowedRpcs = ['reserve_nsso_chat_budget', 'finish_nsso_chat_budget', 'get_agent_context', 'intelligent_search_openai_v1'];
  assert.ok(calls.filter(call => call.path.includes('/rpc/')).every(call => allowedRpcs.some(name => call.path.endsWith('/' + name))), 'A proposed change must never invoke a profile mutation');
};

test('legacy RPC links without IDs are replaced by separately verified owner-scoped canonical rows before the model sees context', async () => {
  mode = 'tool_only';
  const response = await POST(ownerRequest({ expectedAccountId: fixtureOwnerId }));
  assert.equal(response.status, 200);
  const actions = parseActionList(JSON.parse(splitActionPayload(await response.text()).actionsJson));
  assert.equal(actions[0].change.id, fixtureLinkId);
  const canonical = calls.filter(call => call.path === '/rest/v1/links');
  assert.equal(canonical.length, 1);
  assert.deepEqual(canonical[0].query, { select: 'id,user_id,link_name,link_url', user_id: `eq.${fixtureOwnerId}`, order: 'display_order.asc,id.asc', limit: '501' });
  for (const suffix of ['/v1/responses']) {
    const input = JSON.stringify(calls.find(call => call.path.endsWith(suffix)).body);
    assert.ok(input.includes(`[id: ${fixtureLinkId}] Canonical fixture link: https://example.test/`));
    assert.doesNotMatch(input, /\[id: undefined\]|Legacy link label|legacy\.example\.test/);
    assert.ok(!input.includes(fixtureOwnerId), 'Do not serialize row ownership into the model context');
  }
  const index = path => calls.findIndex(call => call.path.endsWith(path));
  assert.ok(index('/auth/v1/user') < index('/get_agent_context'));
  assert.ok(index('/get_agent_context') < index('/rest/v1/links'));
  assert.ok(index('/rest/v1/links') < index('/v1/responses'));
  assertNoMutationOrRetry();
});

for (const state of ['links_unavailable', 'links_missing', 'links_malformed', 'links_wrong_owner', 'links_missing_owner', 'links_missing_id', 'links_invalid_id', 'links_invalid_url', 'links_invalid_name', 'links_oversized_url', 'links_oversized_name', 'links_duplicate_ids', 'links_too_many']) {
  test(`${state} blocks profile chat before any model call instead of guessing a link ID`, async t => {
    mode = state;
    const logs = [];
    t.mock.method(console, 'error', (...args) => logs.push(args));
    t.mock.method(console, 'warn', (...args) => logs.push(args));
    const response = await POST(ownerRequest({ expectedAccountId: fixtureOwnerId }));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, 'chat_profile_context_unavailable');
    assert.match(body.error, /Nothing was changed/);
    assert.doesNotMatch(JSON.stringify({ body, logs }), /SHOULD_NEVER_LEAK/);
    assert.equal(calls.filter(call => call.path.startsWith('/v1/')).length, 0);
    assert.equal(calls.filter(call => call.path === '/rest/v1/links').length, 1);
    assert.equal(calls.filter(call => call.path === '/rest/v1/links' && call.method !== 'GET').length, 0);
  });
}

for (const state of ['links_empty', 'links_legacy_url', 'links_nullable_fields', 'links_blank_fields']) {
  test(`${state} remains usable read-only context without weakening mutation validation`, async () => {
    mode = state;
    const response = await POST(ownerRequest({ expectedAccountId: fixtureOwnerId }));
    assert.equal(response.status, 200);
    const wire = await response.text();
    assert.doesNotMatch(wire, /__DEITY_ACTIONS__/);
    const generation = JSON.stringify(calls.find(call => call.path.endsWith('/v1/responses')).body.instructions);
    assert.doesNotMatch(generation, /\[id: undefined\]|Legacy link label|legacy\.example\.test/);
    if (state === 'links_legacy_url') assert.ok(generation.includes('legacy-invalid-url'));
    if (state === 'links_empty') assert.ok(!generation.includes(`[id: ${fixtureLinkId}]`));
    else assert.ok(generation.includes(`[id: ${fixtureLinkId}]`));
    assertNoMutationOrRetry();
  });
}

for (const [state, status, code] of [
  ['auth_unavailable', 503, 'chat_authentication_unavailable'],
  ['auth_transport_failure', 503, 'chat_authentication_unavailable'],
  ['auth_invalid', 401, 'chat_authentication_required'],
  ['context_unavailable', 503, 'chat_profile_context_unavailable'],
  ['context_missing', 503, 'chat_profile_context_unavailable'],
  ['context_malformed', 503, 'chat_profile_context_unavailable'],
]) {
  test(`${state} cannot silently become a guest/no-context model answer`, async t => {
    mode = state;
    const logs = [];
    t.mock.method(console, 'error', (...args) => logs.push(args));
    t.mock.method(console, 'warn', (...args) => logs.push(args));
    const response = await POST(ownerRequest({ expectedAccountId: fixtureOwnerId }));
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.match(response.headers.get('x-deity-request-id'), /^[a-f0-9-]{36}$/);
    assert.match(body.error, /Nothing was changed/);
    assert.doesNotMatch(JSON.stringify(body), /SHOULD_NEVER_LEAK/);
    assert.doesNotMatch(JSON.stringify(logs), /SHOULD_NEVER_LEAK/);
    assert.equal(calls.filter(call => call.path.startsWith('/v1/')).length, 0);
    assert.equal(calls.filter(call => call.path === '/auth/v1/user').length, 1);
    assert.equal(calls.filter(call => call.path === '/rest/v1/links').length, 0);
    assert.ok(calls.filter(call => call.path.includes('/rpc/')).every(call => ['reserve_nsso_chat_budget', 'finish_nsso_chat_budget', 'get_agent_context'].some(name => call.path.endsWith('/' + name))));
  });
}

test('the expected owner cannot supply identity or silently omit authentication', async () => {
  for (const input of [request({ expectedAccountId: fixtureOwnerId }), ownerRequest({ expectedAccountId: fixtureLinkId })]) {
    const response = await POST(input);
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /Nothing was changed/);
  }
  assert.equal(calls.filter(call => call.path.startsWith('/v1/')).length, 0);
  assert.equal(calls.filter(call => call.path.endsWith('/get_agent_context')).length, 0);
  assert.equal(calls.filter(call => call.path === '/rest/v1/links').length, 0);
});

test('a malformed bearer is never treated as a guest', async () => {
  const input = ownerRequest(); input.headers.set('authorization', 'Basic fixture');
  const response = await POST(input);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'chat_authentication_required');
  assert.equal(calls.filter(call => call.path.startsWith('/v1/') || call.path === '/auth/v1/user').length, 0);
  assert.equal(calls.filter(call => call.path === '/rest/v1/links').length, 0);
});

test('native tools prepare review proposals and an explicit no-save request is not tool suppression', async () => {
  mode = 'tool_only';
  const response = await POST(ownerRequest({ message: 'Rename my fixture link for review, but do not save yet.', expectedAccountId: fixtureOwnerId }));
  const { actionsJson } = splitActionPayload(await response.text());
  assert.equal(parseActionList(JSON.parse(actionsJson)).length, 1);
  const generation = calls.find(call => call.path.endsWith('/v1/responses')).body;
  const prompt = JSON.stringify(generation.instructions);
  assert.match(prompt, /Calling a tool does NOT save or change the profile/);
  assert.match(prompt, /only the user's separate Apply click can persist/);
  assert.match(prompt, /mean prepare the tool proposal, NOT skip the tool/);
  assert.match(prompt, /never invent one/);
  assert.equal(generation.toolConfig, undefined);
  assert.deepEqual(generation.tools.find(tool => tool.type === 'function' && tool.name === 'update_profile_field').parameters.properties.target.enum, ['bio', 'headline', 'full_name']);
  assertNoMutationOrRetry();
});

test('an authenticated read-only request disables native tools without pretending it can save', async () => {
  const response = await POST(ownerRequest({ disableTools: true, expectedAccountId: fixtureOwnerId }));
  await response.text();
  const generation = calls.find(call => call.path.endsWith('/v1/responses')).body;
  assert.equal(generation.tools, undefined);
  assert.match(JSON.stringify(generation.instructions), /Profile-change tools are disabled for this request/);
  assert.doesNotMatch(JSON.stringify(generation.instructions), /AVAILABLE ACTIONS:/);
});

test('guest and explicitly read-only responses cannot expose unexpected provider tool proposals', async () => {
  mode = 'tool_only';
  for (const input of [request(), ownerRequest({ disableTools: true, expectedAccountId: fixtureOwnerId })]) {
    const response = await POST(input);
    const wire = await response.text();
    assert.doesNotMatch(wire, /__DEITY_ACTIONS__/);
    assert.match(wire, /Nothing was changed/);
    if (!input.headers.has('authorization')) assert.equal(calls.filter(call => call.path === '/rest/v1/links').length, 0);
  }
});

test('authenticated native update_link remains terminal JSON after a category tip and final billing', async () => {
  mode = 'tool_with_tip';
  const response = await POST(ownerRequest());
  assert.equal(response.status, 200);
  const wire = await response.text();
  const { message, actionsJson } = splitActionPayload(wire);
  assert.match(message, /Tip: I noticed you were asking about AI Tools/);
  const actions = parseActionList(JSON.parse(actionsJson));
  assert.deepEqual(actions, [{ version: 1, label: 'Update link', change: { kind: 'link.patch', id: fixtureLinkId, patch: { link_name: 'Fixture renamed link' } } }]);
  assert.equal(wire.indexOf('__DEITY_ACTIONS__'), wire.lastIndexOf('__DEITY_ACTIONS__'));
  assert.equal(calls.find(call => call.path.endsWith('/finish_nsso_chat_budget')).body.p_confirmed, true);
  const generation = calls.find(call => call.path.endsWith('/v1/responses')).body;
  assert.ok(generation.tools.some(tool => tool.type === 'function' && tool.name === 'update_link'));
  assert.equal(generation.toolConfig, undefined, 'Do not force model tool choice');
  assertNoMutationOrRetry();
});

test('an action-only provider completion still emits one valid review proposal', async () => {
  mode = 'tool_only';
  const response = await POST(ownerRequest());
  const { message, actionsJson } = splitActionPayload(await response.text());
  assert.equal(message.trim(), '');
  assert.equal(parseActionList(JSON.parse(actionsJson)).length, 1);
  assertNoMutationOrRetry();
});

for (const rejected of ['invalid_tool_only', 'unknown_tool_only']) {
  test(`${rejected} produces explicit no-change feedback and allowlisted diagnostics without leaking arguments`, async t => {
    mode = rejected;
    const warnings = [];
    t.mock.method(console, 'warn', (...args) => warnings.push(args));
    const response = await POST(ownerRequest());
    assert.equal(response.status, 200);
    const wire = await response.text();
    assert.equal(wire, invalidProposalMessage);
    assert.doesNotMatch(wire, /__DEITY_ACTIONS__|response was interrupted|Reference:|SHOULD_NEVER_LEAK/);
    const diagnostic = warnings.find(args => args[0] === 'Deity tool proposal rejected');
    assert.deepEqual(diagnostic?.[1], { requestId: response.headers.get('x-deity-request-id'), code: 'INVALID_PROFILE_PROPOSAL', toolName: rejected === 'invalid_tool_only' ? 'update_link' : 'unknown' });
    assert.ok(!JSON.stringify(warnings).includes(privateText));
    assert.equal(calls.find(call => call.path.endsWith('/finish_nsso_chat_budget')).body.p_confirmed, true);
    assertNoMutationOrRetry();
  });
}

test('mixed valid and invalid native calls retain the valid proposal without the invalid-only feedback', async () => {
  mode = 'mixed_tools';
  const response = await POST(ownerRequest());
  const wire = await response.text();
  assert.doesNotMatch(wire, /could not prepare a valid profile change/);
  const actions = parseActionList(JSON.parse(splitActionPayload(wire).actionsJson));
  assert.equal(actions.length, 1);
  assert.equal(actions[0].change.id, fixtureLinkId);
  assertNoMutationOrRetry();
});

test('a broken provider stream after a tool chunk never leaks a partial review proposal', async () => {
  mode = 'tool_broken_stream';
  const response = await POST(ownerRequest());
  const wire = await response.text();
  assert.match(wire, /response was interrupted/);
  assert.doesNotMatch(wire, /__DEITY_ACTIONS__|SHOULD_NEVER_LEAK/);
  assert.equal(calls.find(call => call.path.endsWith('/finish_nsso_chat_budget')).body.p_confirmed, false);
  assertNoMutationOrRetry();
});

test('a throwing action-emission logger fails before any action JSON is emitted', async t => {
  mode = 'tool_only';
  t.mock.method(console, 'log', (...args) => {
    if (String(args[0]).includes('Actions via Protocol')) throw new Error(privateText);
  });
  const response = await POST(ownerRequest());
  const wire = await response.text();
  assert.match(wire, /response was interrupted/);
  assert.doesNotMatch(wire, /__DEITY_ACTIONS__|SHOULD_NEVER_LEAK/);
  assert.equal(calls.find(call => call.path.endsWith('/finish_nsso_chat_budget')).body.p_confirmed, true);
  assertNoMutationOrRetry();
});

test('real route answers the reported guest question with the budgeted, supported model and product facts', async () => {
  const response = await POST(request({ history: [{ role: 'model', content: 'Welcome. Let me help with your bio.' }, { role: 'model', content: 'Tip: write your bio.' }] }));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /new sovereign self online/);
  assert.match(response.headers.get('x-deity-request-id'), /^[a-f0-9-]{36}$/);
  assert.equal(calls.filter(c => c.path.endsWith('/intelligent_search_openai_v1') || c.path.endsWith('/v1/embeddings')).length, 0);
  assert.equal(calls.filter(call => call.path === '/rest/v1/links').length, 0);
  const generation = calls.find(c => c.path.endsWith('/v1/responses'));
  assert.equal(generation.body.model, 'gpt-6-luna');
  assert.equal(generation.body.reasoning.effort, 'none');
  assert.equal(generation.body.max_output_tokens, 2048);
  assert.match(JSON.stringify(generation.body.instructions), /AUTHORITATIVE nsso PRODUCT IDENTITY/);
  assert.match(JSON.stringify(generation.body.instructions), /Always write the product name as/);
  assert.deepEqual(generation.body.input, [{ role: 'user', content: 'what is nsso?' }]);
  assert.equal(calls.filter(c => c.path.endsWith('/reserve_nsso_chat_budget')).length, 2);
  assert.equal(calls.find(c => c.path.endsWith('/finish_nsso_chat_budget')).body.p_confirmed, true);
});
test('a retired-model response produces a specific safe error, not a vague connectivity error or automatic retry', async () => {
  mode = 'retired';
  const response = await POST(request());
  assert.equal(response.status, 503);
  const error = await response.json();
  assert.equal(error.code, 'chat_model_unavailable');
  assert.match(error.error, /Reference:/);
  assert.ok(!JSON.stringify(error).includes(privateText));
  assert.equal(calls.filter(c => c.path.endsWith('/v1/responses')).length, 1);
  assert.equal(calls.find(c => c.path.endsWith('/finish_nsso_chat_budget')).body.p_confirmed, false);
});
test('a broken provider stream ends with an explicit safe interruption message instead of a broken HTTP body', async () => {
  mode = 'broken_stream';
  const response = await POST(request());
  const text = await response.text();
  assert.match(text, /response was interrupted/);
  assert.match(text, /Reference:/);
  assert.doesNotMatch(text, /broken JSON|SHOULD_NEVER_LEAK/);
});
test('an empty completion cannot silently look successful in the UI', async () => {
  mode = 'empty';
  const response = await POST(request());
  assert.match(await response.text(), /response was interrupted/);
});
test('normal resource questions retain retrieval and authentic conversation turns', async () => {
  const response = await POST(request({ message: 'Recommend design books', history: [{ role: 'user', content: 'I design websites' }, { role: 'model', content: 'What would you like to learn?' }] }));
  assert.equal(response.status, 200); await response.text();
  assert.equal(calls.filter(c => c.path.endsWith('/intelligent_search_openai_v1')).length, 1);
  assert.equal(calls.find(c => c.path.endsWith('/v1/responses')).body.input.length, 3);
  assert.equal(calls.some(c => c.path === '/books'), false, 'Corpus URLs must never trigger a server health fetch');
  assert.match(JSON.stringify(calls.find(c => c.path.endsWith('/v1/responses')).body.instructions), /NOT LIVE-VERIFIED/);
});
test('the original daily allowance still blocks all provider calls with the LinkedIn CTA', async () => {
  mode = 'quota';
  const response = await POST(request());
  assert.equal(response.status, 429);
  assert.equal((await response.json()).cta.href, 'https://www.linkedin.com/in/raminhoodeh/');
  assert.equal(calls.filter(c => c.path.startsWith('/v1/')).length, 0);
});
test('a transient 503 gets exactly one separately budgeted attempt and settles each independently', async () => {
  mode = 'busy_once';
  const response = await POST(request());
  assert.equal(response.status, 200); assert.match(await response.text(), /new sovereign self online/);
  assert.equal(calls.filter(c => c.path.endsWith('/v1/responses')).length, 2);
  const finishes = calls.filter(c => c.path.endsWith('/finish_nsso_chat_budget'));
  assert.deepEqual(finishes.map(c => c.body.p_confirmed), [false, true]);
  assert.notEqual(finishes[0].body.p_request_id, finishes[1].body.p_request_id);
  assert.equal(response.headers.get('x-deity-request-id'), finishes[1].body.p_request_id);
  assert.equal(calls.filter(c => c.path.endsWith('/reserve_nsso_chat_budget')).length, 4);
});
test('sustained provider 503s stop after two attempts, without leaking errors or looping', async () => {
  mode = 'always_busy';
  const response = await POST(request());
  assert.equal(response.status, 503); assert.ok(!JSON.stringify(await response.json()).includes(privateText));
  assert.equal(calls.filter(c => c.path.endsWith('/v1/responses')).length, 2);
  assert.deepEqual(calls.filter(c => c.path.endsWith('/finish_nsso_chat_budget')).map(c => c.body.p_confirmed), [false, false]);
});
test('recovery never retries billing, authentication, retirement, ambiguous network errors or an exhausted deadline', async () => {
  for (const error of [{ status: 401 }, { status: 402 }, { status: 403 }, { status: 404 }, { status: 429 }, new Error('unknown network state')]) {
    let attempts = 0, reservations = 0;
    await assert.rejects(startChatWithRecovery({ generate: async () => { attempts++; throw error; }, budget: { finish: async () => {} },
      reserveRetry: async () => { reservations++; }, deadline: Date.now() + 80000, pause: async () => {} }));
    assert.equal(attempts, 1); assert.equal(reservations, 0);
  }
  let attempts = 0;
  await assert.rejects(startChatWithRecovery({ generate: async () => { attempts++; throw { status: 503 }; }, budget: { finish: async () => {} },
    reserveRetry: async () => {}, deadline: Date.now(), pause: async () => {} }));
  assert.equal(attempts, 1);
});

test('optional profile embedding billing failure stops generation and holds before settlement', async () => {
  mode = 'profile_embedding_billing';
  const response = await POST(ownerRequest({ message: 'Recommend creative career courses', category: 'Career' }));
  assert.equal(response.status, 503); assert.ok(!JSON.stringify(await response.json()).includes(privateText));
  assert.equal(calls.filter(c => c.path.endsWith('/v1/embeddings')).length, 2);
  assert.equal(calls.filter(c => c.path.endsWith('/v1/responses')).length, 0);
  const hold = calls.findIndex(c => c.path.endsWith('/hold_nsso_ai_budget'));
  const finish = calls.findIndex(c => c.path.endsWith('/finish_nsso_chat_budget'));
  assert(hold >= 0 && finish > hold);
  assert.equal(calls[finish].body.p_confirmed, false);
});

test('ordinary optional profile embedding rate limit can continue without an account hold', async () => {
  mode = 'profile_embedding_rate_limit';
  const response = await POST(ownerRequest({ message: 'Recommend creative career courses', category: 'Career' }));
  assert.equal(response.status, 200); await response.text();
  assert.equal(calls.filter(c => c.path.endsWith('/v1/embeddings')).length, 2);
  assert.equal(calls.filter(c => c.path.endsWith('/v1/responses')).length, 1);
  assert.equal(calls.filter(c => c.path.endsWith('/hold_nsso_ai_budget')).length, 0);
});

test('partial-stream billing failure records one hold and retains maximum without a retry or action suffix', async () => {
  mode = 'stream_billing';
  const response = await POST(request()); const body = await response.text();
  assert.equal(response.status, 200); assert.match(body, /Partial fixture response/);
  assert.ok(!body.includes(privateText)); assert.equal(splitActionPayload(body).actionsJson, null);
  assert.equal(calls.filter(c => c.path.endsWith('/v1/responses')).length, 1);
  assert.equal(calls.filter(c => c.path.endsWith('/hold_nsso_ai_budget')).length, 1);
  const finish = calls.find(c => c.path.endsWith('/finish_nsso_chat_budget'));
  assert.equal(finish.body.p_confirmed, false);
  assert(calls.findIndex(c => c.path.endsWith('/hold_nsso_ai_budget')) < calls.indexOf(finish));
});
test('a denied retry reservation cannot cause a second provider call', async () => {
  let attempts = 0, settlements = 0;
  await assert.rejects(startChatWithRecovery({ generate: async () => { attempts++; throw { status: 503 }; },
    budget: { finish: async () => { settlements++; } }, reserveRetry: async () => { throw new Error('daily allowance reached'); },
    deadline: Date.now() + 80000, pause: async () => {} }));
  assert.equal(attempts, 1); assert.equal(settlements, 1);
});
test('NSSO product-question routing is narrow and facts remain aligned with the public homepage', () => {
  for (const q of ['what is nsso?', "What's NSSO?", 'Tell me about nsso', 'What does nsso stand for?', 'How does nsso work?']) assert.equal(isNssoProductQuestion(q), true, q);
  for (const q of ['Recommend design books', 'Find investors for my nsso startup', 'Explain neural networks']) assert.equal(isNssoProductQuestion(q), false, q);
  assert.match(NSSO_PRODUCT_CONTEXT, /new sovereign self online/);
  assert.match(NSSO_PRODUCT_CONTEXT, /coming soon/);
  assert.doesNotMatch(NSSO_PRODUCT_CONTEXT, /\bNSSO\b/);
});
test('display-only greetings and previous error messages never steer the next conversation turn', () => {
  assert.deepEqual(boundedChatHistory([
    { id: 'welcome', role: 'model', content: 'Welcome' }, { id: 'tip', role: 'model', content: 'Tip: bio' },
    { role: 'user', content: 'What is nsso?' }, { role: 'model', content: 'Connection failed', responseError: true },
    { role: 'model', content: 'Limit reached', allowanceCta: true },
  ]), [{ role: 'user', content: 'What is nsso?' }]);
});
test('diagnostics disclose only an allowlisted phase, provider status and opaque reference', () => {
  const result = chatFailureDetails({ status: 404, message: privateText, url: `https://example.com/?key=${privateText}` }, 'generation', 'safe-reference');
  assert.equal(result.code, 'chat_model_unavailable');
  assert.ok(!JSON.stringify(result).includes(privateText));
  assert.equal(chatFailureDetails({ status: 402 }, 'generation', 'ref').code, 'chat_provider_access_unavailable');
  assert.equal(chatFailureDetails({ status: 'private' }, 'generation', 'ref').upstreamStatus, undefined);
});


test('a request cancelled before starting consumes no allowance and calls no provider', async () => {
  const abort = new AbortController(); abort.abort();
  const response = await POST(request({}, abort.signal));
  assert.equal(response.status, 499);
  assert.equal((await response.json()).code, 'chat_cancelled');
  assert.deepEqual(calls, []);
});

test('request disconnect aborts an active provider stream and conservatively settles once', async () => {
  mode = 'hanging_stream';
  const abort = new AbortController();
  const response = await POST(request({}, abort.signal));
  const reader = response.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /Partial fixture/);
  abort.abort();
  const ended = await Promise.race([reader.read(), new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Cancellation did not end response')), 1000))]);
  assert.equal(ended.done, true);
  assert.equal(providerAborted, true);
  const settlements = calls.filter(call => call.path.endsWith('/finish_nsso_chat_budget'));
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].body.p_confirmed, false);
  assert.equal(calls.filter(call => call.path.endsWith('/v1/responses')).length, 1);
});

test('response cancellation aborts upstream work without requiring request.signal to change', async () => {
  mode = 'hanging_stream';
  const response = await POST(request());
  const reader = response.body.getReader(); await reader.read();
  await reader.cancel();
  assert.equal(providerAborted, true);
  const settlements = calls.filter(call => call.path.endsWith('/finish_nsso_chat_budget'));
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].body.p_confirmed, false);
});

test('disconnect while awaiting provider headers aborts the request and retains its reservation', async () => {
  mode = 'pending_headers';
  const abort = new AbortController();
  const pending = POST(request({}, abort.signal));
  for (let attempt = 0; attempt < 100 && !calls.some(call => call.path.endsWith('/v1/responses')); attempt++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.ok(calls.some(call => call.path.endsWith('/v1/responses')));
  abort.abort();
  const response = await pending;
  assert.equal(response.status, 499);
  assert.equal(providerAborted, true);
  assert.equal(calls.filter(call => call.path.endsWith('/finish_nsso_chat_budget'))[0].body.p_confirmed, false);
  assert.equal(calls.filter(call => call.path.endsWith('/v1/responses')).length, 1);
});

test('cancellation during the pre-stream retry pause never reserves or starts a second attempt', async () => {
  mode = 'busy_once';
  const abort = new AbortController();
  const pending = POST(request({}, abort.signal));
  for (let attempt = 0; attempt < 100 && !calls.some(call => call.path.endsWith('/finish_nsso_chat_budget')); attempt++) await new Promise(resolve => setTimeout(resolve, 1));
  abort.abort();
  assert.equal((await pending).status, 499);
  assert.equal(calls.filter(call => call.path.endsWith('/v1/responses')).length, 1);
  assert.equal(calls.filter(call => call.path.endsWith('/reserve_nsso_chat_budget')).length, 2);
  assert.equal(calls.filter(call => call.path.endsWith('/finish_nsso_chat_budget')).length, 1);
});

test('an optional profile embedding account failure holds the provider and cannot continue paid generation', async t => {
  mode = 'profile_embedding_auth';
  const logs = [];
  t.mock.method(console, 'error', (...values) => logs.push(values));
  const response = await POST(ownerRequest({ message: 'Show me useful AI tools.', expectedAccountId: fixtureOwnerId }));
  const body = await response.text();
  assert(response.status >= 400);
  assert.equal(calls.filter(call => call.path.endsWith('/v1/embeddings')).length, 2);
  assert.equal(calls.filter(call => call.path.endsWith('/v1/responses')).length, 0);
  assert(calls.some(call => call.path.endsWith('/hold_nsso_ai_budget')));
  assert(!JSON.stringify({ body, logs }).includes(privateText));
});

test('accelerators for nsso uses its exact curated source even with a selected unrelated chip', async () => {
 mode='accelerator';const response=await POST(request({message:'what accelerators do you recommend for nsso',category:'AI Tools'}));assert.equal(response.status,200);await response.text();
 const searches=calls.filter(c=>c.path.endsWith('/intelligent_search_openai_v1'));assert.equal(searches.length,1);assert.deepEqual(searches[0].body.filter_files,['ACCELERATORS.csv']);assert.equal(searches[0].body.match_threshold,0.3);
 assert.match(calls.find(c=>c.path.endsWith('/v1/responses')).body.instructions,/Acme Accelerator/);
});
test('valid scoped matches are never replaced by global matches because their weighted score is low', async () => {
 mode='accelerator';const response=await POST(request({message:'Recommend AI tools'}));await response.text();assert.equal(calls.filter(c=>c.path.endsWith('/intelligent_search_openai_v1')).length,1);
});
test('a database retrieval failure is reported instead of generating generic ungrounded advice', async () => {
 mode='retrieval_error';const response=await POST(request({message:'Recommend accelerators for nsso'}));assert.equal(response.status,503);const body=await response.json();assert.equal(body.code,'chat_knowledge_unavailable');assert.equal(calls.filter(c=>c.path.endsWith('/v1/responses')).length,0);
});

test('product identity and resource requests together still search the accelerator corpus',async()=>{
 mode='accelerator';const response=await POST(request({message:'What is nsso and which accelerators would fit it?'}));await response.text();assert.deepEqual(calls.find(c=>c.path.endsWith('/intelligent_search_openai_v1')).body.filter_files,['ACCELERATORS.csv']);
});

for (const [message, category] of [
  ['Which startup accelerators should nsso apply to?', 'Start-up / Investors'],
  ['Email me the details', null],
  ['I want to apply', null],
  ['AI startup funding', 'Start-up / Investors'],
  ['Recommend AI tools', 'AI Tools'],
  ['Find product management courses', 'Courses'],
  ['Help with my cover letter', 'Career'],
  ['Find start up investors', 'Start-up / Investors'],
]) test(`category routing: ${message}`, () => assert.equal(detectCategory(message), category));

test('resource routing supports multiple explicit databases and avoids substring matches', () => {
  assert.deepEqual(detectResourceFiles('Accelerators and angel investors'), ['ACCELERATORS.csv', 'Angel Investor Database.csv']);
  assert.deepEqual(detectResourceFiles('Venture capital and family offices'), ['Family Offices Database.csv', 'VC Investor Database.csv']);
  assert.deepEqual(detectResourceFiles('Incubators and business grants'), ['ACCELERATORS.csv', 'UK Business Grants.csv']);
  assert.equal(detectResourceFiles('My grantwriting biography'), null);
});

test('an empty category search can use global context but a global failure cannot generate advice', async () => {
  mode = 'empty_scoped';
  let response = await POST(request({message: 'Recommend courses'}));
  assert.equal(response.status, 200);
  await response.text();
  assert.equal(calls.filter(c => c.path.endsWith('/intelligent_search_openai_v1')).length, 2);
  mode = 'fallback_error';
  calls = [];
  response = await POST(request({message: 'Recommend courses'}));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'chat_knowledge_unavailable');
  assert(!calls.some(c => c.path.endsWith('/v1/responses')));
});

test('empty explicit accelerator results never substitute unrelated global resources', async () => {
  mode = 'empty_scoped';
  const response = await POST(request({message: 'Recommend accelerators for nsso'}));
  assert.equal(response.status, 200);
  await response.text();
  assert.equal(calls.filter(c => c.path.endsWith('/intelligent_search_openai_v1')).length, 1);
});
