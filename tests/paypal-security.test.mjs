import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../src/', import.meta.url);
const sessionMock = `data:text/javascript,${encodeURIComponent('export const createClient = async () => globalThis.__paymentSession;')}`;
const serviceMock = `data:text/javascript,${encodeURIComponent('export const createClient = () => {globalThis.__paymentCalls.push(["privileged"]);return globalThis.__paymentService;};')}`;
const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@/lib/server/runtime-route') return { url: 'data:text/javascript,export const withRuntimeGuard = handler => handler;', shortCircuit: true };
    if (specifier === 'next/server') return next('next/server.js', context);
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {};', shortCircuit: true };
    if (specifier === '@/lib/supabase/server') return { url: sessionMock, shortCircuit: true };
    if (specifier === '@supabase/supabase-js') return { url: serviceMock, shortCircuit: true };
    if (specifier.startsWith('@/')) return next(new URL(`${specifier.slice(2)}.ts`, source).href, context);
    if (specifier.startsWith('.') && context.parentURL?.startsWith(source.href)) {
        const url = new URL(`${specifier}.ts`, context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
    return next(specifier, context);
} });
const { parsePayPalInput, validatePayPalConfig, resolvePayPalConfig } = await import('../src/lib/payments/paypal-config.ts');
const { safeWebUrl, safeContactUrl } = await import('../src/lib/urls.ts');
const { productCheckoutVisibility, productPageIsPublic } = await import('../src/lib/payments/product-presentation.ts');
const { POST } = await import('../src/app/api/products/[id]/payment/route.ts');
hooks.deregister();

// Synthetic identifiers and destinations only; never copy production payment snippets into this public repository.
const id = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const ncp = '<style>.pp { color: red }</style><form action="https://www.paypal.com/ncp/payment/AB12CD34EF56G" method="post" target="_blank"><input type="submit" value="Buy Now"><img src="https://www.paypalobjects.com/images/Debit_Credit.svg" alt="cards"></form>';
const hosted = currency => `<script src="https://www.paypal.com/sdk/js?client-id=ba&components=hosted-buttons&currency=${currency}"></script><div id="paypal-container-fixture"></div><script>paypal.HostedButtons({hostedButtonId: "ABC123FIXTURE"}).render("#paypal-container-fixture")</script>`;

test('known NCP forms preserve the provider-configured checkout destination without executable decoration', () => {
    const parsed = parsePayPalInput(ncp);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.config, { version: 1, kind: 'payment-form', action: 'https://www.paypal.com/ncp/payment/AB12CD34EF56G', fields: [], label: 'Buy Now' });
    assert.ok(validatePayPalConfig(parsed.config));
    assert.equal('amount' in parsed.config, false);
    assert.equal('successUrl' in parsed.config, false);
});

test('HostedButtons and classic forms become bounded, versioned data with their currency and hidden fields', () => {
    assert.deepEqual(parsePayPalInput(hosted('USD')).config, { version: 1, kind: 'hosted-button', hostedButtonId: 'ABC123FIXTURE', currency: 'USD' });
    const classic = parsePayPalInput('<form action="https://paypal.com/cgi-bin/webscr" method="post"><input type="hidden" name="cmd" value="_s-xclick"><input type="hidden" name="hosted_button_id" value="ABC123FIXTURE"><input type="submit" value="Buy &amp; learn"></form>');
    assert.equal(classic.ok, true);
    assert.equal(classic.config.action, 'https://www.paypal.com/cgi-bin/webscr');
    assert.deepEqual(classic.config.fields, [{ name: 'cmd', value: '_s-xclick' }, { name: 'hosted_button_id', value: 'ABC123FIXTURE' }]);
    assert.equal(classic.config.label, 'Buy & learn');
    assert.equal(parsePayPalInput('').config, null);
});

