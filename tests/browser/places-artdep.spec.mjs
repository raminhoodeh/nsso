import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const checkedNow = '2026-11-06T18:12:46Z'
const salonTitle = 'ArtDep — Salon of Thinkers: How do you know what you really want?'
const walkTitle = 'ArtDep — Frieze Abu Dhabi Guided Art Walk'
let bundle, css

// Exercise the real agenda, its date/filter helpers, catalog and CSS module.
// The host only records the map-selection callback; no Maps API, tickets,
// calendar account or external service is contacted by this fixture.
test.beforeAll(async () => {
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser',
        format: 'iife', jsx: 'automatic', outfile: 'places-artdep-fixture.js',
        loader: { '.css': 'local-css' },
        define: { 'process.env.NODE_ENV': '"test"' },
        stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React, {useState} from 'react';
            import {createRoot} from 'react-dom/client';
            import EventsAgenda from './src/app/places/dubai/EventsAgenda';
            import {agendaEntries} from './src/lib/places-agenda';
            import payload from './src/data/places-dubai.generated.json';
            const now=Date.parse(${JSON.stringify(checkedNow)});
            const entries=agendaEntries(payload.places,now).filter(({event})=>event.id.startsWith('artdep-'));
            function App(){
                const [selected,setSelected]=useState(null);
                return <main>
                    <EventsAgenda entries={entries} now={now} onSelectPlace={place=>{
                        window.selectedArtDepVenue={id:place.id,coordinates:place.coordinates,placeId:place.placeId};
                        setSelected(place.name);
                    }}/>
                    <output aria-label="Selected map venue">{selected||'No venue selected'}</output>
                </main>;
            }
            const app=createRoot(document.getElementById('root'));
            window.disposeArtDep=()=>app.unmount();
            app.render(<App/>);
        ` },
    })
    bundle = result.outputFiles.find(file => file.path.endsWith('.js')).text
    css = result.outputFiles.find(file => file.path.endsWith('.css')).text
        + '\n*{box-sizing:border-box}body{margin:0;background:#f4f5f7}main{max-width:460px;margin:0 auto;padding:12px}output{display:block;margin-top:12px;font:14px sans-serif}'
})

async function mount(page) {
    const errors = [], external = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin !== 'https://nsso.test') { external.push(url.href); return route.abort() }
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>' })
    })
    await page.goto('https://nsso.test/places-artdep')
    await expect(page.getByRole('region', { name: 'Current and upcoming events' })).toBeVisible()
    return { errors, external }
}

async function finish(page, state) {
    await page.evaluate(() => window.disposeArtDep())
    expect(state).toEqual({ errors: [], external: [] })
}

test('real ArtDep agenda shows two available dates, complete prices and separate fair admission', async ({ page }) => {
    const state = await mount(page)
    const cards = page.getByRole('article')
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(0).getByRole('heading')).toHaveText(salonTitle)
    await expect(cards.nth(1).getByRole('heading')).toHaveText(walkTitle)
    await expect(page.getByRole('heading', { name: /sold out/i })).toHaveCount(0)
    await expect(cards.nth(0)).toContainText('14 Nov 2026 · 6pm UAE time')
    await expect(cards.nth(0)).toContainText('AED 179 + 5% VAT through 10 Nov; AED 199 + 5% VAT from 11 Nov')
    await expect(cards.nth(0)).toContainText('Cabinet of Curiosity')
    await expect(cards.nth(1)).toContainText('21 Nov 2026 · 2pm UAE time')
    await expect(cards.nth(1)).toContainText('AED 250 + 5% VAT through 6 Nov; AED 280 + 5% VAT from 7 Nov')
    await expect(cards.nth(1)).toContainText('Tour price excludes Frieze Abu Dhabi admission')
    await expect(cards.nth(1)).toContainText('this pin marks the venue, not the group meeting point')
    await expect(cards.nth(1)).toContainText('The 22 November session is sold out')
    await expect(page.getByText('Source checked', { exact: false })).toHaveCount(2)
    for (const card of await cards.all()) {
        await expect(card).toContainText('6 Nov 2026')
        await expect(card).toContainText('end time is unpublished', { ignoreCase: true })
        await expect(card).toContainText('Calendar reminder, not a booking.')
        const source = card.getByRole('link', { name: /^Official details/ })
        await expect(source).toHaveAttribute('href', 'https://www.artdepuae.com/real-estate-listing')
        await expect(source).toHaveAttribute('target', '_blank')
        await expect(source).toHaveAttribute('rel', 'noopener noreferrer')
    }
    const calendars = cards.getByRole('link', { name: /^Add .* to Google Calendar/ })
    for (const [index, dates] of ['20261114/20261115', '20261121/20261122'].entries()) {
        const link = new URL(await calendars.nth(index).getAttribute('href'))
        expect(link.origin).toBe('https://calendar.google.com')
        expect(link.searchParams.get('dates')).toBe(dates)
        expect(link.searchParams.get('ctz')).toBe('Asia/Dubai')
        expect(link.searchParams.get('details')).toContain('not a booking')
    }
    await finish(page, state)
})

test('ArtDep map actions select the existing Dubai venue and the distinct Abu Dhabi venue', async ({ page }, testInfo) => {
    const state = await mount(page)
    for (const [title, name, id, placeId] of [
        [salonTitle, 'Cabinet of Curiosity', 'cabinet-of-curiosity', 'ChIJTRRv8d1rXz4RYOp5SgWgZic'],
        [walkTitle, 'Manarat Al Saadiyat', 'manarat-al-saadiyat-events', 'ChIJdyeUFkJnXj4RZ37L2WWmKpo'],
    ]) {
        const action = page.getByRole('button', { name: `View ${title} at ${name} on the map`, exact: true })
        if (testInfo.project.name === 'mobile') await action.tap()
        else { await action.focus(); await page.keyboard.press('Enter') }
        await expect(page.getByLabel('Selected map venue')).toHaveText(name)
        const selected = await page.evaluate(() => window.selectedArtDepVenue)
        expect(selected.id).toBe(id)
        expect(selected.placeId).toBe(placeId)
        expect(Number.isFinite(selected.coordinates.lat)).toBe(true)
        expect(Number.isFinite(selected.coordinates.lng)).toBe(true)
    }
    await finish(page, state)
})

test('long ArtDep copy and actions remain contained and readable at narrow mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    const state = await mount(page)
    const geometry = await page.getByRole('article').evaluateAll(cards => cards.map(card => {
        const bounds = card.getBoundingClientRect()
        return {
            background: getComputedStyle(card).backgroundColor,
            left: bounds.left, right: bounds.right,
            controls: [...card.querySelectorAll('button,a')].map(control => {
                const rect = control.getBoundingClientRect()
                return { left: rect.left, right: rect.right, height: rect.height }
            }),
        }
    }))
    for (const card of geometry) {
        expect(card.background).toBe('rgb(255, 255, 255)')
        expect(card.left).toBeGreaterThanOrEqual(0)
        expect(card.right).toBeLessThanOrEqual(320)
        for (const control of card.controls) {
            expect(control.left).toBeGreaterThanOrEqual(card.left)
            expect(control.right).toBeLessThanOrEqual(card.right)
            expect(control.height).toBeGreaterThanOrEqual(44)
        }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await finish(page, state)
})
