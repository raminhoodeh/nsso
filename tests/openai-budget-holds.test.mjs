import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { startChatWithRecovery } from '../src/lib/deity/chat-recovery.ts';
import { OpenAIProviderError } from '../src/lib/deity/openai-provider.ts';

const root = new URL('../src/lib/deity/', import.meta.url);
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@/lib/server/runtime-signals') return { url: 'data:text/javascript,' + encodeURIComponent('export function reportRuntimeSignal(...args) { globalThis.__openAiHoldSignals.push(args); return "fixture-signal"; }'), shortCircuit: true };
  if (context.parentURL?.startsWith(root.href) && ['./chat-allowance','./openai-provider'].includes(specifier)) return next(new URL(specifier.slice(2) + '.ts', root).href, context);
  return next(specifier, context);
} });
const { ChatBudget, openChatBudget } = await import(new URL('chat-budget-server.ts', root));
hooks.deregister();
const originalFetch = globalThis.fetch;
let savedEnv;
beforeEach(() => {
  savedEnv = Object.fromEntries(['NSSO_AI_ENABLED','OPENAI_API_KEY','VERCEL','NSSO_CHAT_IP_HASH_SECRET','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].map(key => [key, process.env[key]]));
  Object.assign(process.env, { NSSO_AI_ENABLED: 'true', OPENAI_API_KEY: 'fixture-only', VERCEL: '1', NSSO_CHAT_IP_HASH_SECRET: 'fixture-secret-longer-than-thirty-two-characters', NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' });
  globalThis.__openAiHoldSignals = [];
  globalThis.fetch = async () => { throw new Error('No external network is authorized in this test.'); };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key,value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('account failure creates one durable manual hold; transient status creates no account hold', async () => {
  const calls = [];
  const budget = new ChatBudget(async (name,args) => { calls.push({ name,args }); return { data: null, error: null }; }, 'a'.repeat(64), 'chat');
  for (const status of [401,402,403]) await budget.blockOnProviderFailure(new OpenAIProviderError(status));
  await budget.blockOnProviderFailure(new OpenAIProviderError(429));
  assert.equal(calls.length, 3); assert(calls.every(call => call.name === 'hold_nsso_ai_budget' && call.args.p_code === 'provider_access_requires_review'));
});

test('allowlisted billing429 persists a hold while ordinary429 and forged user errors do not', async () => {
  const calls = [];
  const budget = new ChatBudget(async (name,args) => { calls.push({ name,args }); return { data: null, error: null }; }, 'a'.repeat(64), 'chat');
  for (const code of ['insufficient_quota','credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded','organization_usage_limit_exceeded']) {
    await budget.blockOnProviderFailure(new OpenAIProviderError(429, code));
  }
  await budget.blockOnProviderFailure(new OpenAIProviderError(429, 'rate_limit_exceeded'));
  await budget.blockOnProviderFailure(new OpenAIProviderError(429, 'slow_down'));
  await budget.blockOnProviderFailure({ status: 429, code: 'credit_balance_exhausted' });
  assert.equal(calls.length, 5); assert(calls.every(call => call.name === 'hold_nsso_ai_budget' && call.args.p_code === 'provider_access_requires_review'));
});

test('a returned database error while recording an account hold emits a sanitized unavailable signal', async () => {
  const budget = new ChatBudget(async () => ({ data: null, error: { message: 'PRIVATE_HOLD_FAILURE_FIXTURE' } }), 'a'.repeat(64), 'chat');
  await budget.blockOnProviderFailure(new OpenAIProviderError(401));
  assert.deepEqual(globalThis.__openAiHoldSignals, [['budget_unavailable']]);
  assert(!JSON.stringify(globalThis.__openAiHoldSignals).includes('PRIVATE_HOLD_FAILURE_FIXTURE'));
});

for (const configuration of ['disabled','missing_key']) {
  test(`${configuration} AI cannot consume a durable reservation or perform any network call`, async () => {
    if (configuration === 'disabled') process.env.NSSO_AI_ENABLED = 'false'; else delete process.env.OPENAI_API_KEY;
    let network = 0;
    globalThis.fetch = async () => { network++; throw new Error('No reservation should be attempted.'); };
    const request = new Request('https://www.nsso.me/api/deity/chat', { headers: { 'x-vercel-forwarded-for': '192.0.2.1' } });
    await assert.rejects(openChatBudget(request, 'chat'));
    assert.equal(network, 0);
  });
}

test('local configuration failure cannot trigger a second generation or a second budget', async () => {
  let generation = 0, retained = 0, retries = 0;
  await assert.rejects(startChatWithRecovery({
    generate: async () => { generation++; throw new OpenAIProviderError(503, 'provider_not_configured'); },
    budget: { finish: async () => { retained++; } },
    reserveRetry: async () => { retries++; },
    deadline: Date.now() + 90_000,
    pause: async () => {},
  }), error => error.code === 'provider_not_configured');
  assert.equal(generation, 1); assert.equal(retries, 0); assert.equal(retained, 0);
});

test('user authentication and permission failures cannot disable the model provider', async () => {
  const calls = [];
  const budget = new ChatBudget(async (name,args) => { calls.push({ name,args }); return { data: null, error: null }; }, 'a'.repeat(64), 'chat');
  for (const status of [401,402,403]) {
    await budget.blockOnProviderFailure(Object.assign(new Error('Synthetic user authentication failure'), { status }));
    await budget.blockOnProviderFailure({ status, code: 'chat_authentication_required' });
  }
  assert.deepEqual(calls, []); assert.deepEqual(globalThis.__openAiHoldSignals, []);
});
