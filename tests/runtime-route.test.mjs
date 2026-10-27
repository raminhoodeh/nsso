import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync, globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

globalThis.AsyncLocalStorage ??= AsyncLocalStorage
const source = new URL('../src/', import.meta.url), previous = { ...process.env }
const moduleUrl = value => `data:text/javascript,${encodeURIComponent(value)}`
const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: moduleUrl('export {}'), shortCircuit: true }
    if (specifier === 'next/server') return next('next/server.js', context)
    if (specifier === '@supabase/ssr') return { url: moduleUrl('export const createServerClient=()=>{throw Error("API proxy must not initialize Auth")};'), shortCircuit: true }
    if (specifier === '@/lib/supabase/server') return { url: moduleUrl('export const createClient=async()=>{throw Error("Unexpected Auth during proxy preflight")};'), shortCircuit: true }
    if (specifier === '@supabase/supabase-js') return { url: moduleUrl('export const createClient=()=>({rpc:async(name,args)=>{globalThis.__runtimeRouteCalls.push({name,args});globalThis.__runtimeRouteOrder.push("limiter");if(globalThis.__runtimeRouteThrow)throw Error("PRIVATE_LIMITER_DETAIL");return globalThis.__runtimeRouteResult}});'), shortCircuit: true }
    if (specifier.startsWith('@/')) return next(new URL(`${specifier.slice(2)}.ts`, source).href, context)
    if (specifier.startsWith('.') && context.parentURL?.startsWith(source.href)) {
        const url = new URL(`${specifier}.ts`, context.parentURL)
        if (existsSync(fileURLToPath(url))) return next(url.href, context)
    }
    return next(specifier, context)
} })
const { withRuntimeGuard } = await import('../src/lib/server/runtime-route.ts')
const { runtimeScope } = await import('../src/lib/server/runtime-guard.ts')
const { proxy } = await import('../src/proxy.ts')
const { NextRequest } = await import('next/server.js')
hooks.deregister()
beforeEach(() => {
    Object.assign(process.env, { NSSO_CHAT_IP_HASH_SECRET: 'synthetic-local-runtime-secret-at-least32', NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only', VERCEL: '1' })
    globalThis.__runtimeRouteCalls = []; globalThis.__runtimeRouteOrder = []
    globalThis.__runtimeRouteResult = { data: { allowed: true }, error: null }
    globalThis.__runtimeRouteThrow = false
})
after(() => { process.env = previous })
const request = (path = '/api/profile/operations', method = 'POST', extra = {}) => new NextRequest(`https://nsso.test${path}`, {
    method, headers: { 'x-vercel-forwarded-for': '192.0.2.20', origin: 'https://nsso.test', ...extra },
})

test('proxy performs only local API preflight and a successful regional boundary consumes quota exactly once', async () => {
    const req = request()
    const routed = await proxy(req)
    assert.equal(routed.headers.get('x-middleware-next'), '1')
    assert.equal(routed.headers.get('x-frame-options'), 'DENY')
    assert.equal(globalThis.__runtimeRouteCalls.length, 0)
    const context = { params: Promise.resolve({ id: 'synthetic-owner-row' }) }
    const wrapped = withRuntimeGuard(async (actualRequest, actualContext) => {
        globalThis.__runtimeRouteOrder.push('handler')
        assert.equal(actualRequest, req); assert.equal(actualContext, context)
        return new Response('kept', { headers: { Vary: 'Accept', 'Set-Cookie': 'synthetic=rotated; Path=/' } })
    })
    const response = await wrapped(req, context)
    assert.equal(globalThis.__runtimeRouteCalls.length, 1)
    assert.deepEqual(globalThis.__runtimeRouteOrder, ['limiter', 'handler'])
    assert.equal(globalThis.__runtimeRouteCalls[0].name, 'consume_nsso_request_limit')
    assert.equal(globalThis.__runtimeRouteCalls[0].args.p_scope, 'mutation')
    assert.equal(response.headers.get('vary'), 'Accept, Cookie')
    assert.equal(response.headers.get('set-cookie'), 'synthetic=rotated; Path=/')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(await response.text(), 'kept')
})

test('origin and declared-size rejection occur without quota, handler, body or provider work in either boundary', async () => {
    let handlers = 0
    const wrapped = withRuntimeGuard(() => { handlers++; assert.fail('Rejected requests must not enter the handler') })
    for (const [headers, status] of [[{ origin: 'https://outside.test' }, 403], [{ 'sec-fetch-site': 'cross-site' }, 403], [{ 'content-length': '9999999' }, 413]]) {
        const req = request('/api/profile/operations', 'POST', headers)
        assert.equal((await proxy(req)).status, status)
        assert.equal((await wrapped(req, undefined)).status, status)
    }
    assert.equal(handlers, 0); assert.equal(globalThis.__runtimeRouteCalls.length, 0)
})

test('quota exhaustion, unavailable/malformed accounting and thrown dependencies fail closed before the handler without retry', async () => {
    const wrapped = withRuntimeGuard(() => assert.fail('Denied accounting must not enter a handler'))
    for (const [result, throws, status] of [
        [{ data: { allowed: false }, error: null }, false, 429],
        [{ data: null, error: { message: 'PRIVATE_LIMITER_DETAIL' } }, false, 503],
        [{ data: { allowed: 'not-a-boolean' }, error: null }, false, 503],
        [{}, true, 503],
    ]) {
        globalThis.__runtimeRouteCalls = []; globalThis.__runtimeRouteResult = result; globalThis.__runtimeRouteThrow = throws
        const response = await wrapped(request(), undefined)
        assert.equal(response.status, status); assert.equal(globalThis.__runtimeRouteCalls.length, 1)
        assert.equal(response.headers.get('cache-control'), 'private, no-store')
        assert.equal(response.headers.get('vary'), 'Cookie')
        assert.match(response.headers.get('x-request-id'), /^[a-f0-9-]{36}$/)
        assert.doesNotMatch(await response.text(), /PRIVATE_LIMITER_DETAIL/)
    }
})

test('untrusted bypass headers cannot skip quota and missing production accounting configuration cannot allow work', async () => {
    const wrapped = withRuntimeGuard(() => Response.json({ ok: true }))
    assert.equal((await wrapped(request('/api/profile/operations', 'POST', { 'x-nsso-runtime-checked': '1', 'x-middleware-skip': '1' }), undefined)).status, 200)
    assert.equal(globalThis.__runtimeRouteCalls.length, 1)
    delete process.env.NSSO_CHAT_IP_HASH_SECRET
    assert.equal((await wrapped(request(), undefined)).status, 503)
    assert.equal(globalThis.__runtimeRouteCalls.length, 1)
})

test('streams stay unbuffered and existing Cookie or wildcard Vary dimensions are preserved', async () => {
    for (const vary of ['Accept, cOoKiE', '*']) {
        const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('first chunk')); controller.close() } })
        const response = await withRuntimeGuard(() => new Response(stream, { headers: { Vary: vary } }))(request('/api/deity/chat'), undefined)
        assert.equal(response.body, stream); assert.equal(response.body.locked, false)
        assert.equal(response.headers.get('vary'), vary)
        assert.equal(await response.text(), 'first chunk')
    }
})

