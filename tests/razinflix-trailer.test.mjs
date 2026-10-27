import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@/lib/server/runtime-route') return { url: 'data:text/javascript,export const withRuntimeGuard = handler => handler;', shortCircuit: true };
    if (specifier === 'next/server') return { url: `data:text/javascript,${encodeURIComponent('export const NextResponse={json:(...args)=>Response.json(...args)}')}`, shortCircuit: true };
    return next(specifier, context);
} });
const { GET } = await import('../src/app/api/razinflix/trailer/[videoId]/route.ts');
hooks.deregister();

test('trailer probes reject malformed IDs before contacting any provider', async () => {
    const response = await GET(new Request('https://nsso.test'), { params: Promise.resolve({ videoId: '../bad' }) });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { status: 'unavailable' });
});

test('public trailer probes distinguish private/deleted clips from transient provider failures', async () => {
    const originalFetch = globalThis.fetch;
    try {
        for (const [code, expected] of [[200, 'available'], [401, 'unavailable'], [404, 'unavailable'], [429, 'unknown'], [503, 'unknown']]) {
            let calls = 0;
            globalThis.fetch = async (input, init) => {
                calls++;
                const url = new URL(input);
                assert.equal(url.origin, 'https://www.youtube.com');
                assert.equal(url.pathname, '/oembed');
                assert.equal(url.searchParams.get('url'), 'https://www.youtube.com/watch?v=Be7_u8jzHzU');
                assert.equal(init.redirect, 'error');
                assert.ok(init.signal instanceof AbortSignal);
                return new Response('{}', { status: code });
            };
            const response = await GET(new Request('https://nsso.test'), { params: Promise.resolve({ videoId: 'Be7_u8jzHzU' }) });
            assert.deepEqual(await response.json(), { status: expected });
            assert.equal(calls, 1);
        }
        globalThis.fetch = async () => { throw new Error('Synthetic network failure'); };
        const response = await GET(new Request('https://nsso.test'), { params: Promise.resolve({ videoId: 'Be7_u8jzHzU' }) });
        assert.deepEqual(await response.json(), { status: 'unknown' });
        assert.equal(response.headers.get('cache-control'), 'no-store');
    } finally { globalThis.fetch = originalFetch; }
});
