import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle
test.beforeAll(async () => {
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'advanced-label-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|link)|@\/components\/(?:providers\/ProfileProvider|profile\/ProfileSaveStatus|payments\/PayPalCodeEditor|ui\/(?:Toast|ImageCropperModal|tahoe-glass))|@\/app\/dashboard\/components\/DashboardGlassCard|\.\/DashboardGlassCard)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? 'export const useRouter=()=>({push(){},replace(){}});'
                    : path === 'next/link' ? 'export default ({children,href,onClick,...props})=><a {...props} href={href} onClick={onClick}>{children}</a>;'
                    : path.endsWith('ProfileProvider') ? 'import {useSyncExternalStore} from "react";export const useProfile=()=>useSyncExternalStore(window.fixtureSubscribe,window.fixtureSnapshot,window.fixtureSnapshot);'
                    : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:()=>{}});'
                        : path.endsWith('DashboardGlassCard') ? 'import React from "react";export default ({children})=><div>{children}</div>;'
                            : path.endsWith('tahoe-glass') ? 'import React from "react";const attrs=props=>Object.fromEntries(Object.entries(props).filter(([key])=>key.startsWith("aria-")||["id","role","onClick","onKeyDown","tabIndex","hidden","disabled","type"].includes(key)));export const TahoeGlassSurface=React.forwardRef(({as:Tag="div",children,...props},ref)=><Tag ref={ref} {...attrs(props)}>{children}</Tag>);export const TahoeGlassButton=React.forwardRef(({children,...props},ref)=><button ref={ref} {...attrs(props)}>{children}</button>);export const TahoeGlassField=({children})=><div>{children}</div>;export const TahoeGlassDialog=()=>null;'
                                : 'export default ()=>null;' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';import Editor from './src/app/dashboard/components/AdvancedModeCard';
            const listeners=new Set();window.fixtureSubscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener)};window.fixtureSnapshot=()=>window.fixtureProfile;window.fixtureWrites=[];
            const emit=patch=>{window.fixtureProfile={...window.fixtureProfile,...patch};for(const listener of listeners)listener()};
            const count=Number(new URLSearchParams(location.search).get('count')||1),collections={experience:'experiences',qualification:'qualifications',project:'projects'};
            const experience={id:'experience-fixture',company_name:'Fixture company',job_title:'Builder',start_year:2024,end_year:null},qualification={id:'qualification-fixture',institution:'Fixture university',qualification_name:'Fixture degree',start_year:2020,end_year:2023},project={id:'project-fixture',project_name:'Fixture project',contribution:'Creator',project_url:'https://example.test',description:'Project description'};
            const repeat=(row)=>Array.from({length:count},(_,i)=>({...row,id:i?row.id+'-'+i:row.id}));
            window.fixtureProfile={experiences:repeat(experience),qualifications:repeat(qualification),projects:repeat(project),products:[{id:'product-fixture',name:'Fixture offer',price:'£12',description:'Product description',purchase_link_active:true,purchase_link:'https://seller.example.test',paypal_active:false,sales_page_active:false,sales_page_published:false}],mutationState:{status:'saved',message:''},reorderExperiences:async()=>true,reorderQualifications:async()=>true,reorderProjects:async()=>true,
            patchEntity:async(kind,id,patch)=>{const collection=collections[kind];emit({[collection]:window.fixtureProfile[collection].map(row=>row.id===id?{...row,...patch}:row)});return true},
            createEntity:async(kind,values,position='bottom')=>{window.fixtureWrites.push({kind,values,position});if(window.fixtureHoldCreate)await new Promise(resolve=>{window.fixtureReleaseCreate=resolve});await new Promise(resolve=>setTimeout(resolve,60));if(window.fixtureCreateFails)return{status:'rejected',changes:[]};const collection=collections[kind],row={...values,id:kind+'-created-'+window.fixtureWrites.length};emit({[collection]:position==='top'?[row,...window.fixtureProfile[collection]]:[...window.fixtureProfile[collection],row]});return{status:'applied',changes:[{entity:collection,id:row.id,row}]}},removeEntity:async()=>false,refreshProfile:async()=>{},getRevision:()=>0};
            createRoot(document.getElementById('root')).render(<Editor userId="actor-fixture"/>);
        ` } })
    bundle = result.outputFiles[0].text
})

async function mount(page, count = 1) {
    await page.route('https://nsso.test/fixture*', route => route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:100px 16px}input,textarea{display:block;min-height:44px}button{min-height:44px}label{display:block;margin-top:8px}#fixture-deity-shell{position:fixed;inset:0;z-index:1000;background:#11161d;opacity:0;pointer-events:none}</style><div id="root"></div><div id="fixture-deity-shell" role="dialog" aria-modal="true" aria-label="Deity fixture" aria-hidden="true" inert><button id="fixture-deity-close" type="button">Close Deity fixture</button></div>'}))
    await page.goto(`https://nsso.test/fixture?count=${count}`)
    await page.addScriptTag({content:bundle})
    await page.evaluate(() => {
        const shell = document.getElementById('fixture-deity-shell')
        const close = document.getElementById('fixture-deity-close')
        window.addEventListener('open-deity-chat', () => {
            shell.inert = false
            shell.setAttribute('aria-hidden', 'false')
            shell.style.opacity = '1'
            shell.style.pointerEvents = 'auto'
            close.focus({ preventScroll: true })
        })
        close.addEventListener('click', () => {
            shell.inert = true
            shell.setAttribute('aria-hidden', 'true')
            shell.style.opacity = '0'
            shell.style.pointerEvents = 'none'
        })
    })
}

