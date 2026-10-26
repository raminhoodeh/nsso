import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises'
import { resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { parse } from 'parse5'
import { verifyHomepageCriticalCss } from '../performance/homepage-critical-css.mjs'

export function inlineScriptHashes(html) {
    const hashes = new Set()
    function visit(node) {
        if (node.tagName === 'script' && !node.attrs.some(attribute => attribute.name === 'src')) {
            const text = (node.childNodes || []).map(child => child.value || '').join('')
            if (text) hashes.add('sha256-' + createHash('sha256').update(text).digest('base64'))
        }
        for (const child of node.childNodes || []) visit(child)
    }
    visit(parse(html))
    return [...hashes].sort()
}

async function matchingFiles(directory, suffix) {
    const files = []
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) }
    catch (error) { if (error.code === 'ENOENT') return files; throw error }
    for (const entry of entries) {
        const path = resolve(directory, entry.name)
        // Function bundles contain private runtime copies, not served HTML.
        if (entry.isDirectory() && !entry.name.endsWith('.func')) files.push(...await matchingFiles(path, suffix))
        else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(path)
    }
    return files.sort()
}

export async function collectStaticHashes(directory, buildId) {
    const routes = {}
    for (const file of await matchingFiles(directory, '.html')) {
        const path = '/' + relative(directory, file).replaceAll('\\', '/').replace(/\.html$/, '')
        routes[path === '/index' ? '/' : path] = inlineScriptHashes(await readFile(file, 'utf8'))
    }
    return { version: 1, buildId, routes }
}

export function assertHashCoverage(actual, approved) {
    const routes = Object.keys(actual.routes).sort(), approvedRoutes = Object.keys(approved.routes).sort()
    if (!routes.length || JSON.stringify(routes) !== JSON.stringify(approvedRoutes)) throw new Error('Static CSP route coverage changed or is empty; refusing an unsafe artifact')
    for (const [route, hashes] of Object.entries(actual.routes)) {
        if (hashes.some(hash => !approved.routes[route]?.includes(hash))) throw new Error(`Static CSP hashes changed between builds for ${route}; refusing an unsafe artifact`)
    }
}

const routePath = value => '/' + value.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
async function exists(path) { try { return (await stat(path)).isDirectory() } catch (error) { if (error.code === 'ENOENT') return false; throw error } }

/** The prerender/page manifests are independent of where an adapter moves HTML. */
export function expectedStaticHtmlRoutes(prerender, appRoutes) {
    if (prerender.version !== 4 || !prerender.routes || !appRoutes || typeof appRoutes !== 'object') throw new Error('Unsupported Next prerender manifests; refusing incomplete CSP coverage')
    const pages = new Set(Object.entries(appRoutes).filter(([source]) => source.endsWith('/page')).map(([, path]) => path))
    const routes = Object.entries(prerender.routes).filter(([path, item]) => pages.has(item.srcRoute ?? path) || pages.has(path)).map(([path]) => path).sort()
    if (!routes.length) throw new Error('No expected static HTML pages found; CSP adapter review required')
    for (const item of Object.values(prerender.routes)) if (item.initialRevalidateSeconds !== false) throw new Error('ISR requires an explicit CSP adapter before release')
    return routes
}