test('named submit and image controls fail explicitly instead of changing submitted fields', () => {
    for (const control of [
        '<input type="submit" name="merchant_choice" value="Buy">',
        '<input type="image" name="submit" src="https://www.paypalobjects.com/button.png" alt="Buy">',
        '<button name="amount" value="50">Buy</button>',
    ]) {
        const parsed = parsePayPalInput(ncp.replace('<input type="submit" value="Buy Now">', control));
        assert.equal(parsed.ok, false);
        assert.match(parsed.message, /Named submit or image controls are not supported/);
    }
    assert.equal(parsePayPalInput(ncp).ok, true, 'Existing unnamed NCP buttons keep their configured destination');
});

test('executable content, spoofed destinations, dynamic controls and ambiguous payment formats fail closed', () => {
    const invalid = [
        ncp.replace('<img ', '<img onerror="window.fixturePwned=1" '),
        ncp + '<iframe src="https://attacker.invalid"></iframe>',
        ncp + '<script>window.fixturePwned=1</script>',
        ncp.replace('www.paypal.com/', 'www.paypal.com.attacker.invalid/'),
        ncp.replace('www.paypal.com/', 'merchant@www.paypal.com/'),
        ncp.replace('https://www.paypal.com/', 'javascript:alert(1)//'),
        ncp.replace('method="post"', 'method="get"'),
        ncp.replace('</form>', '<input name="amount" value="5"></form>'),
        ncp.replace('</form>', '<select name="amount"><option>5</option></select></form>'),
        ncp.replace('</form>', '<input type="hidden" name="unrecognized" value="5"></form>'),
        ncp + ncp,
        hosted('USD') + ncp,
        hosted('INVALID'),
        'x'.repeat(32769),
    ];
    for (const html of invalid) assert.equal(parsePayPalInput(html).ok, false, html.slice(0, 180));
    const forged = { version: 1, kind: 'payment-form', action: 'https://www.paypal.com/ncp/payment/AB12CD34EF56G', fields: [], label: 'Buy', script: 'bad()' };
    assert.equal(validatePayPalConfig(forged), false);
    assert.equal(resolvePayPalConfig(forged, ncp), null, 'Invalid canonical data cannot silently downgrade to raw HTML');
});

test('rendering URL policy preserves ordinary links while blocking executable protocols, credentials and contact query injection', () => {
    assert.equal(safeWebUrl('https://example.test/a?q=1#part'), 'https://example.test/a?q=1#part');
    assert.equal(safeWebUrl('http://example.test/a'), 'http://example.test/a');
    assert.equal(safeWebUrl('  https://example.test/a  '), 'https://example.test/a');
    for (const value of ['javascript:alert(1)', 'data:text/html,x', '//outside.test', '/relative', 'https://user:pass@example.test', 'https://example.test/a\\b', 'https://example.test/a\nb']) assert.equal(safeWebUrl(value), null);
    assert.equal(safeContactUrl('email', 'seller@example.test'), 'mailto:seller@example.test');
    assert.equal(safeContactUrl('email', 'seller@example.test?bcc=victim@example.test'), null);
    assert.equal(safeContactUrl('Phone', '+971 (55) 294-4951'), 'tel:+971552944951');
    assert.equal(safeContactUrl('Phone', '055 294 4951'), 'tel:0552944951');
    for (const value of ['+971552944951;ext=2', '+971552944951?x=1', '+97155\n2944951', 'javascript:alert(1)']) assert.equal(safeContactUrl('Phone', value), null);
    assert.equal(safeContactUrl('WhatsApp', '+44 (123) 456-7890'), 'https://wa.me/441234567890');
    assert.equal(safeContactUrl('Telegram', '@fixture_user'), 'https://t.me/fixture_user');
    assert.equal(safeContactUrl('Telegram', 'fixture_user?start=attacker'), null);
});

test('payment visibility is independent of sales-page publication and legacy publication stays unchanged', () => {
    assert.deepEqual(productCheckoutVisibility({ purchase_link: 'https://seller.test', purchase_link_active: false, paypal_active: false }), { purchaseUrl: null, purchaseUrls: [], paypal: false });
    assert.deepEqual(productCheckoutVisibility({ purchase_link: 'javascript:alert(1)', purchase_link_active: true, paypal_active: true }), { purchaseUrl: null, purchaseUrls: [], paypal: true });
    assert.equal(productPageIsPublic({ sales_page_published: false }), false);
    assert.equal(productPageIsPublic({ sales_page_published: true }), true);
    assert.equal(productPageIsPublic({ sales_page_published: null }), true);
});

