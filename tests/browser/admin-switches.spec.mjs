import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expectCompactSwitch } from './helpers/switch-assertions.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const currentId = '11111111-1111-4111-8111-111111111111'
const eligibleId = '22222222-2222-4222-8222-222222222222'
const ineligibleId = '33333333-3333-4333-8333-333333333333'
const users = [
    { id: currentId, email: 'raminhoodeh@gmail.com', username: 'synthetic-current', user_type: 'admin', is_premium: true, permissions: ['nsso:admin'], profiles: { full_name: 'Synthetic current administrator' } },
    { id: eligibleId, email: 'troy@nsso.me', username: 'synthetic-eligible', user_type: 'standard', is_premium: true, permissions: [], profiles: { full_name: 'Synthetic eligible account' } },
    { id: ineligibleId, email: 'synthetic@example.invalid', username: 'synthetic-ineligible', user_type: 'standard', is_premium: true, permissions: [], profiles: { full_name: 'Synthetic ineligible account' } },
]
let bundle, css

test.beforeAll(async () => {
    const files = ['src/app/admin/page.tsx', 'src/components/ui/GlassSwitch.tsx']
    const candidates = files.flatMap(file => {
        const source = ts.createSourceFile(file, readFileSync(root + file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
        const literals = []
        const visit = node => {
            if (ts.isStringLiteralLike(node)) literals.push(node.text)
            if (ts.isTemplateExpression(node)) literals.push(node.head.text, ...node.templateSpans.map(span => span.literal.text))
            ts.forEachChild(node, visit)
        }
        visit(source)
        return literals.flatMap(value => value.split(/\s+/))
    })
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates)
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'synthetic-admin-boundaries', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/navigation|@\/components\/ui\/(?:Toast|GlassCard|tahoe-glass))$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? 'export const useRouter=()=>window.fixtureAdminRouter;'
                    : path.endsWith('/Toast') ? 'export const useToast=()=>({showToast:window.fixtureAdminToast});'
                        : path.endsWith('/GlassCard') ? 'export default ({children,className})=><section className={className}>{children}</section>;'
                            : 'export const TahoeGlassSurface=({children,className,contentClassName})=><div className={className}><div className={contentClassName}>{children}</div></div>;' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import{createRoot}from'react-dom/client';import Admin from './src/app/admin/page';
            window.fixtureAdminNavigation=[];window.fixtureAdminToasts=[];
            window.fixtureAdminRouter={push:path=>window.fixtureAdminNavigation.push(path)};
            window.fixtureAdminToast=(message,type)=>window.fixtureAdminToasts.push({message,type});
            createRoot(document.getElementById('root')).render(<Admin/>);
        ` } })
    bundle = result.outputFiles[0].text
})

async function mount(page, { getStatus = 200, denialCode, postStatus = 200 } = {}) {
    const state = { reads: [], writes: [], errors: [], external: [] }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    page.on('pageerror', error => state.errors.push(error.message))
    await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url())
        if (url.origin !== 'https://nsso.test') { state.external.push(url.href); return route.abort() }
        if (url.pathname === '/admin-switches') return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#43628c;color:white;font-family:Arial}button{font:inherit}#outside-admin-target{min-height:44px}</style><button id="outside-admin-target" type="button">Outside administrator controls</button><div id="root"></div>' })
        if (url.pathname === '/api/admin/users' && request.method() === 'GET') {
            state.reads.push({ path: url.pathname, offset: url.searchParams.get('offset') })
            return route.fulfill({ status: getStatus, json: getStatus === 200 ? { users, currentUserId: currentId, nextOffset: null } : { code: denialCode, error: 'Synthetic access refusal' } })
        }
        if (url.pathname === '/api/admin/users' && request.method() === 'POST') {
            expect(request.headers()['content-type']).toBe('application/json')
            state.writes.push(request.postDataJSON())
            return route.fulfill({ status: postStatus, json: postStatus === 200 ? { success: true } : { error: 'Synthetic permission save unavailable.' } })
        }
        throw Error('Unexpected synthetic administrator request ' + request.method() + ' ' + url.pathname)
    })
    await page.goto('https://nsso.test/admin-switches')
    await page.addStyleTag({ content: css })
    await page.addScriptTag({ content: bundle })
    await expect.poll(() => state.reads.length).toBe(1)
    expect(await page.evaluate(() => innerWidth)).toBe(page.viewportSize().width)
    return state
}

function expectLocalOnly(state) {
    expect(state.errors).toEqual([])
    expect(state.external).toEqual([])
    expect(state.reads).toEqual([{ path: '/api/admin/users', offset: '0' }])
}

test('actual administrator switches preserve controlled state and exact permission grant/revoke requests', async ({ page }) => {
    const state = await mount(page)
    const administrator = page.getByRole('switch', { name: 'Administrator access for troy@nsso.me', exact: true })
    const film = page.getByRole('switch', { name: 'RazinFlix editing for troy@nsso.me', exact: true })
    for (const [control, permission] of [[administrator, 'nsso:admin'], [film, 'razinflix:manage']]) {
        await control.scrollIntoViewIfNeeded()
        await expectCompactSwitch(control, { checked: false })
        await control.press('Space')
        await expect(control).toHaveAttribute('aria-checked', 'true')
        await expectCompactSwitch(control, { checked: true })
        await control.press('Enter')
        await expect(control).toHaveAttribute('aria-checked', 'false')
        await expectCompactSwitch(control, { checked: false })
        expect(state.writes.slice(-2)).toEqual([
            { userId: eligibleId, permission, granted: true },
            { userId: eligibleId, permission, granted: false },
        ])
    }
    expect(state.writes).toHaveLength(4)
    expect(await page.evaluate(() => window.fixtureAdminToasts)).toEqual(Array.from({ length: 4 }, () => ({ message: 'Permission saved.', type: 'success' })))
    expectLocalOnly(state)
})

test('current-account and ineligible administrator switches stay natively disabled without keyboard writes', async ({ page }) => {
    const state = await mount(page)
    const current = page.getByRole('switch', { name: 'Administrator access for raminhoodeh@gmail.com', exact: true })
    const ineligible = page.getByRole('switch', { name: 'Administrator access for synthetic@example.invalid', exact: true })
    await expect(current).toBeDisabled()
    await expect(current).toHaveAttribute('aria-checked', 'true')
    await expect(ineligible).toBeDisabled()
    await expect(ineligible).toHaveAttribute('aria-checked', 'false')
    await expect(ineligible).toHaveAttribute('title', 'Administrator access is limited to the approved email addresses.')
    for (const control of [current, ineligible]) {
        await page.getByRole('button', { name: 'Outside administrator controls', exact: true }).focus()
        await control.evaluate(element => element.focus())
        await expect(control).not.toBeFocused()
        await page.keyboard.press('Space')
        await page.keyboard.press('Enter')
    }
    expect(state.writes).toEqual([])
    expect(await page.evaluate(() => window.fixtureAdminToasts)).toEqual([])
    expectLocalOnly(state)
})

test('a failed administrator permission save retains the controlled switch state and reports its error', async ({ page }) => {
    const state = await mount(page, { postStatus: 503 })
    const control = page.getByRole('switch', { name: 'Administrator access for troy@nsso.me', exact: true })
    await expectCompactSwitch(control, { checked: false })
    await control.press('Enter')
    await expect.poll(() => page.evaluate(() => window.fixtureAdminToasts)).toEqual([{ message: 'Synthetic permission save unavailable.', type: 'error' }])
    await expectCompactSwitch(control, { checked: false })
    expect(state.writes).toEqual([{ userId: eligibleId, permission: 'nsso:admin', granted: true }])
    expectLocalOnly(state)
})

for (const [status, code, destination] of [[401, undefined, '/sign-in'], [403, 'forbidden', '/dashboard'], [403, 'mfa_required', '/dashboard/security?next=/admin']]) {
    test(`administrator GET ${status}${code ? ' ' + code : ''} retains its protected redirect without permission writes`, async ({ page }) => {
        const state = await mount(page, { getStatus: status, denialCode: code })
        await expect.poll(() => page.evaluate(() => window.fixtureAdminNavigation)).toEqual([destination])
        await expect(page.getByRole('switch')).toHaveCount(0)
        expect(state.writes).toEqual([])
        expectLocalOnly(state)
    })
}