/** Read the actual Next or Vercel Build Output API primitives, never stale .vercel output. */
export async function collectBuildStaticHashes(repo, buildId, { platformOutputDirectory, requireAdapter = Boolean(process.env.NEXT_ADAPTER_PATH) } = {}) {
    const prerender = JSON.parse(await readFile(resolve(repo, '.next/prerender-manifest.json'), 'utf8'))
    const appRoutes = JSON.parse(await readFile(resolve(repo, '.next/app-path-routes-manifest.json'), 'utf8'))
    const expectedRoutes = expectedStaticHtmlRoutes(prerender, appRoutes)
    const adapterDirectory = platformOutputDirectory ?? resolve(repo, '.next/output')
    const adapter = await exists(adapterDirectory)
    if (requireAdapter && !adapter) throw new Error('Vercel adapter output is missing; refusing original/stale HTML as CSP proof')
    const routes = {}, artifacts = []
    async function add(file, aliases, kind) {
        const hashes = inlineScriptHashes(await readFile(file, 'utf8'))
        for (const alias of new Set(aliases)) {
            const path = routePath(alias)
            routes[path] = [...new Set([...(routes[path] ?? []), ...hashes])].sort()
        }
        artifacts.push({ kind, file: relative(repo, file).replaceAll('\\', '/'), routes: [...new Set(aliases.map(routePath))].sort(), hashes })
    }
    if (adapter) {
        const config = JSON.parse(await readFile(resolve(adapterDirectory, 'config.json'), 'utf8'))
        if (config.version !== 3) throw new Error('Unsupported Vercel Build Output API version')
        const staticDirectory = resolve(adapterDirectory, 'static'), functions = resolve(adapterDirectory, 'functions')
        for (const file of await matchingFiles(staticDirectory, '.html')) {
            const name = relative(staticDirectory, file).replaceAll('\\', '/')
            const override = config.overrides?.[name]
            const aliases = ['/' + name, ...(override?.path !== undefined ? [override.path] : [])]
            // Vercel emits Next's special fallback HTML at /404 and /500.
            // These hashes must also protect unknown paths served that fallback.
            if (name === '404.html') aliases.push('/_not-found')
            if (name === '500.html') aliases.push('/_global-error')
            await add(file, aliases, 'vercel-static')
        }
        for (const file of await matchingFiles(functions, '.prerender-config.json')) {
            const config = JSON.parse(await readFile(file, 'utf8'))
            if (typeof config.fallback !== 'string' || !config.fallback.endsWith('.html')) continue
            const fallback = resolve(dirname(file), config.fallback), within = relative(functions, fallback)
            if (within.startsWith('..') || within.startsWith('/') || config.expiration !== false || config.partialFallback || config.chain
                || !/^text\/html\b/i.test(config.initialHeaders?.['content-type'] || '')) throw new Error('Unsupported Vercel HTML fallback; CSP adapter review required')
            const name = relative(functions, file).replaceAll('\\', '/').replace(/\.prerender-config\.json$/, '')
            await add(fallback, [name === 'index' ? '/' : '/' + name], 'vercel-prerender')
        }
    } else {
        const directory = resolve(repo, '.next/server/app')
        for (const file of await matchingFiles(directory, '.html')) {
            const name = relative(directory, file).replaceAll('\\', '/').replace(/\.html$/, '')
            await add(file, [name === 'index' ? '/' : '/' + name], 'next-static')
        }
        // Next serves public HTML bytes unchanged; Vercel copies these into its
        // static primitive. They also need hashes for their literal file URLs.
        const publicDirectory = resolve(repo, 'public')
        for (const file of await matchingFiles(publicDirectory, '.html')) await add(file, ['/' + relative(publicDirectory, file).replaceAll('\\', '/')], 'public-static')
    }
    const missing = expectedRoutes.filter(route => !Object.hasOwn(routes, route))
    if (missing.length) throw new Error(`Static HTML missing from ${adapter ? 'Vercel' : 'Next'} CSP extraction: ${missing.join(', ')}; refusing an unsafe artifact`)
    if (!artifacts.length) throw new Error('No static HTML artifacts found; refusing empty CSP coverage')
    return { manifest: { version: 1, buildId, routes }, proof: { output: adapter ? 'vercel-build-output-v3' : 'next-server', expectedRoutes, artifacts } }
}

async function build() {
    const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)))
    const source = resolve(repo, 'src/lib/server/static-csp-hashes.json')
    const original = await readFile(source)
    const buildId = process.env.NSSO_BUILD_ID || randomUUID().replaceAll('-', '')
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(buildId)) throw new Error('Invalid build identity')
    const run = () => new Promise((accept, reject) => {
        const child = spawn(process.execPath, [resolve(repo, 'node_modules/next/dist/bin/next'), 'build'], { cwd: repo, env: { ...process.env, NSSO_BUILD_ID: buildId }, stdio: 'inherit' })
        child.once('error', reject)
        child.once('close', code => code === 0 ? accept() : reject(new Error('Next build failed')))
    })
    try {
        await writeFile(source, JSON.stringify({ version: 1, buildId: null, routes: {} }) + '\n')
        await run()
        const first = await collectBuildStaticHashes(repo, buildId)
        const approved = first.manifest
        await writeFile(source, JSON.stringify(approved) + '\n')
        await run()
        const final = await collectBuildStaticHashes(repo, buildId)
        const actual = final.manifest
        assertHashCoverage(actual, approved)
        if (JSON.stringify(first.proof.expectedRoutes) !== JSON.stringify(final.proof.expectedRoutes) || first.proof.output !== final.proof.output) throw new Error('Static page inventory/output adapter changed between CSP passes')
        const homepageCss = await verifyHomepageCriticalCss(repo, final.proof)
        await mkdir(resolve(repo, '.next/security'), { recursive: true })
        await writeFile(resolve(repo, '.next/security/static-csp-hashes.json'), JSON.stringify(actual, null, 2) + '\n')
        await writeFile(resolve(repo, '.next/security/csp-build-proof.json'), JSON.stringify(final.proof, null, 2) + '\n')
        await writeFile(resolve(repo, '.next/security/homepage-critical-css.json'), JSON.stringify(homepageCss, null, 2) + '\n')
        console.log(`Verified CSP coverage for ${final.proof.expectedRoutes.length} expected static pages across ${final.proof.artifacts.length} ${final.proof.output} HTML artifacts (${Object.keys(actual.routes).length} route policies); dynamic SSR uses request nonces.`)
        console.log(`Verified inline critical CSS before the homepage heading in ${homepageCss.artifacts.length} served HTML artifact(s).`)
    } finally {
        // The compiled proxy embeds JSON; keep generated hashes in .next, not source control.
        await writeFile(source, original)
    }
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) await build()
