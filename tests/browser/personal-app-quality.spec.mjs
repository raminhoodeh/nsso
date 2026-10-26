import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zZkAAAAASUVORK5CYII=', 'base64')
const film = { id: 1, title: 'Synthetic featured film', year: '2026', rating: '8/10', poster: 'https://images.test/poster.jpg', description: 'A fixture journey.', director: 'Fixture director', categories: ['New'], trailer_key: 'FIXTURE1234' }
const placeName = 'The Courtyard — Al Quoz'
let bundles

async function bundle(app) {
    const result = await build({ absWorkingDir: root, bundle: true, write: false, outdir: '/virtual-personal-app-fixture', platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://public-fixture.supabase.co"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"synthetic-anonymous-key"', 'process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY': '"synthetic-maps-key"' },
        plugins: [{ name: 'isolated-provider-and-glass', setup(builder) {
            const mock = /^(?:next\/(?:image|link)|@googlemaps\/js-api-loader|@\/components\/ui\/tahoe-glass|@\/components\/providers\/UserProvider|@\/components\/agent\/ConditionalNSSOAgent)$/
            builder.onResolve({ filter: mock }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onResolve({ filter: /^\.\/PlacesDeity$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/image' ? 'import React from "react";export default function Image({fill,unoptimized,priority,...props}){return <img {...props}/>;}'
                    : path === 'next/link' ? 'import React from "react";export default function Link(props){return <a {...props}/>;}'
                        : path.includes('UserProvider') ? 'export const useUser=()=>({user:window.__fixtureUser||null,loading:false});'
                            : path.includes('ConditionalNSSOAgent') || path.includes('PlacesDeity') ? 'export default ()=>null;'
                                : path === '@googlemaps/js-api-loader' ? `export const setOptions=()=>{};export async function importLibrary(library){if(library!=='places')throw Error('Synthetic Maps outage');return {Place:class {constructor({id}){this.id=id;this.photos=[];this.formattedAddress='Synthetic current address';this.googleMapsURI='https://www.google.com/maps/search/?api=1&query=fixture';}async fetchFields(){window.__placeRequests=(window.__placeRequests||0)+1;if(window.__detailsMode==='pending')await new Promise(resolve=>{window.__resolveDetails=resolve;});}}};}`
                                    : `import React,{forwardRef} from 'react';
const allowed=props=>Object.fromEntries(Object.entries(props).filter(([key])=>key==='id'||key==='role'||key==='style'||key==='type'||key==='disabled'||key==='hidden'||key==='inert'||key==='tabIndex'||key==='title'||key==='href'||key==='target'||key==='rel'||key==='download'||key.startsWith('on')||key.startsWith('aria-')||key.startsWith('data-')));
const Surface=forwardRef(function Surface({as:Tag='div',children,className,contentClassName,...props},ref){return <Tag {...allowed(props)} ref={ref} className={className}><div className={contentClassName}>{children}</div></Tag>});
export const TahoeGlassSurface=Surface,TahoeBackdropHeader=Surface;
export const TahoeGlassProvider=({scene,children})=><>{scene}{children}</>;
export const TahoeGlassButton=forwardRef(function Button({as:Tag='button',...props},ref){return <Tag {...allowed(props)} ref={ref} type={Tag==='button'?'button':undefined} className={props.className}>{props.children}</Tag>});
export const TahoeGlassField=({label,children})=><label>{label}{children}</label>;
export const TahoeGlassDialog=({open,title,description,children})=>open?<section role="dialog" aria-label={title} data-tahoe-glass-dialog-overlay="true" style={{position:'fixed',inset:'20%',zIndex:2147483647,background:'#222',color:'#fff'}}><h2>{title}</h2><p>{description}</p>{children}</section>:null;
export const useTahoeModalAccessibility=()=>{};` }))
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ToastProvider} from './src/components/ui/Toast';
${app === 'film' ? "import Page from './src/app/film/razinflix/page';const content=<Page/>;" : "import Page from './src/app/places/dubai/PlacesExplorer';import {dubaiPlaces} from './src/data/places-dubai';const payload={...dubaiPlaces,places:dubaiPlaces.places.filter(place=>['the-courtyard-al-quoz','kefi-books-board-games-cafe'].includes(place.id))};const content=<Page payload={payload}/>;"}
createRoot(document.getElementById('root')).render(<ToastProvider>{content}</ToastProvider>);` },
    })
    return { js: result.outputFiles.find(file => file.path.endsWith('.js')).text, css: result.outputFiles.find(file => file.path.endsWith('.css'))?.text || '' }
}
test.beforeAll(async () => { bundles = Object.fromEntries(await Promise.all(['film', 'places'].map(async app => [app, await bundle(app)]))) })

async function mount(page, app, { catalog = [film], failedReads = 0, manager = false, storage = 'normal', details = 'normal', updatedFilm = { ...film, title: 'Updated featured film' } } = {}) {
    const errors = [], requests = []
    let reads = 0
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(({ manager, storage, details }) => {
        window.__fixtureUser = manager ? { id: 'synthetic-editor', permissions: ['razinflix:manage'] } : null
        window.__detailsMode = details
        if (storage === 'blocked') for (const method of ['getItem', 'setItem', 'removeItem']) Storage.prototype[method] = function () { throw new DOMException('Synthetic storage unavailable', 'SecurityError') }
        if (storage === 'malformed' && localStorage.getItem('nsso-uae-place-favourites') === null) localStorage.setItem('nsso-uae-place-favourites', '{broken')
        if (storage === 'invalid-shape' && localStorage.getItem('nsso-uae-place-favourites') === null) localStorage.setItem('nsso-uae-place-favourites', '"not-an-id-list"')
    }, { manager, storage, details })
    await page.route('**/*', async route => {
        const url = new URL(route.request().url()); requests.push({ path: url.pathname, method: route.request().method() })
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundles[app].js })
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: bundles[app].css + '\n[hidden]{display:none!important}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}' })
        if (url.pathname.startsWith('/rest/v1/')) {
            expect(url.pathname).toBe('/rest/v1/razinflix_films')
            expect(route.request().headers().authorization).toBe('Bearer synthetic-anonymous-key')
            return route.fulfill({ status: reads++ < failedReads ? 503 : 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: reads <= failedReads ? '{"message":"Synthetic catalog outage"}' : JSON.stringify(catalog) })
        }
        if (url.pathname === '/api/razinflix/update') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ film: updatedFilm }) })
        if (url.pathname === '/api/razinflix/delete') return route.fulfill({ contentType: 'application/json', body: '{"success":true}' })
        if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: pixel })
        if (url.hostname === 'www.youtube.com') return route.fulfill({ contentType: 'text/html', body: '<p>Trailer fixture</p>' })
        if (url.origin !== 'https://nsso.test') throw new Error('Unexpected provider request in personal app fixture')
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/' + (app === 'film' ? 'film/razinflix' : 'places/dubai'))
    return { errors, requests, reads: () => reads }
}

test('a failed catalogue read explains the failure and retries while preserving search and view', async ({ page }) => {
    const state = await mount(page, 'film', { failedReads: 1 })
    await expect(page.getByRole('alert')).toContainText('Films could not load')
    await page.getByRole('searchbox', { name: 'Search films' }).fill('fixture journey')
    await page.getByLabel('Film view').selectOption('alpha')
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('button', { name: `Open details for ${film.title}` })).toBeVisible()
    await expect(page.getByRole('searchbox', { name: 'Search films' })).toHaveValue('fixture journey')
    await expect(page.getByLabel('Film view')).toHaveValue('alpha')
    expect(state.reads()).toBe(2); expect(state.errors).toEqual([])
    expect(state.requests.some(request => request.path.startsWith('/auth/'))).toBe(false)
})

test('an empty catalogue has an explicit empty state instead of a blank page', async ({ page }) => {
    const state = await mount(page, 'film', { catalog: [] })
    await expect(page.getByRole('status')).toContainText('No films are available yet')
    expect(state.reads()).toBe(1); expect(state.errors).toEqual([])
})

test('editing and deleting a featured film updates the hero immediately without reopening a deleted record', async ({ page }) => {
    const state = await mount(page, 'film', { manager: true })
    await page.getByRole('button', { name: 'More Info', exact: true }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('textbox', { name: 'Film title', exact: true }).fill('Updated featured film')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Film details: Updated featured film' })).toBeVisible()
    await page.getByRole('button', { name: 'Close film details' }).click()
    await expect(page.locator('h1')).toHaveText('Updated featured film')
    await page.getByRole('button', { name: 'More Info', exact: true }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('dialog', { name: 'Delete film?' }).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('button', { name: 'More Info', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Open details for/ })).toHaveCount(0)
    expect(state.errors).toEqual([])
})

test('removing a featured trailer keeps the film browsable without requesting a missing hero video', async ({ page }) => {
    const state = await mount(page, 'film', { manager: true, updatedFilm: { ...film, trailer_key: null } })
    await page.getByRole('button', { name: 'More Info', exact: true }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('textbox', { name: 'YouTube URL or Key' }).fill('')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('dialog', { name: `Film details: ${film.title}` }).getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Close film details' }).click()
    await expect(page.getByRole('button', { name: 'More Info', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Open details for ${film.title}` })).toBeVisible()
    expect(state.requests.some(request => /\/hero\/(null|undefined)$/.test(request.path))).toBe(false)
    expect(state.errors).toEqual([])
})