const scopeInventory = [
    ['GET', '/api/admin/users', null], ['POST', '/api/admin/users', 'mutation'],
    ['POST', '/api/cancel-subscription', null], ['GET', '/api/check-username', 'lookup'],
    ['POST', '/api/claim-free-domain', 'mutation'], ['POST', '/api/cron/process-feed', 'mutation'],
    ['POST', '/api/deity/chat', 'chat'], ['POST', '/api/deity/places', 'chat'], ['POST', '/api/deity/validate-link', null],
    ['POST', '/api/earnings/paypal', 'mutation'], ['GET', '/api/earnings/stats', null], ['GET', '/api/health', 'health'],
    ['GET', '/api/me', null], ['POST', '/api/me/settings', 'mutation'], ['POST', '/api/my-nsso/connect', 'mutation'],
    ['PATCH', '/api/my-nsso/connections/[id]', 'mutation'], ['DELETE', '/api/my-nsso/connections/[id]', 'mutation'],
    ['GET', '/api/my-nsso/connections', null], ['GET', '/api/news-feed/[postId]/comments', null],
    ['POST', '/api/news-feed/[postId]/comments', 'mutation'], ['POST', '/api/news-feed/[postId]/like', 'mutation'],
    ['DELETE', '/api/news-feed/[postId]/like', 'mutation'], ['GET', '/api/news-feed', null], ['POST', '/api/news-feed', 'mutation'],
    ['GET', '/api/places/photo', 'photo'], ['POST', '/api/polar-checkout', null], ['POST', '/api/products/[id]/payment', 'mutation'],
    ['POST', '/api/profile/media', 'upload'], ['POST', '/api/profile/operations', 'mutation'], ['GET', '/api/profile/operations', null],
    ['POST', '/api/profile/operations/undo', 'mutation'], ['POST', '/api/razinflix/add', 'film_write'], ['POST', '/api/razinflix/delete', 'film_write'],
    ['GET', '/api/razinflix/hero/[videoId]', 'film_media'], ['GET', '/api/razinflix/trailer/[videoId]', 'film_media'],
    ['POST', '/api/razinflix/update', 'film_write'], ['POST', '/api/update-username', 'mutation'], ['POST', '/api/webhooks/polar', null],
]

