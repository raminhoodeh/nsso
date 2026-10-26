import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { collectBuildStaticHashes, assertHashCoverage, inlineScriptHashes } from '../scripts/security/build-with-csp.mjs'

async function fixture(run) {
    const repo = await mkdtemp(resolve(tmpdir(), 'nsso-csp-artifacts-'))
    const write = async (name, value) => { const path = resolve(repo, name); await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value)) }
    await write('.next/prerender-manifest.json', { version: 4, routes: { '/': { srcRoute: '/', initialRevalidateSeconds: false }, '/sign-in': { srcRoute: '/sign-in', initialRevalidateSeconds: false }, '/_not-found': { srcRoute: '/_not-found', initialRevalidateSeconds: false }, '/favicon.ico': { srcRoute: '/favicon.ico', initialRevalidateSeconds: false } } })
    await write('.next/app-path-routes-manifest.json', { '/page': '/', '/sign-in/page': '/sign-in', '/_not-found/page': '/_not-found', '/favicon.ico/route': '/favicon.ico' })
    try { await run({ repo, write }) } finally { await rm(repo, { recursive: true, force: true }) }
}
const html = '<script>window.syntheticReady=true</script>'

test('Next extraction requires every manifest page and includes literal public HTML without counting static APIs', async () => fixture(async ({ repo, write }) => {
    for (const name of ['index', 'sign-in', '_not-found']) await write(`.next/server/app/${name}.html`, html)
    await write('public/map/index.html', '<script>window.publicMap=true</script>')
    const { manifest, proof } = await collectBuildStaticHashes(repo, 'fixture')
    assert.deepEqual(proof.expectedRoutes, ['/', '/_not-found', '/sign-in'])
    assert.equal(proof.output, 'next-server'); assert.equal(proof.artifacts.length, 4)
    assert.deepEqual(manifest.routes['/map/index.html'], inlineScriptHashes('<script>window.publicMap=true</script>'))
    await rm(resolve(repo, '.next/server/app/sign-in.html'))
    await assert.rejects(collectBuildStaticHashes(repo, 'fixture'), /missing.*\/sign-in/)
}))

test('Vercel adapter extraction reads actual prerender fallbacks and special404 bytes after original HTML is pruned', async () => fixture(async ({ repo, write }) => {
    await write('.next/output/config.json', { version: 3, overrides: { '404.html': { path: '404', contentType: 'text/html' } } })
    await write('.next/output/static/404.html', html)
    await write('.next/output/static/map/index.html', '<script>window.map=true</script>')
    for (const name of ['index', 'sign-in']) {
        await write(`.next/output/functions/${name}.prerender-config.json`, { expiration: false, fallback: `${name}.prerender-fallback.html`, initialHeaders: { 'content-type': 'text/html; charset=utf-8' } })
        await write(`.next/output/functions/${name}.prerender-fallback.html`, html)
    }
    // A bundled runtime copy is not the served document and must be ignored.
    await write('.next/output/functions/sign-in.func/.next/server/app/sign-in.html', '<script>window.wrongCopy=true</script>')
    const first = await collectBuildStaticHashes(repo, 'fixture', { requireAdapter: true })
    assert.equal(first.proof.output, 'vercel-build-output-v3')
    assert.deepEqual(first.manifest.routes['/'], inlineScriptHashes(html))
    assert.deepEqual(first.manifest.routes['/_not-found'], inlineScriptHashes(html))
    assert.ok(first.manifest.routes['/map/index.html'])
    assert.equal(first.proof.artifacts.length, 4)
    await write('.next/output/functions/sign-in.prerender-fallback.html', '<script>window.changed=true</script>')
    const second = await collectBuildStaticHashes(repo, 'fixture', { requireAdapter: true })
    assert.throws(() => assertHashCoverage(second.manifest, first.manifest), /refusing an unsafe artifact/)
    await rm(resolve(repo, '.next/output/functions/sign-in.prerender-fallback.html'))
    await assert.rejects(collectBuildStaticHashes(repo, 'fixture', { requireAdapter: true }), /ENOENT/)
}))

test('empty, partial, stale, unsupported and ISR artifacts fail rather than certifying zero routes', async () => fixture(async ({ repo, write }) => {
    await assert.rejects(collectBuildStaticHashes(repo, 'fixture'), /Static HTML missing/)
    await write('.vercel/output/config.json', { version: 3 })
    await write('.vercel/output/static/index.html', html)
    await assert.rejects(collectBuildStaticHashes(repo, 'fixture', { requireAdapter: true }), /adapter output is missing/)
    assert.throws(() => assertHashCoverage({ routes: {} }, { routes: {} }), /empty/)
    assert.throws(() => assertHashCoverage({ routes: { '/': [] } }, { routes: { '/': [], '/missing': [] } }), /coverage changed/)
    const prerender = JSON.parse(await readFile(resolve(repo, '.next/prerender-manifest.json'), 'utf8'))
    prerender.routes['/'].initialRevalidateSeconds = 60
    await write('.next/prerender-manifest.json', prerender)
    await assert.rejects(collectBuildStaticHashes(repo, 'fixture'), /ISR/)
    prerender.routes = {}; await write('.next/prerender-manifest.json', prerender)
    await assert.rejects(collectBuildStaticHashes(repo, 'fixture'), /No expected static/)
}))
