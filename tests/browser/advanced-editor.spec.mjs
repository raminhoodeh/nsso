import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle
test.beforeAll(async () => {
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'advanced-label-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:@\/components\/(?:providers\/ProfileProvider|profile\/ProfileSaveStatus|payments\/PayPalCodeEditor|ui\/(?:Toast|ImageCropperModal|tahoe-glass))|@\/app\/dashboard\/components\/DashboardGlassCard)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path.endsWith('ProfileProvider') ? 'export const useProfile=()=>window.fixtureProfile;'
                    : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:()=>{}});'
                        : path.endsWith('DashboardGlassCard') ? 'import React from "react";export default ({children})=><div>{children}</div>;'
                            : path.endsWith('tahoe-glass') ? 'import React from "react";const attrs=props=>Object.fromEntries(Object.entries(props).filter(([key])=>key.startsWith("aria-")||["id","role","onClick","onKeyDown","tabIndex","hidden","disabled"].includes(key)));export const TahoeGlassSurface=React.forwardRef(({as:Tag="div",children,...props},ref)=><Tag ref={ref} {...attrs(props)}>{children}</Tag>);export const TahoeGlassButton=React.forwardRef(({children,...props},ref)=><button ref={ref} {...attrs(props)}>{children}</button>);export const TahoeGlassField=({children})=><div>{children}</div>;export const TahoeGlassDialog=()=>null;'
                                : 'export default ()=>null;' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';import Editor from './src/app/dashboard/components/AdvancedModeCard';
            window.fixtureProfile={experiences:[{id:'experience-fixture',company_name:'Fixture company',job_title:'Builder',start_year:2024,end_year:null}],qualifications:[{id:'qualification-fixture',institution:'Fixture university',qualification_name:'Fixture degree',start_year:2020,end_year:2023}],projects:[{id:'project-fixture',project_name:'Fixture project',contribution:'Creator',project_url:'https://example.test',description:'Project description'}],products:[{id:'product-fixture',name:'Fixture offer',price:'£12',description:'Product description',purchase_link_active:true,purchase_link:'https://seller.example.test',paypal_active:false,sales_page_active:false,sales_page_published:false}],reorderExperiences:async()=>true,reorderQualifications:async()=>true,reorderProjects:async()=>true,patchEntity:async()=>true,createEntity:async()=>({status:'rejected',changes:[]}),removeEntity:async()=>false,refreshProfile:async()=>{},getRevision:()=>0};
            createRoot(document.getElementById('root')).render(<Editor userId="actor-fixture"/>);
        ` } })
    bundle = result.outputFiles[0].text
})

test('advanced editor fields keep accessible names across section and product selection', async ({ page }) => {
    await page.route('https://nsso.test/fixture', route => route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
    await page.goto('https://nsso.test/fixture')
    await page.addScriptTag({content:bundle})
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
    await page.getByRole('button',{name:'Fixture offer',exact:true}).click()
    for (const name of ['Product name','Price (include the currency)','Product description','Purchase link']) await expect(page.getByRole('textbox',{name,exact:true})).toBeVisible()
})