test('every existing API method preserves its former scope and four retired POST exemptions remain inert', async () => {
    let scoped = 0
    for (const [method, path, expected] of scopeInventory) {
        assert.equal(runtimeScope(path, method), expected, `${method} ${path}`)
        globalThis.__runtimeRouteCalls = []
        const response = await withRuntimeGuard(() => new Response(null, { status: 204 }))(request(path, method), undefined)
        assert.equal(response.status, 204)
        assert.equal(globalThis.__runtimeRouteCalls.length, expected ? 1 : 0, `${method} ${path}`)
        if (expected) { scoped++; assert.equal(globalThis.__runtimeRouteCalls[0].args.p_scope, expected) }
    }
    assert.equal(scoped, 27); assert.equal(scopeInventory.length, 38)
    assert.deepEqual(scopeInventory.filter(([method, , scope]) => method === 'POST' && !scope).map(([, path]) => path).sort(), [
        '/api/cancel-subscription', '/api/deity/validate-link', '/api/polar-checkout', '/api/webhooks/polar',
    ])
})

test('AST inventory rejects an unwrapped or aliased API export and covers every registered route method', () => {
    const root = new URL('../', import.meta.url), methodNames = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
    const expected = new Set(scopeInventory.map(([method, path]) => `${method} ${path}`)), found = new Set()
    for (const file of globSync('src/app/api/**/route.ts', { cwd: fileURLToPath(root) })) {
        const text = readFileSync(new URL(file, root), 'utf8')
        const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
        let hasImport = false
        for (const statement of parsed.statements) {
            if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === '@/lib/server/runtime-route') {
                hasImport = statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
                    && statement.importClause.namedBindings.elements.some(binding => binding.name.text === 'withRuntimeGuard' && !binding.propertyName)
            }
            if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
                assert.equal(statement.exportClause.elements.some(item => methodNames.has(item.name.text)), false, `Aliased API method in ${file}`)
            }
            if (!statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue
            if (ts.isFunctionDeclaration(statement) && methodNames.has(statement.name?.text)) assert.fail(`Unwrapped API function in ${file}`)
            if (!ts.isVariableStatement(statement)) continue
            for (const declaration of statement.declarationList.declarations) {
                assert.ok(ts.isIdentifier(declaration.name), `Review destructured API exports in ${file}`)
                if (!methodNames.has(declaration.name.text)) continue
                const initializer = declaration.initializer
                assert.ok(initializer && ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression)
                    && initializer.expression.text === 'withRuntimeGuard' && initializer.arguments.length === 1, `Unwrapped API method in ${file}`)
                const route = '/' + file.slice('src/app/'.length, -'/route.ts'.length)
                found.add(`${declaration.name.text} ${route}`)
            }
        }
        assert.ok(hasImport, `Missing canonical guard import in ${file}`)
    }
    assert.deepEqual([...found].sort(), [...expected].sort(), 'Review scope inventory whenever API routes are added or removed')
})

test('Node functions are colocated in Dublin without plan changes or unreviewed per-function overrides', () => {
    const configuration = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
    assert.deepEqual(configuration, { $schema: 'https://openapi.vercel.sh/vercel.json', regions: ['dub1'] })
})
