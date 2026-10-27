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
  GOOGLE_GENERATIVE_AI_API_KEY: 'test-only-not-a-real-gemini-key',
  NSSO_CHAT_IP_HASH_SECRET: 'test-only-hmac-secret-longer-than-32-characters', VERCEL: '1',
});
const hooks = registerHooks({ resolve(specifier, context, next) {
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
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, body });
    if (path.endsWith('/reserve_nsso_chat_budget')) return Response.json(mode === 'quota'
      ? { allowed: false, code: 'daily_ip_allowance_exhausted' } : { allowed: true });
    if (path.endsWith('/finish_nsso_chat_budget')) return Response.json(null);
    if (path === '/auth/v1/user') return Response.json({ id: fixtureOwnerId, aud: 'authenticated', role: 'authenticated' });
    if (path.endsWith('/get_agent_context')) return Response.json({ profile: { full_name: 'Fixture Creator', headline: 'Fixture headline', bio: 'Fixture biography' }, links: [{ id: fixtureLinkId, link_name: 'Fixture link', link_url: 'https://example.test/' }] });
    if (path.endsWith('/intelligent_search')) return Response.json([{ content: 'Network School is in Malaysia.', metadata: { source: 'unrelated.csv', url: 'https://fixtures.example.test/books' } }]);
    if (path.endsWith(':embedContent')) return Response.json({ embedding: { values: Array(768).fill(0.01) } });
    if (path.endsWith(':countTokens')) return Response.json({ totalTokens: 500 });
    if (path.endsWith(':streamGenerateContent')) {
      if (mode === 'pending_headers') return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => { providerAborted = true; reject(new DOMException('Fixture cancelled', 'AbortError')); }, { once: true });
      });
      if (mode === 'hanging_stream') {
        return new Response(new ReadableStream({ start(controller) {
          init.signal.addEventListener('abort', () => { providerAborted = true; controller.error(new DOMException('Fixture cancelled', 'AbortError')); }, { once: true });
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'Partial fixture response' }] } }] })}\n\n`));
        } }), { headers: { 'content-type': 'text/event-stream' } });
      }
      if (mode === 'retired') return Response.json({ error: { code: 404, message: `Model retired ${privateText}` } }, { status: 404 });
      if (mode === 'always_busy' || (mode === 'busy_once' && calls.filter(c => c.path.endsWith(':streamGenerateContent')).length === 1)) {
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
      const candidate = { candidates: [{ index: 0, content: { role: 'model', parts }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 20, totalTokenCount: 520 } };
      const wire = `data: ${JSON.stringify(candidate)}\n\n${['broken_stream', 'tool_broken_stream'].includes(mode) ? 'data: {broken JSON}\n\n' : ''}`;
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
  assert.equal(calls.filter(call => call.path.endsWith(':streamGenerateContent')).length, 1);
  assert.equal(calls.filter(call => call.path.endsWith('/reserve_nsso_chat_budget')).length, 2);
  assert.equal(calls.filter(call => call.path.endsWith('/finish_nsso_chat_budget')).length, 1);
  const allowedRpcs = ['reserve_nsso_chat_budget', 'finish_nsso_chat_budget', 'get_agent_context', 'intelligent_search'];
  assert.ok(calls.filter(call => call.path.includes('/rpc/')).every(call => allowedRpcs.some(name => call.path.endsWith('/' + name))), 'A proposed change must never invoke a profile mutation');
};

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
  const generation = calls.find(call => call.path.endsWith(':streamGenerateContent')).body;
  assert.ok(generation.tools[0].functionDeclarations.some(tool => tool.name === 'update_link'));
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
  assert.equal(calls.filter(c => c.path.endsWith('/intelligent_search') || c.path.endsWith(':embedContent')).length, 0);
  const generation = calls.find(c => c.path.endsWith(':streamGenerateContent'));
  assert.match(generation.path, /gemini-2\.5-flash:/);
  assert.equal(generation.body.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.equal(generation.body.generationConfig.maxOutputTokens, 2048);
  assert.match(JSON.stringify(generation.body.systemInstruction), /AUTHORITATIVE nsso PRODUCT IDENTITY/);
  assert.match(JSON.stringify(generation.body.systemInstruction), /Always write the product name as/);
  assert.deepEqual(generation.body.contents, [{ role: 'user', parts: [{ text: 'what is nsso?' }] }]);
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
  assert.equal(calls.filter(c => c.path.endsWith(':streamGenerateContent')).length, 1);
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
  assert.equal(calls.filter(c => c.path.endsWith('/intelligent_search')).length, 1);
  assert.equal(calls.find(c => c.path.endsWith(':streamGenerateContent')).body.contents.length, 3);
  assert.equal(calls.some(c => c.path === '/books'), false, 'Corpus URLs must never trigger a server health fetch');
  assert.match(JSON.stringify(calls.find(c => c.path.endsWith(':streamGenerateContent')).body.systemInstruction), /NOT LIVE-VERIFIED/);
});
test('the original daily allowance still blocks all provider calls with the LinkedIn CTA', async () => {
  mode = 'quota';
  const response = await POST(request());
  assert.equal(response.status, 429);
  assert.equal((await response.json()).cta.href, 'https://www.linkedin.com/in/raminhoodeh/');
  assert.equal(calls.filter(c => c.path.includes('/models/')).length, 0);
});
test('a transient 503 gets exactly one separately budgeted attempt and settles each independently', async () => {
  mode = 'busy_once';
  const response = await POST(request());
  assert.equal(response.status, 200); assert.match(await response.text(), /new sovereign self online/);
  assert.equal(calls.filter(c => c.path.endsWith(':streamGenerateContent')).length, 2);
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
  assert.equal(calls.filter(c => c.path.endsWith(':streamGenerateContent')).length, 2);
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
  assert.equal(calls.filter(call => call.path.endsWith(':streamGenerateContent')).length, 1);
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
  for (let attempt = 0; attempt < 100 && !calls.some(call => call.path.endsWith(':streamGenerateContent')); attempt++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.ok(calls.some(call => call.path.endsWith(':streamGenerateContent')));
  abort.abort();
  const response = await pending;
  assert.equal(response.status, 499);
  assert.equal(providerAborted, true);
  assert.equal(calls.filter(call => call.path.endsWith('/finish_nsso_chat_budget'))[0].body.p_confirmed, false);
  assert.equal(calls.filter(call => call.path.endsWith(':streamGenerateContent')).length, 1);
});

test('cancellation during the pre-stream retry pause never reserves or starts a second attempt', async () => {
  mode = 'busy_once';
  const abort = new AbortController();
  const pending = POST(request({}, abort.signal));
  for (let attempt = 0; attempt < 100 && !calls.some(call => call.path.endsWith('/finish_nsso_chat_budget')); attempt++) await new Promise(resolve => setTimeout(resolve, 1));
  abort.abort();
  assert.equal((await pending).status, 499);
  assert.equal(calls.filter(call => call.path.endsWith(':streamGenerateContent')).length, 1);
  assert.equal(calls.filter(call => call.path.endsWith('/reserve_nsso_chat_budget')).length, 2);
  assert.equal(calls.filter(call => call.path.endsWith('/finish_nsso_chat_budget')).length, 1);
});
