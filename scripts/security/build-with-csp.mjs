import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { parse } from 'parse5'

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

async function htmlFiles(directory) {
    const files = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name)
        if (entry.isDirectory()) files.push(...await htmlFiles(path))
        else if (entry.isFile() && entry.name.endsWith('.html')) files.push(path)
    }
    return files.sort()
}

export async function collectStaticHashes(directory, buildId) {
    const routes = {}
    for (const file of await htmlFiles(directory)) {
        const path = '/' + relative(directory, file).replaceAll('\\', '/').replace(/\.html$/, '')
        routes[path === '/index' ? '/' : path] = inlineScriptHashes(await readFile(file, 'utf8'))
    }
    return { version: 1, buildId, routes }
}

export function assertHashCoverage(actual, approved) {
    for (const [route, hashes] of Object.entries(actual.routes)) {
        if (hashes.some(hash => !approved.routes[route]?.includes(hash))) throw new Error(`Static CSP hashes changed between builds for ${route}; refusing an unsafe artifact`)
    }
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
        const approved = await collectStaticHashes(resolve(repo, '.next/server/app'), buildId)
        await writeFile(source, JSON.stringify(approved) + '\n')
        await run()
        const actual = await collectStaticHashes(resolve(repo, '.next/server/app'), buildId)
        assertHashCoverage(actual, approved)
        const prerender = JSON.parse(await readFile(resolve(repo, '.next/prerender-manifest.json'), 'utf8'))
        for (const route of Object.values(prerender.routes)) if (route.initialRevalidateSeconds !== false) throw new Error('ISR requires an explicit CSP adapter before release')
        await mkdir(resolve(repo, '.next/security'), { recursive: true })
        await writeFile(resolve(repo, '.next/security/static-csp-hashes.json'), JSON.stringify(actual, null, 2) + '\n')
        console.log(`Verified CSP coverage for ${Object.keys(actual.routes).length} static HTML routes; dynamic SSR uses request nonces.`)
    } finally {
        // The compiled proxy embeds JSON; keep generated hashes in .next, not source control.
        await writeFile(source, original)
    }
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) await build()
