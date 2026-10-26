import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const serverMock = `data:text/javascript,${encodeURIComponent('export const createClient = async () => globalThis.__freeProfileSupabase;')}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
    if (specifier === '@/lib/supabase/server') return { url: serverMock, shortCircuit: true };
    if (specifier.startsWith('@/lib/')) {
      return nextResolve(new URL(`../src/lib/${specifier.slice(6)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { POST: claim } = await import('../src/app/api/claim-free-domain/route.ts');
const { POST: update } = await import('../src/app/api/update-username/route.ts');
const { GET: check } = await import('../src/app/api/check-username/route.ts');
const { GET: earnings } = await import('../src/app/api/earnings/stats/route.ts');
const disabledBilling = await Promise.all([
  import('../src/app/api/polar-checkout/route.ts'),
  import('../src/app/api/cancel-subscription/route.ts'),
  import('../src/app/api/webhooks/polar/route.ts'),
]);
hooks.deregister();

function database({ user = { id: 'signed-in-user' }, authError = null, existing = null, lookupError = null, updateError = null, stats = null } = {}) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: authError }) },
    from(table) {
      calls.push(['from', table]);
      assert.equal(table, 'users', 'Free access must not write subscriptions or referral revenue');
      const query = {
        select(columns) { calls.push(['select', columns]); return query; },
        eq(column, value) { calls.push(['eq', column, value]); return query; },
        update(payload) { calls.push(['update', payload]); return query; },
        async maybeSingle() { return { data: existing, error: lookupError }; },
        async single() { return { data: updateError ? null : { id: user?.id }, error: updateError }; },
      };
      return query;
    },
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (name === 'claim_profile_username') {
        const conflict = existing && existing.id !== user?.id;
        return { data: { success: true, username: args.p_username }, error: updateError || (conflict ? { code: '23505' } : null) };
      }
      return { single: async () => ({ data: stats, error: null }) };
    },
  };
  globalThis.__freeProfileSupabase = client;
  return calls;
}

const request = body => new Request('https://nsso.test/api/profile', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('retired billing endpoints are inert even for paid and revocation payloads', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail('Disabled billing must not call a payment provider');
  globalThis.__freeProfileSupabase = new Proxy({}, { get() { assert.fail('Disabled billing must not access accounts'); } });
  try {
    for (const endpoint of disabledBilling) {
      const response = await endpoint.POST(request({ type: 'subscription.revoked', data: { metadata: { user_id: 'victim' } } }));
      assert.equal(response.status, 410);
      assert.equal((await response.json()).code, 'SUBSCRIPTIONS_DISABLED');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('claim and update require a real signed-in account', async () => {
  for (const endpoint of [claim, update]) {
    const calls = database({ user: null });
    const response = await endpoint(request({ username: 'valid-name', desiredUsername: 'valid-name' }));
    assert.equal(response.status, 401);
    assert.deepEqual(calls, []);
  }
});

test('a free account can claim or update its name without a subscription or admin key', async () => {
  for (const [endpoint, field] of [[claim, 'desiredUsername'], [update, 'username']]) {
    const calls = database();
    const response = await endpoint(request({ [field]: 'My-Free_Name' }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, username: 'my-free_name' });
    assert.deepEqual(calls, [['rpc', 'claim_profile_username', { p_username: 'my-free_name' }]], 'The database must derive ownership; the route cannot choose an actor or write role fields');
  }
});

test('availability, claim and update all reject malformed and reserved names', async () => {
  for (const value of ['API', 'Places', 'film', 'earnings', 'x', 'has spaces', {}, 123]) {
    const calls = database();
    for (const [endpoint, field] of [[claim, 'desiredUsername'], [update, 'username']]) {
      assert.equal((await endpoint(request({ [field]: value }))).status, 400);
    }
    if (typeof value === 'string') {
      const response = await check(new Request(`https://nsso.test/api/check-username?username=${encodeURIComponent(value)}`));
      assert.equal((await response.json()).available, false);
    }
    assert.deepEqual(calls, []);
  }
});

test('another account cannot be overwritten, including a database uniqueness race', async () => {
  for (const [endpoint, field] of [[claim, 'desiredUsername'], [update, 'username']]) {
    let calls = database({ existing: { id: 'someone-else' } });
    assert.equal((await endpoint(request({ [field]: 'taken-name' }))).status, 409);
    assert.equal(calls.some(call => call[0] === 'update'), false);

    calls = database({ updateError: { code: '23505' } });
    assert.equal((await endpoint(request({ [field]: 'raced-name' }))).status, 409);
    assert.deepEqual(calls, [['rpc', 'claim_profile_username', { p_username: 'raced-name' }]]);
  }
});

test('reclaiming the signed-in account name is idempotent and grants free access', async () => {
  database({ existing: { id: 'signed-in-user' } });
  const response = await claim(request({ desiredUsername: 'already-mine' }));
  assert.equal(response.status, 200);
});

test('malformed JSON receives a client error', async () => {
  database();
  const response = await update(new Request('https://nsso.test/api/update-username', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken' }));
  assert.equal(response.status, 400);
});

test('cross-origin and oversized username mutations are denied without database work', async () => {
  let calls = database();
  let response = await claim(new Request('https://nsso.test/api/claim-free-domain', {
    method: 'POST', headers: { origin: 'https://attacker.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ desiredUsername: 'safe-name' }),
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(calls, []);
  calls = database();
  response = await claim(request({ desiredUsername: 'x'.repeat(4096) }));
  assert.equal(response.status, 413);
  assert.deepEqual(calls, []);
});

test('free access reports no projected subscription income and retains referral history', async () => {
  const calls = database({ stats: { referral_code: 'NEWCV123', active_referrals: '25', expected_earnings: '80.00', paypal_me_slug: 'creator' } });
  const response = await earnings();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    referralCode: 'NEWCV123', activeReferrals: 25, expectedEarnings: 0, paypalMeSlug: 'creator',
  });
  assert.deepEqual(calls, [['rpc', 'get_user_earnings_stats', { user_uuid: 'signed-in-user' }]]);
});