async function findCourtyard(page) {
    const browse = page.getByRole('button', { name: 'Explore', exact: true })
    if (await browse.isVisible()) await browse.click()
    await page.getByRole('searchbox', { name: 'Search places' }).fill('Courtyard')
}

test('unavailable browser storage does not crash Places and saved places still work for the visit', async ({ page }) => {
    const state = await mount(page, 'places', { storage: 'blocked' })
    await findCourtyard(page)
    await page.getByRole('button', { name: `Save ${placeName}`, exact: true }).click()
    await expect(page.getByRole('button', { name: `Remove ${placeName} from saved places` })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dismiss notification: Changes to saved places will last for this visit only.' })).toBeVisible()
    await page.getByRole('button', { name: `Remove ${placeName} from saved places` }).click()
    await expect(page.getByRole('button', { name: `Save ${placeName}`, exact: true })).toBeVisible()
    expect(state.errors).toEqual([])
    expect(state.requests.some(request => request.path.startsWith('/api/deity'))).toBe(false)
})

test('saved-place persistence retains only valid catalog IDs and survives a reload', async ({ page }) => {
    const state = await mount(page, 'places', { storage: 'invalid-shape' })
    await findCourtyard(page)
    await page.getByRole('button', { name: `Save ${placeName}`, exact: true }).click()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nsso-uae-place-favourites')))).toEqual(['the-courtyard-al-quoz'])
    await page.reload()
    await findCourtyard(page)
    await expect(page.getByRole('button', { name: `Remove ${placeName} from saved places` })).toBeVisible()
    expect(state.errors).toEqual([])
})

test('hung place details stop loading and a late response cannot replace the static fallback', async ({ page }, testInfo) => {
    await page.clock.install()
    const state = await mount(page, 'places', { details: 'pending' })
    await findCourtyard(page)
    await page.getByRole('button', { name: /Arts & culture.*The Courtyard/ }).click()
    await expect.poll(() => page.evaluate(() => window.__placeRequests || 0)).toBe(1)
    if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: `Expand Details for ${placeName} sheet` }).click()
    await page.clock.fastForward(8_100)
    await expect(page.getByText(/Photos are loading|Finding photos/)).toHaveCount(0)
    const directions = page.getByRole('link', { name: /^(Get directions|Directions)$/i })
    await expect(directions).toHaveAttribute('href', /google\.com\/maps\/dir/)
    await page.evaluate(() => window.__resolveDetails())
    await expect(page.getByText('Synthetic current address', { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => window.__placeRequests)).toBe(1)
    expect(state.errors).toEqual([])
})
