import assert from 'node:assert/strict'
import http from 'node:http'
import { test, expect } from '@playwright/test'

test.use({ browserName: 'webkit', channel: '' });

// WebKit can label a correctly caught fetch in a departing document as an
// access-control pageerror. Never treat this text alone as a CORS defect OR
// blanket-ignore it. This actual-HTTP contrast establishes its provenance.
// Upstream: https://github.com/microsoft/playwright/issues/43120
// No NSSO sessions, private data, network interception, or production calls.
async function fixture() {
    let replacementRequested, releaseReplacement;
    const replacement = new Promise(resolve => { replacementRequested = resolve; });
    const gate = new Promise(resolve => { releaseReplacement = resolve; });
    let reads = 0;
    const server = http.createServer((request, response) => {
        if (request.url === '/replacement') {
            replacementRequested();
            void gate.then(() => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<title>Replacement</title>'); });
            return;
        }
        if (request.url.startsWith('/api/')) {
            reads++;
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end('{"ok":true}');
            return;
        }
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end('<title>Original</title>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return {
        origin: 'http://127.0.0.1:' + server.address().port,
        replacement,
        release: releaseReplacement,
        reads: () => reads,
        async close() {
            releaseReplacement();
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        },
    };
}

async function observe(context) {
    const browserEvents = [];
    await context.exposeBinding('observeWindowFailure', (_, value) => browserEvents.push(value));
    await context.addInitScript(() => {
        addEventListener('error', event => { void window.observeWindowFailure({ kind: 'window.error', name: event.error?.name, message: event.message }); });
        addEventListener('unhandledrejection', event => { void window.observeWindowFailure({ kind: 'unhandledrejection', name: event.reason?.name, message: String(event.reason) }); });
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push({ name: error.name, message: error.message, stack: error.stack }));
    return { page, browserEvents, pageErrors };
}

test('WebKit stable reads succeed; provisional-loader diagnostics are not uncaught exceptions', async ({ browser }, testInfo) => {
    const server = await fixture();
    const evidence = [];
    try {
        for (const navigation of [false, true]) {
            const context = await browser.newContext();
            try {
                const { page, browserEvents, pageErrors } = await observe(context);
                await page.goto(server.origin);
                const document = await page.evaluateHandle(() => ({ document: window.document, origin: location.origin }));
                let replacement;
                if (navigation) {
                    replacement = page.goto(server.origin + '/replacement');
                    await server.replacement;
                }
                const before = server.reads();
                let observation;
                try {
                    observation = await document.evaluate(async ({ document, origin }) => {
                        const results = await Promise.all(['/api/earnings/stats', '/api/prefetch'].map(async path => {
                            try {
                                const response = await document.defaultView.fetch(path);
                                await response.json();
                                return { status: response.status, caught: false };
                            } catch (error) { return { caught: true, name: error.name, message: error.message }; }
                        }));
                        return { sameDocument: document === window.document, sameOrigin: origin === location.origin, results };
                    });
                } finally { if (navigation) server.release(); }
                if (replacement) await replacement;
                expect(observation.sameDocument).toBe(true);
                expect(observation.sameOrigin).toBe(true);
                expect(browserEvents).toEqual([]);
                const reachedServer = server.reads() - before;
                if (!navigation) {
                    expect(reachedServer).toBe(2);
                    expect(observation.results.every(result => result.status === 200 && !result.caught)).toBe(true);
                    expect(pageErrors).toEqual([]);
                } else {
                    // Assert provenance with the pinned WebKit, not just matching
                    // error text. A changed engine needs this experiment reviewed.
                    expect(reachedServer).toBe(0);
                    expect(observation.results.every(result => result.caught && result.name === 'TypeError')).toBe(true);
                    expect(pageErrors).toHaveLength(2);
                    for (const error of pageErrors) {
                        expect(error.name).toBe('Fetch API cannot load http');
                        expect(error.message).toContain('due to access control checks.');
                        expect(error.stack).toContain('Fetch API cannot load http://127.0.0.1:');
                    }
                }
                evidence.push({ navigation, reachedServer, observation, pageErrors, browserEvents });
            } finally { await context.close(); }
        }
    } finally {
        await server.close();
        await testInfo.attach('webkit-native-navigation-diagnostics', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    }
});

test('WebKit error observation retains real uncaught exceptions and promise rejections', async ({ browser }) => {
    const server = await fixture();
    const context = await browser.newContext();
    try {
        const { page, browserEvents, pageErrors } = await observe(context);
        await page.goto(server.origin);
        await page.evaluate(() => {
            setTimeout(() => { throw new Error('Uncaught exception sentinel'); }, 0);
            void Promise.reject(new Error('Unhandled rejection sentinel'));
        });
        await expect.poll(() => browserEvents.length).toBe(2);
        await expect.poll(() => pageErrors.length).toBe(2);
        assert.deepEqual(new Set(browserEvents.map(event => event.kind)), new Set(['window.error', 'unhandledrejection']));
        expect(pageErrors.some(error => error.message.includes('Uncaught exception sentinel'))).toBe(true);
        expect(pageErrors.some(error => error.message.includes('Unhandled rejection sentinel'))).toBe(true);
        expect(pageErrors.every(error => !error.name.startsWith('Fetch API cannot load '))).toBe(true);
    } finally {
        await context.close();
        await server.close();
    }
});
