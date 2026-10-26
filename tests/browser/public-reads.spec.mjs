import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle
test.beforeAll(async () => {
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://public-fixture.supabase.co"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"synthetic-anonymous-key"' },
        plugins: [{ name: 'public-catalog-presentation', setup(builder) {
            builder.onResolve({ filter: /\.module\.css$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onResolve({ filter: /^@\/components\/(?:film\/|ui\/tahoe-glass$|ui\/Toast$|agent\/ConditionalNSSOAgent$|providers\/UserProvider$)/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path.endsWith('.css') ? 'export default {};' : path.endsWith('UserProvider') ? 'export const useUser=()=>({user:null,loading:false,error:"Synthetic Auth outage"});'
                    : path.endsWith('CategoryRow') ? 'import React from "react";export default function Row({title,films}){return <section><h2>{title}</h2>{films.map(film=><p key={film.id}>{film.title}</p>)}</section>}'
                        : path.endsWith('tahoe-glass') ? 'import React from "react";const Surface=({children})=><div>{children}</div>;export const TahoeGlassProvider=Surface,TahoeBackdropHeader=Surface,TahoeGlassSurface=Surface,TahoeGlassField=Surface;export const TahoeGlassButton=({children,onClick})=><button onClick={onClick}>{children}</button>;'
                            : path.endsWith('Toast') ? 'export const ToastViewport=()=>null;' : 'export default ()=>null;' }))
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Page from './src/app/film/razinflix/page';createRoot(document.getElementById('root')).render(<Page/>);` },
    })
    bundle = result.outputFiles[0].text
})

test('real RazinFlix catalog remains readable with expired persisted credentials and an unavailable Auth service', async ({ page }) => {
    const authRequests = [], publicRequests = []
    await page.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin === 'https://nsso.test') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
        if (url.origin !== 'https://public-fixture.supabase.co') throw new Error('Unexpected public fixture request')
        if (url.pathname.startsWith('/auth/')) { authRequests.push(url.pathname); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic Auth outage"}' }) }
        expect(url.pathname).toBe('/rest/v1/razinflix_films')
        expect(route.request().headers().authorization).toBe('Bearer synthetic-anonymous-key')
        publicRequests.push(url.pathname)
        return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([{ id: 1, title: 'Public synthetic film', categories: ['New'], description: 'Public catalog fixture', trailer_key: null }]) })
    })
    await page.goto('https://nsso.test/public-fixture')
    await page.evaluate(() => {
        localStorage.setItem('sb-public-fixture-auth-token', JSON.stringify({ access_token: 'expired-synthetic-token', refresh_token: 'synthetic-refresh-token', expires_at: 1, user: { id: 'previous-private-subject' } }))
    })
    await page.addScriptTag({ content: bundle })
    await expect(page.getByText('Public synthetic film', { exact: true })).toBeVisible()
    await expect(page.getByText('Loading from Razin database...')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add Film' })).toHaveCount(0)
    expect(publicRequests).toHaveLength(1)
    expect(authRequests).toEqual([])
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sb-public-fixture-auth-token')).access_token)).toBe('expired-synthetic-token')
})
