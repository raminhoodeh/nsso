import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const manifest = JSON.parse(fs.readFileSync(new URL('../../docs/places-dubai-future-week-2026-source.json', import.meta.url)))
const publicSessions = manifest.sessions.filter(session => session.accessLevel === 'public')
const eventId = session => `dfw-2026-${session.code.toLowerCase()}`
const now = '2026-11-06T18:12:46Z'
const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: 'numeric', minute: '2-digit', hour12: true })
let bundle, css

// Real agenda, filtering helpers, data and CSS; only the map-selection host is
// replaced. Tickets, calendar accounts and external APIs are never contacted.
test.beforeAll(async () => {
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser',
        format: 'iife', jsx: 'automatic', outfile: 'places-dfw-fixture.js',
        loader: { '.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"test"' },
        stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React, {useState} from 'react';
            import {createRoot} from 'react-dom/client';
            import EventsAgenda from './src/app/places/dubai/EventsAgenda';
            import {agendaEntries} from './src/lib/places-agenda';
            import payload from './src/data/places-dubai.generated.json';
            const now=Date.parse(${JSON.stringify(now)});
            const entries=agendaEntries(payload.places,now).filter(({event})=>event.id.startsWith('dfw-2026-'));
            function App(){
                const [selected,setSelected]=useState('No venue selected');
                return <main>
                    <EventsAgenda entries={entries} now={now} onSelectPlace={place=>{
                        window.selectedDfwVenue={id:place.id,placeId:place.placeId,coordinates:place.coordinates};
                        setSelected(place.id);
                    }}/>
                    <output aria-label="Selected map venue">{selected}</output>
                </main>;
            }
            const app=createRoot(document.getElementById('root'));
            window.disposeDfw=()=>app.unmount();
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
    await page.goto('https://nsso.test/places-dfw')
    await expect(page.getByRole('region', { name: 'Current and upcoming events' })).toBeVisible()
    return { errors, external }
}

async function finish(page, state) {
    await page.evaluate(() => window.disposeDfw())
    expect(state).toEqual({ errors: [], external: [] })
}

test('the complete public programme renders as 115 distinct agenda rows with official links', async ({ page }) => {
    const state = await mount(page)
    const cards = page.getByRole('article')
    await expect(cards).toHaveCount(115)
    const rows = await cards.evaluateAll(elements => elements.map(card => ({
        id: card.getAttribute('aria-labelledby').replace(/^agenda-/, ''),
        title: card.querySelector('h2').textContent,
        text: card.textContent,
        links: [...card.querySelectorAll('a')].map(link => ({ href: link.href, target: link.target, rel: link.rel })),
    })))
    expect(rows.map(row => row.id).sort()).toEqual(publicSessions.map(eventId).sort())
    for (const session of publicSessions) {
        const row = rows.find(item => item.id === eventId(session))
        expect(row.title).toBe(`Dubai Future Week — ${session.title}`)
        expect(row.text).toContain(session.room)
        expect(row.text).toContain(session.location)
        const compactText = row.text.replace(/\s/g, '').toLowerCase()
        expect(compactText).toContain(dateFormat.format(new Date(session.startsAt)).replace(/\s/g, '').toLowerCase())
        for (const timestamp of [session.startsAt, session.endsAt]) {
            expect(compactText).toContain(timeFormat.format(new Date(timestamp)).replace(/\s/g, '').toLowerCase())
        }
        expect(row.text).toContain('Calendar reminder, not a booking.')
        expect(row.links.find(link => link.href === 'https://www.dubaifutureweek.com/en/whats-happening'))
            .toEqual({ href: 'https://www.dubaifutureweek.com/en/whats-happening', target: '_blank', rel: 'noopener noreferrer' })
        const calendar = new URL(row.links.find(link => link.href.startsWith('https://calendar.google.com/')).href)
        expect(calendar.searchParams.get('ctz')).toBe('Asia/Dubai')
        expect(calendar.searchParams.get('dates').split('/')[0]).toBe(session.startsAt.slice(0, 10).replaceAll('-', ''))
        if (/School Session/.test(session.title)) expect(row.text).toMatch(/eligib|groups?|students?/i)
    }
    const last = cards.last()
    await last.scrollIntoViewIfNeeded()
    await expect(last.getByRole('button', { name: /on the map$/ })).toBeInViewport()
    await finish(page, state)
})

test('agenda actions select the museum, Emirates Towers campus and separate 3D Printed Office', async ({ page }, testInfo) => {
    const state = await mount(page)
    for (const [location, id, placeId] of [
        ['Museum of the Future', 'museum-of-the-future', 'ChIJqU_DoUtDXz4RxC8gnP8G_Ss'],
        ['Emirates Towers', 'emirates-towers-dubai-future-week', 'ChIJy91k8pJCXz4R05SelPC02fY'],
        ['3D Printed Office', 'office-of-the-future-dfw', 'ChIJ76hFh5JCXz4RqvlK9fWWjts'],
    ]) {
        const session = publicSessions.find(item => item.location.startsWith(location))
        const card = page.locator(`article[aria-labelledby="agenda-${eventId(session)}"]`)
        const action = card.getByRole('button', { name: /on the map$/ })
        if (testInfo.project.name === 'mobile') await action.tap()
        else { await action.focus(); await page.keyboard.press('Enter') }
        await expect(page.getByLabel('Selected map venue')).toHaveText(id)
        const selected = await page.evaluate(() => window.selectedDfwVenue)
        expect(selected.id).toBe(id)
        expect(selected.placeId).toBe(placeId)
        expect(Number.isFinite(selected.coordinates.lat)).toBe(true)
        expect(Number.isFinite(selected.coordinates.lng)).toBe(true)
    }
    await finish(page, state)
})

test('all 115 cards keep long titles, venue notes and touch controls contained at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    const state = await mount(page)
    await expect(page.getByRole('article')).toHaveCount(115)
    const violations = await page.getByRole('article').evaluateAll(cards => cards.flatMap(card => {
        const bounds = card.getBoundingClientRect(), failures = []
        if (bounds.left < 0 || bounds.right > innerWidth) failures.push('card outside viewport')
        if (card.scrollWidth > card.clientWidth) failures.push('card content overflows')
        if (getComputedStyle(card).backgroundColor !== 'rgb(255, 255, 255)') failures.push('card is not opaque white')
        for (const control of card.querySelectorAll('button,a')) {
            const rect = control.getBoundingClientRect()
            if (rect.left < bounds.left || rect.right > bounds.right || rect.height < 44) failures.push('control bounds or touch target')
        }
        return failures.map(failure => ({ id: card.getAttribute('aria-labelledby'), failure }))
    }))
    expect(violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await finish(page, state)
})
