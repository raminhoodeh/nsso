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
hooks.deregister();

const realFetch = globalThis.fetch;
let mode;
let calls;
const privateText = 'AQ.SHOULD_NEVER_LEAK_or_log_private_prompt';
beforeEach(() => {
  mode = 'success'; calls = [];
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, body });
    if (path.endsWith('/reserve_nsso_chat_budget')) return Response.json(mode === 'quota'
      ? { allowed: false, code: 'daily_ip_allowance_exhausted' } : { allowed: true });
    if (path.endsWith('/finish_nsso_chat_budget')) return Response.json(null);
    if (path.endsWith('/intelligent_search')) return Response.json([{ content: 'Network School is in Malaysia.', metadata: { source: 'unrelated.csv' } }]);
    if (path.endsWith(':embedContent')) return Response.json({ embedding: { values: Array(768).fill(0.01) } });
    if (path.endsWith(':countTokens')) return Response.json({ totalTokens: 500 });
    if (path.endsWith(':streamGenerateContent')) {
      if (mode === 'retired') return Response.json({ error: { code: 404, message: `Model retired ${privateText}` } }, { status: 404 });
      const candidate = { candidates: [{ index: 0, content: { role: 'model', parts: mode === 'empty' ? [] : [{ text: 'NSSO stands for new sovereign self online.' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 20, totalTokenCount: 520 } };
      const wire = `data: ${JSON.stringify(candidate)}\n\n${mode === 'broken_stream' ? 'data: {broken JSON}\n\n' : ''}`;
      return new Response(wire, { headers: { 'content-type': 'text/event-stream' } });
    }
    throw new Error(`Unexpected test network call: ${path}`);
  };
});
after(() => { globalThis.fetch = realFetch; process.env = previousEnv; });
const request = (patch = {}) => new Request('https://www.nsso.me/api/deity/chat', { method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://www.nsso.me', 'x-vercel-forwarded-for': '192.0.2.100' },
  body: JSON.stringify({ message: 'what is nsso?', history: [], ...patch }) });

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
  assert.match(JSON.stringify(generation.body.systemInstruction), /AUTHORITATIVE NSSO PRODUCT IDENTITY/);
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
});
test('the original daily allowance still blocks all provider calls with the LinkedIn CTA', async () => {
  mode = 'quota';
  const response = await POST(request());
  assert.equal(response.status, 429);
  assert.equal((await response.json()).cta.href, 'https://www.linkedin.com/in/raminhoodeh/');
  assert.equal(calls.filter(c => c.path.includes('/models/')).length, 0);
});
test('NSSO product-question routing is narrow and facts remain aligned with the public homepage', () => {
  for (const q of ['what is nsso?', "What's NSSO?", 'Tell me about nsso', 'What does nsso stand for?', 'How does nsso work?']) assert.equal(isNssoProductQuestion(q), true, q);
  for (const q of ['Recommend design books', 'Find investors for my nsso startup', 'Explain neural networks']) assert.equal(isNssoProductQuestion(q), false, q);
  assert.match(NSSO_PRODUCT_CONTEXT, /new sovereign self online/);
  assert.match(NSSO_PRODUCT_CONTEXT, /coming soon/);
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