test('advanced editor fields keep accessible names across section and product selection', async ({ page }) => {
    await mount(page)
    await page.getByRole('button',{name:/^Experience & Education/}).click()
    await expect(page.getByRole('textbox',{name:'Company',exact:true})).toHaveValue('Fixture company')
    await expect(page.getByRole('textbox',{name:'Role',exact:true})).toHaveValue('Builder')
    await expect(page.getByRole('spinbutton',{name:'Experience start year',exact:true})).toHaveValue('2024')
    await expect(page.getByRole('spinbutton',{name:'Experience end year',exact:true})).toHaveValue('')
    await page.getByRole('tab',{name:'Qualifications',exact:true}).click()
    await expect(page.getByRole('textbox',{name:'Institution',exact:true})).toHaveValue('Fixture university')
    await expect(page.getByRole('textbox',{name:'Qualification',exact:true})).toHaveValue('Fixture degree')
    await expect(page.getByRole('spinbutton',{name:'Qualification start year',exact:true})).toHaveValue('2020')
    await expect(page.getByRole('spinbutton',{name:'Qualification end year',exact:true})).toHaveValue('2023')
    await page.getByRole('tab',{name:'Projects',exact:true}).click()
    for (const name of ['Project name','Your contribution','Project URL (optional)','Project description']) await expect(page.getByRole('textbox',{name,exact:true})).toBeVisible()
    await page.getByRole('button',{name:/^Products & Services/}).click()
    await page.getByRole('button',{name:'Edit Fixture offer',exact:true}).click()
    await expect(page.getByRole('button',{name:'Edit Fixture offer',exact:true})).toHaveAttribute('aria-current','true')
    await expect(page.getByRole('button',{name:'Edit Fixture offer',exact:true})).toHaveClass(/\bnsso-silver-glass\b/)
    for (const name of ['Product name','Price (include the currency)','Product description','Button destination','Second button destination (optional)','Button text (optional)','Second button text (optional)']) await expect(page.getByRole('textbox',{name,exact:true})).toBeVisible()
    await expect(page.getByRole('textbox',{name:'Button destination',exact:true})).toHaveValue('https://seller.example.test')
    const help=page.getByRole('button',{name:'About Button destination',exact:true})
    await help.focus()
    await help.press('Enter')
    await expect(page.getByRole('tooltip')).toContainText('actual purchase page or checkout')
    await help.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await expect(help).toBeFocused()
})

for (const [kind, collection, tab, name] of [
    ['experience', 'experiences', 'Job Titles', 'Company'],
    ['qualification', 'qualifications', 'Qualifications', 'Institution'],
    ['project', 'projects', 'Projects', 'Project name'],
]) {
    test(`${kind} top and bottom adds keep existing order and immediately focus the new field`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await mount(page, 12)
        await page.getByRole('button', { name: 'Experience & Education', exact: true }).click()
        await page.getByRole('tab', { name: tab, exact: true }).click()
        const original = await page.evaluate(collection => window.fixtureProfile[collection].map(item => item.id), collection)
        await page.getByRole('button', { name: `Add ${kind}`, exact: true }).click()
        const fields = page.getByRole('textbox', { name, exact: true })
        await expect(fields).toHaveCount(13)
        await expect(fields.first()).toBeFocused()
        await fields.first().fill('Top synthetic item')
        const topBounds = await fields.first().boundingBox()
        expect(topBounds.y).toBeGreaterThanOrEqual(0)
        expect(topBounds.y + topBounds.height).toBeLessThanOrEqual(844)
        const bottom = page.getByRole('button', { name: `Add ${kind} at bottom`, exact: true })
        await bottom.scrollIntoViewIfNeeded()
        await bottom.click()
        await expect(fields).toHaveCount(14)
        await expect(fields.last()).toBeFocused()
        await fields.last().fill('Bottom synthetic item')
        const bottomBounds = await fields.last().boundingBox()
        expect(bottomBounds.y).toBeGreaterThanOrEqual(0)
        expect(bottomBounds.y + bottomBounds.height).toBeLessThanOrEqual(844)
        expect(await page.evaluate(collection => window.fixtureProfile[collection].map(item => item.id), collection)).toEqual([`${kind}-created-1`, ...original, `${kind}-created-2`])
        expect(await page.evaluate(() => window.fixtureWrites.map(write => write.position))).toEqual(['top', 'bottom'])
    })
}

