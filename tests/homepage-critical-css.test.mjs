import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { inspectHomepageCriticalCss, verifyHomepageCriticalCss } from '../scripts/performance/homepage-critical-css.mjs'
import { collectBuildStaticHashes } from '../scripts/security/build-with-csp.mjs'

const css = ':root{--nsso-bg-primary:#5a769d}@layer utilities{.text-5xl{font-size:3rem}}'
const style = `<style data-precedence="next" data-href="/_next/static/chunks/global.css">${css}</style>`
const heading = '<main><h1 class="text-5xl">Homepage fixture</h1></main>'
const html = `<html><head>${style}</head><body>${heading}</body></html>`

test('actual Next-managed global styles precede the heading in either the head or streamed body', () => {
    for (const document of [html, `<html><head></head><body>${style}${heading}</body></html>`]) {
        assert.deepEqual(inspectHomepageCriticalCss(document), { inlineStylesheets: 1, cssBytes: Buffer.byteLength(css), cssPrecedesMainHeading: true, renderBlockingStylesheets: 0 })
    }
    // A print-only or alternate sheet does not block the screen's first paint.
    assert.doesNotThrow(() => inspectHomepageCriticalCss(html.replace('</head>', '<link rel="stylesheet" media="print" href="/print.css"><link rel="alternate stylesheet" href="/alternative.css"></head>')))
})

test('missing, unrelated, inactive and late CSS cannot certify styled first paint', () => {
    for (const replacement of ['', '<style>body{color:white}</style>', style.replace(css, ''), style.replace(css, ':root{--nsso-bg-primary:blue}'), style.replace('data-precedence="next"', 'data-precedence="other"'), style.replace('global.css', 'global.js'), style.replace('<style ', '<style media="not all" ')]) {
        assert.throws(() => inspectHomepageCriticalCss(html.replace(style, replacement)), /inline stylesheet|nsso\/Tailwind styles/)
    }
    assert.throws(() => inspectHomepageCriticalCss(`<html><body>${heading}${style}</body></html>`), /before its main heading/)
    assert.throws(() => inspectHomepageCriticalCss(`<script>${JSON.stringify(style)}</script>${heading}`), /no Next-managed/)
    assert.throws(() => inspectHomepageCriticalCss(html.replace(heading, '<main>No heading</main>')), /no server-rendered/)
})

test('a linked screen stylesheet fails even when inline critical CSS is present', () => {
    for (const link of ['<link rel="stylesheet" href="/global.css">', '<link rel="STYLESHEET" media="screen" href="https://cdn.example/global.css">']) {
        assert.throws(() => inspectHomepageCriticalCss(html.replace('</head>', link + '</head>')), /render-blocking stylesheet/)
    }
})

test('verification follows the served root artifact from CSP extraction, including Vercel fallbacks', async () => {
    const repo = await mkdtemp(resolve(tmpdir(), 'nsso-home-css-'))
    const write = async (name, value) => { const path = resolve(repo, name); await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value)) }
    try {
        await write('.next/prerender-manifest.json', { version: 4, routes: { '/': { srcRoute: '/', initialRevalidateSeconds: false } } })
        await write('.next/app-path-routes-manifest.json', { '/page': '/' })
        await write('.next/server/app/index.html', html)
        let { proof } = await collectBuildStaticHashes(repo, 'fixture')
        let result = await verifyHomepageCriticalCss(repo, proof)
        assert.equal(result.output, 'next-server'); assert.equal(result.artifacts[0].file, '.next/server/app/index.html')

        await write('.next/output/config.json', { version: 3 })
        await write('.next/output/functions/index.prerender-config.json', { expiration: false, fallback: 'served-home.html', initialHeaders: { 'content-type': 'text/html; charset=utf-8' } })
        await write('.next/output/functions/served-home.html', html)
        // Stale original HTML must not be used to approve the served fallback.
        await write('.next/server/app/index.html', '<link rel="stylesheet" href="/old.css">' + heading)
        ;({ proof } = await collectBuildStaticHashes(repo, 'fixture', { requireAdapter: true }))
        result = await verifyHomepageCriticalCss(repo, proof)
        assert.equal(result.output, 'vercel-build-output-v3'); assert.equal(result.artifacts[0].file, '.next/output/functions/served-home.html')
        await write('.next/output/functions/served-home.html', '<link rel="stylesheet" href="/regression.css">' + html)
        await assert.rejects(verifyHomepageCriticalCss(repo, proof), /render-blocking stylesheet/)
        await assert.rejects(verifyHomepageCriticalCss(repo, { ...proof, artifacts: [] }), /Served homepage artifact is missing/)
    } finally { await rm(repo, { recursive: true, force: true }) }
})