const originalEnv = { ...process.env };
let calls, user, owned, lookupError, saveError;
beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only-not-a-secret';
    calls = globalThis.__paymentCalls = []; user = { id: actor }; owned = { id }; lookupError = null; saveError = null;
    globalThis.__paymentSession = {
        auth: { getUser: async () => ({ data: { user }, error: null }) },
        from(table) {
            calls.push(['session-table', table]);
            const query = {
                select(value) { calls.push(['owner-select', value]); return query; },
                eq(key, value) { calls.push(['owner-eq', key, value]); return query; },
                maybeSingle: async () => ({ data: owned, error: lookupError }),
            };
            return query;
        },
    };
    globalThis.__paymentService = { rpc: async (name, args) => {
        calls.push(['payment-rpc',name,args]);
        return {data:saveError ? null : {status:'applied',operationId:args.p_operation_id,revision:1,changes:[]},error:saveError};
    },from:()=>assert.fail('Payment settings must use the atomic revisioned RPC')};
});
after(() => { process.env = originalEnv; });
const request = body => new Request(`https://nsso.test/api/products/${id}/payment`, { method: 'POST', headers: { origin: 'https://nsso.test', 'x-nsso-account':actor, 'content-type': 'application/json' }, body: JSON.stringify({ operationId: crypto.randomUUID(), expectedRevision: 0, ...body }) });
const invoke = req => POST(req, { params: Promise.resolve({ id }) });
const deniedBody = () => new Proxy(request({ html: ncp }), { get(target, property) { if (property === 'body') assert.fail('Denied requests must not read the body'); return Reflect.get(target, property, target); } });

test('payment persistence authenticates and scopes ownership before reading HTML or acquiring privileged access', async () => {
    user = null;
    assert.equal((await invoke(deniedBody())).status, 401);
    assert.deepEqual(calls, []);
    user = { id: actor }; owned = null;
    assert.equal((await invoke(deniedBody())).status, 404);
    assert.ok(!calls.some(call => call[0] === 'privileged'));
    assert.deepEqual(calls.filter(call => call[0] === 'owner-eq'), [['owner-eq', 'id', id], ['owner-eq', 'user_id', actor]]);
});

test('malformed or oversized HTML and cross-origin requests never reach privileged writes', async () => {
    assert.equal((await invoke(request({ html: ncp, user_id: actor }))).status, 400);
    assert.equal((await invoke(request({ html: ncp + '<script>alert(1)</script>' }))).status, 422);
    assert.equal((await invoke(request({ html: 'x'.repeat(100000) }))).status, 413);
    assert.equal((await invoke(new Request(`https://nsso.test/api/products/${id}/payment`, { method: 'POST', headers: { origin: 'https://attacker.invalid' }, body: '{}' }))).status, 403);
    assert.ok(!calls.some(call => call[0] === 'privileged'));
});

test('accepted owner edits persist raw compatibility data plus server-generated canonical config under both actor and product guards', async () => {
    const response = await invoke(request({ html: ncp }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual((await response.json()).config, parsePayPalInput(ncp).config);
    const rpc=calls.find(call=>call[0]==='payment-rpc');
    assert.equal(rpc[1],'save_product_payment_operation');
    assert.deepEqual({...rpc[2],p_operation_id:'stable-operation'}, {p_user_id:actor,p_product_id:id,p_operation_id:'stable-operation',p_expected_revision:0,p_html:ncp,p_config:parsePayPalInput(ncp).config});
    saveError = { message: 'fixture private database detail' };
    const failed = await invoke(request({ html: ncp }));
    assert.equal(failed.status, 503);
    assert.doesNotMatch(await failed.text(), /private database detail/);
});