test('a rejected experience insertion retains existing items and does not fabricate or focus a new field', async ({ page }) => {
    await mount(page, 3)
    await page.getByRole('button', { name: 'Experience & Education', exact: true }).click()
    await page.evaluate(() => { window.fixtureCreateFails = true })
    const add = page.getByRole('button', { name: 'Add experience', exact: true })
    await add.focus()
    await add.press('Enter')
    await expect(add).toBeEnabled()
    await expect(page.getByRole('textbox', { name: 'Company', exact: true })).toHaveCount(3)
    await expect(add).toBeFocused()
    expect(await page.evaluate(() => window.fixtureWrites)).toHaveLength(1)
})

test('a delayed insertion never steals focus from another section the user opened', async ({ page }) => {
    await mount(page, 3)
    await page.getByRole('button', { name: 'Experience & Education', exact: true }).click()
    await page.evaluate(() => { window.fixtureHoldCreate = true })
    await page.getByRole('button', { name: 'Add experience', exact: true }).click()
    const bottom = page.getByRole('button', { name: 'Add experience at bottom', exact: true })
    await expect(bottom).toBeDisabled()
    // aria-disabled preserves keyboard focus; the handler must still reject a
    // direct/programmatic activation while the original write is in flight.
    await bottom.evaluate(button => button.click())
    expect(await page.evaluate(() => window.fixtureWrites)).toHaveLength(1)
    const qualifications = page.getByRole('tab', { name: 'Qualifications', exact: true })
    await qualifications.focus()
    await qualifications.press('Enter')
    await page.evaluate(() => { window.fixtureReleaseCreate() })
    await expect.poll(() => page.evaluate(() => window.fixtureProfile.experiences.length)).toBe(4)
    await expect(qualifications).toBeFocused()
    await expect(page.getByRole('textbox', { name: 'Institution', exact: true })).toHaveCount(3)
})

for (const destination of ['another field', 'open Deity', 'a section visited and returned from']) {
    test(`a delayed Add respects focus moved to ${destination} and never scrolls after its receipt`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await mount(page, 3)
        await page.getByRole('button', { name: 'Experience & Education', exact: true }).click()
        await page.evaluate(() => { window.fixtureHoldCreate = true })
        const add = page.getByRole('button', { name: 'Add experience', exact: true })
        await add.press('Enter')
        await expect(add).toHaveAttribute('aria-busy', 'true')
        let target
        if (destination === 'another field') {
            target = page.locator('input[aria-label="Company"][value="Fixture company"]').first()
            await target.focus()
        } else if (destination === 'open Deity') {
            await page.getByRole('button', { name: 'Ask Deity about job titles', exact: true }).click()
            target = page.getByRole('button', { name: 'Close Deity fixture', exact: true })
            await expect(target).toBeFocused()
        } else {
            await page.getByRole('tab', { name: 'Qualifications', exact: true }).click()
            target = page.getByRole('tab', { name: 'Job Titles', exact: true })
            await target.click()
            await target.focus()
        }
        const before = await page.evaluate(() => scrollY)
        await page.evaluate(() => window.fixtureReleaseCreate())
        await expect(page.getByRole('textbox', { name: 'Company', exact: true })).toHaveCount(4)
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        await expect(target).toBeFocused()
        expect(await page.evaluate(() => scrollY)).toBe(before)
        expect(await page.evaluate(() => window.fixtureWrites)).toHaveLength(1)
        if (destination === 'open Deity') {
            await target.click()
            await page.locator('input[aria-label="Company"][value="Fixture company"]').first().fill('Still editing the original company')
            await expect(page.locator('input[aria-label="Company"][value="Still editing the original company"]')).toBeFocused()
        }
    })
}
