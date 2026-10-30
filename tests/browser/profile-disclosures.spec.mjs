import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const actor = '11111111-1111-4111-8111-111111111111'
const fullBody = 'A carefully authored description with detail about the work, the people involved and the useful outcome. '.repeat(8)
const bio = '  My work connects people and thoughtful products.\n\n' + 'A longer, unchanged account of this practice. '.repeat(12) + '  '
const avatar = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><rect width="400" height="250" fill="#99b6d1"/><circle cx="200" cy="125" r="70" fill="#365b7a"/></svg>')
let bundle, css

function sourceFiles(directory) {
    return readdirSync(root + directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? sourceFiles(directory + '/' + entry.name)
        : /\.(?:ts|tsx)$/.test(entry.name) ? [directory + '/' + entry.name] : [])
}

const fixture = `
 import React from 'react';import{createRoot}from'react-dom/client';
 import Public from './src/app/[username]/page';import Preview from './src/app/preview/page';
 import Text from './src/components/profile/ExpandableProfileText';
 import List from './src/components/profile/ExpandableProfileList';
 import {NativeGlassLens}from'./src/components/ui/tahoe-glass/NativeGlassLens';
 import{TahoeGlassProvider}from'./src/components/providers/TahoeGlassProvider';
 window.fixtureNavigation=[];window.fixtureWrites=[];window.fixtureDisposed=false;
 const actor=${JSON.stringify(actor)},fullBody=${JSON.stringify(fullBody)},bio=${JSON.stringify(bio)},image=${JSON.stringify(avatar)};
 window.fixtureData={user:{id:actor,username:'fixture',is_premium:true},profile:{user_id:actor,full_name:'Synthetic creator',headline:'Profile disclosure verification',bio,profile_pic_url:null},links:[],contacts:[],experiences:Array.from({length:6},(_,i)=>({id:'experience-'+i,job_title:'Experience '+(i+1),company_name:'Synthetic company',start_year:2020+i,end_year:null})),qualifications:Array.from({length:5},(_,i)=>({id:'qualification-'+i,qualification_name:'Qualification '+(i+1),institution:'Synthetic institution',start_year:2010+i,end_year:2011+i})),projects:[{id:'project-alpha',project_name:'Project Alpha',project_url:'https://example.test/project-alpha',contribution:'Creator',description:fullBody,project_photo_url:image},{id:'project-beta',project_name:'Project Beta',project_url:'javascript:alert(1)',contribution:'Researcher',description:fullBody,project_photo_url:image}],products:[{id:'offering-alpha',name:'Offering Alpha',price:'GBP12',description:fullBody,image_url:image,sales_page_active:true,sales_page_published:true,purchase_link_active:true,purchase_link:'https://www.etsy.com/listing/12345/synthetic',paypal_active:true,payment_config:{version:1,kind:'payment-form',action:'https://www.paypal.com/ncp/payment/AB12CD34EF56G',fields:[],label:'Buy offering'}},{id:'offering-unpublished',name:'Offering Unpublished',price:'Free',description:'A short description.',image_url:image,sales_page_active:true,sales_page_published:false,purchase_link_active:false,paypal_active:false}]};
 window.fixtureOriginal=JSON.stringify(window.fixtureData);
 window.fixtureAccount={user:window.fixtureData.user,loading:false,error:null,refreshUser:async()=>{}};
 window.fixtureProfile={...window.fixtureData,loading:false,mutationState:{status:'saved',message:''},refreshProfile:async()=>{},retryPending:async()=>{}};
 const source={kind:'image',src:'/assets/backgrounds/nsso-deck-blue.webp',fit:'cover',label:'real-disclosure-deck'};
 const scene=<img src={source.src} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>;
 function Host({children}){return<TahoeGlassProvider materialFamily="supplied" preferredBackend="auto" fallback="webgl" sourceLabel={source.label} scene={scene} webglSource={source} onDiagnosticsChange={value=>window.fixtureDiagnostics=value}>{children}</TahoeGlassProvider>}
 const cases={short199:'a'.repeat(199),exact200:'b'.repeat(200),long201:'c'.repeat(201),unbroken:'x'.repeat(260),unicode:'👨‍👩‍👧‍👦'.repeat(201),whitespace:${JSON.stringify('  Opening paragraph.\n\n' + fullBody + '  ')},empty:'',blank:${JSON.stringify(' \n ')}};window.fixtureTextCases=cases;
 function Standalone(){const[change,setChange]=React.useState('first '+fullBody);window.changeStandaloneText=setChange;const[listVersion,setListVersion]=React.useState(0);window.changeStandaloneList=()=>setListVersion(v=>v+1);return<main style={{maxWidth:900,margin:'0 auto',padding:24}}>
 <NativeGlassLens as="span" data-premium-reference className="nsso-glass-control inline-flex items-center justify-center rounded-full px-3 py-1"><span className="text-xs font-medium text-slate-900">Premium · Free</span></NativeGlassLens>
 {Object.entries(cases).map(([context,text])=><article key={context} data-case={context} style={{marginTop:16}}><Text context={context} text={text}/></article>)}
 <article data-case="changing"><Text context="changing" text={change}/></article>
 {[0,4,5,7].map(count=><section data-list-case={count} key={count}><List context={'List '+count}>{Array.from({length:count},(_,i)=><div data-entry key={'entry-'+listVersion+'-'+i}>Entry {i+1}</div>)}</List></section>)}
 </main>}
 document.addEventListener('click',event=>{const anchor=event.target.closest?.('a');if(anchor&&!event.defaultPrevented){event.preventDefault();window.fixtureNavigation.push(anchor.getAttribute('href'))}});
 const app=createRoot(document.getElementById('root'));window.disposeDisclosures=()=>{app.unmount();window.fixtureDisposed=true};
 (async()=>{const view=new URLSearchParams(location.search).get('view');const contents=view==='public'?await Public({params:Promise.resolve({username:'fixture'})}):view==='preview'?<Preview/>:<Standalone/>;app.render(<Host>{contents}</Host>)})();
`

test.beforeAll(async () => {
    const files = ['src/app/[username]/page.tsx', 'src/app/preview/page.tsx', 'src/components/providers/TahoeGlassProvider.tsx', ...sourceFiles('src/components/profile'), ...sourceFiles('src/components/ui')]
    const candidates = (files.map(file => readFileSync(root + file, 'utf8')).join('\n') + fixture).matchAll(/["'`]([^"'`\n]+)["'`]/g)
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build([...candidates].flatMap(match => match[1].split(/\s+/))) + '\nbody{margin:0;font-family:Arial;color:#020617}*{box-sizing:border-box}article,section{min-width:0}'
    const result = await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'read-only-disclosure-data',setup(builder){
        builder.onResolve({filter:/^(?:next\/(?:navigation|headers|link)|@\/lib\/public-profile|@\/components\/(?:providers\/(?:UserProvider|ProfileProvider)|layout\/Header|profile\/ProfileSaveStatus|logic\/QRScanHandler|analytics\/MetaPixelConsent|ui\/(?:Toast|CreateProfileButton|AddToMyNssoButton|ProfileQRCodeToggle)))$/},args=>({path:args.path,namespace:'fixture'}))
        builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'tsx',resolveDir:root,contents:
            path==='next/navigation'?'export const useRouter=()=>({push:path=>window.fixtureNavigation.push(path),prefetch(){}});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const notFound=()=>{throw Error("Synthetic profile missing")};'
            :path==='next/headers'?'export const cookies=async()=>({get:()=>undefined});'
            :path==='next/link'?'import React from "react";export default function Link({children,onClick,...props}){return<a {...props} onClick={event=>{onClick?.(event);if(!event.defaultPrevented){event.preventDefault();window.fixtureNavigation.push(props.href)}}}>{children}</a>}'
            :path==='@/lib/public-profile'?'export const loadPublicProfile=async()=>window.fixtureData;export const loadPublicProfileMetadata=async()=>window.fixtureData;export const loadPublicProfileViewer=async()=>({viewer:null,connectionExists:false});'
            :path.endsWith('UserProvider')?'export const useUser=()=>window.fixtureAccount;'
            :path.endsWith('ProfileProvider')?'export const useProfile=()=>window.fixtureProfile;'
            :path.endsWith('Toast')?'export const useToast=()=>({showToast(){}});'
            :'export default()=>null;'}))
    }}],stdin:{resolveDir:root,loader:'tsx',contents:fixture}})
    bundle=result.outputFiles[0].text
})

async function mount(page, view = 'standalone') {
    const errors=[],external=[]
    page.on('pageerror',error=>errors.push(error.message))
    await page.route('**/*', route=>{
        const url=new URL(route.request().url())
        if(url.origin!=='https://nsso.test'){external.push(url.href);return route.abort()}
        if(url.pathname==='/fixture.js')return route.fulfill({contentType:'application/javascript',body:bundle})
        if(url.pathname==='/fixture.css')return route.fulfill({contentType:'text/css',body:css})
        if(url.pathname==='/assets/backgrounds/nsso-deck-blue.webp')return route.fulfill({contentType:'image/webp',body:readFileSync(root+'public'+url.pathname)})
        return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>'})
    })
    await page.goto('https://nsso.test/profile-disclosures?view='+view)
    await expect(page.locator('[data-tahoe-glass-provider]')).toHaveAttribute('data-tahoe-glass-state','active')
    return {errors,external}
}
const graphemes=text=>[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].length
const body=container=>container.locator('[data-profile-text-content]')
const cardBounds=card=>card.evaluate(element=>{const r=element.getBoundingClientRect();return{height:r.height,y:r.y+scrollY}})
async function expectAlignedCards(first,second){
    const [left,right]=await Promise.all([cardBounds(first),cardBounds(second)])
    expect(Math.abs(left.y-right.y)).toBeLessThanOrEqual(.1)
    expect(Math.abs(left.height-right.height)).toBeLessThanOrEqual(.1)
}
async function finish(page,state){expect(state).toEqual({errors:[],external:[]});await page.evaluate(()=>window.disposeDisclosures())}

test('200-character previews preserve boundaries, Unicode, whitespace and complete saved text',async({page})=>{
    const state=await mount(page)
    const texts=await page.evaluate(()=>window.fixtureTextCases)
    for(const name of ['short199','exact200','empty','blank']){
        const item=page.locator('[data-case="'+name+'"]')
        await expect(item.getByRole('button')).toHaveCount(0)
        expect((await item.textContent()).trim()).toBe(texts[name].trim())
    }
    for(const name of ['long201','unbroken','unicode','whitespace']){
        const item=page.locator('[data-case="'+name+'"]'),chip=item.getByRole('button')
        const before=await body(item).textContent()
        expect(graphemes(before)).toBeLessThanOrEqual(200)
        expect(before.endsWith('…')).toBe(true)
        if(name==='unicode')expect(before).toBe('👨‍👩‍👧‍👦'.repeat(199)+'…')
        await expect(chip).toHaveText('Read more')
        await expect(chip).toHaveAttribute('aria-expanded','false')
        const id=await chip.getAttribute('aria-controls')
        await expect(body(item)).toHaveAttribute('id',id)
        await chip.click()
        expect(await body(item).textContent()).toBe(texts[name])
        await expect(chip).toHaveText('Read less')
        await expect(chip).toHaveAttribute('aria-expanded','true')
        await chip.click()
        expect(await body(item).textContent()).toBe(before)
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await finish(page,state)
})

test('disclosures support keyboard focus, independent state and reset when content changes',async({page})=>{
    const state=await mount(page)
    const first=page.locator('[data-case="long201"]'),second=page.locator('[data-case="unbroken"]')
    const chip=first.getByRole('button')
    await chip.focus();await page.keyboard.press('Enter')
    await expect(chip).toBeFocused();await expect(chip).toHaveAttribute('aria-expanded','true')
    await expect(second.getByRole('button')).toHaveAttribute('aria-expanded','false')
    await page.keyboard.press('Space')
    await expect(chip).toBeFocused();await expect(chip).toHaveAttribute('aria-expanded','false')
    const changing=page.locator('[data-case="changing"]')
    await changing.getByRole('button').click()
    await page.evaluate(()=>window.changeStandaloneText('replacement '.repeat(20)))
    await expect(changing.getByRole('button')).toHaveAttribute('aria-expanded','false')
    expect(graphemes(await body(changing).textContent())).toBeLessThanOrEqual(200)
    await finish(page,state)
})

test('experience-style lists reveal only items after four and retain focus on collapse',async({page})=>{
    const state=await mount(page)
    for(const count of [0,4,5,7]){
        const list=page.locator('[data-list-case="'+count+'"]'),chip=list.getByRole('button')
        await expect(list.locator('[data-entry]:visible')).toHaveCount(Math.min(count,4))
        if(count<=4){await expect(chip).toHaveCount(0);continue}
        await chip.focus();await page.keyboard.press('Enter')
        await expect(list.locator('[data-entry]:visible')).toHaveCount(count)
        await expect(chip).toHaveAttribute('aria-expanded','true')
        await page.keyboard.press('Space')
        await expect(list.locator('[data-entry]:visible')).toHaveCount(4)
        await expect(chip).toBeFocused()
        await expect(chip).toHaveAttribute('aria-expanded','false')
    }
    const changed=page.locator('[data-list-case="7"]')
    await changed.getByRole('button').click()
    await page.evaluate(()=>window.changeStandaloneList())
    await expect(changed.getByRole('button')).toHaveAttribute('aria-expanded','false')
    await expect(changed.locator('[data-entry]:visible')).toHaveCount(4)
    await finish(page,state)
})

test('Read more uses the real Premium chip material with a compact lens and accessible target',async({page})=>{
    const state=await mount(page)
    const chip=page.locator('[data-case="long201"]').getByRole('button'),lens=chip.locator('[data-profile-read-more-lens]')
    await chip.scrollIntoViewIfNeeded()
    await expect(lens).toHaveAttribute('data-tahoe-native-lens','supplied')
    await expect(lens).toHaveAttribute('data-tahoe-glass-state','active')
    const target=await chip.boundingBox(),visual=await lens.boundingBox()
    expect(target.width).toBeGreaterThanOrEqual(44);expect(target.height).toBeGreaterThanOrEqual(44)
    expect(visual.height).toBeGreaterThanOrEqual(20);expect(visual.height).toBeLessThanOrEqual(32)
    const material=element=>({coat:element.querySelector('[data-supplied-glass-layer="coat"]').getAttribute('style'),rim:element.querySelector('[data-supplied-glass-layer="rim"]').getAttribute('style'),font:getComputedStyle(element).fontSize})
    const actual=await lens.evaluate(material),reference=await page.locator('[data-premium-reference]').evaluate(material)
    expect(actual.coat).toBe(reference.coat);expect(actual.rim).toBe(reference.rim)
    expect(parseFloat(actual.font)).toBe(12)
    await expect(lens.locator('canvas')).toHaveCount(0)
    await finish(page,state)
})

for(const view of ['public','preview'])test(`actual ${view} profile keeps side-by-side cards aligned when expanding without navigation or checkout bypass`,async({page},testInfo)=>{
    const state=await mount(page,view)
    await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode().catch(()=>{}))))
    const bioChip=page.getByRole('button',{name:'Read more about bio',exact:true})
    await expect(bioChip).toBeVisible()
    await bioChip.click()
    const bioText=page.locator('[data-profile-text-content]').filter({hasText:'My work connects people'})
    expect(await bioText.textContent()).toBe(bio)
    await page.getByRole('button',{name:'Read less about bio',exact:true}).click()
    const cardFor=name=>page.getByRole('heading',{name,exact:true}).locator('xpath=ancestor::*[@data-tahoe-glass-surface="card"][1]')
    const alpha=cardFor('Project Alpha'),beta=cardFor('Project Beta'),offering=cardFor('Offering Alpha'),unpublished=cardFor('Offering Unpublished')
    const desktop=testInfo.project.name==='desktop'
    const before=await cardBounds(beta)
    if(desktop)await expectAlignedCards(alpha,beta)
    await alpha.getByRole('button',{name:'Read more about project Project Alpha',exact:true}).click()
    expect(await body(alpha).textContent()).toBe(fullBody)
    expect(graphemes(await body(beta).textContent())).toBeLessThanOrEqual(200)
    const after=await cardBounds(beta)
    if(desktop){
        await expectAlignedCards(alpha,beta)
        expect(after.height).toBeGreaterThan(before.height)
        expect(Math.abs(after.y-before.y)).toBeLessThanOrEqual(.1)
    }else expect(Math.abs(after.height-before.height)).toBeLessThanOrEqual(.1)
    expect(await page.evaluate(()=>window.fixtureNavigation)).toEqual([])
    await expect(page.locator('a button')).toHaveCount(0)
    const title=alpha.getByRole('link',{name:'Project Alpha',exact:true}),image=alpha.getByRole('link',{name:'Open Project Alpha',exact:true})
    for(const link of [title,image]){await expect(link).toHaveAttribute('href','https://example.test/project-alpha');await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer')}
    await title.click();await image.click()
    expect(await page.evaluate(()=>window.fixtureNavigation)).toEqual(['https://example.test/project-alpha','https://example.test/project-alpha'])
    await expect(beta.locator('a')).toHaveCount(0)
    const productBefore=await cardBounds(unpublished)
    if(desktop)await expectAlignedCards(offering,unpublished)
    await offering.getByRole('button',{name:'Read more about product Offering Alpha',exact:true}).click()
    expect(await body(offering).textContent()).toBe(fullBody)
    expect(await body(unpublished).textContent()).toBe('A short description.')
    const productAfter=await cardBounds(unpublished)
    if(desktop){
        await expectAlignedCards(offering,unpublished)
        expect(productAfter.height).toBeGreaterThan(productBefore.height)
    }else expect(Math.abs(productAfter.height-productBefore.height)).toBeLessThanOrEqual(.1)
    await expect(offering.getByRole('link').first()).toHaveAttribute('href',view==='preview'?'/products/offering-alpha?preview=true':'/products/offering-alpha')
    await expect(unpublished.locator('a')).toHaveCount(0)
    for(const [heading,shown,count]of[['Experiences','Experience',6],['Qualifications','Qualification',5]]){
        const section=cardFor(heading),partner=cardFor(heading==='Experiences'?'Qualifications':'Experiences')
        const partnerBefore=await cardBounds(partner)
        if(desktop)await expectAlignedCards(section,partner)
        await expect(section.getByRole('heading',{name:shown+' 5',exact:true})).toBeHidden()
        await section.getByRole('button',{name:'Read more about '+heading,exact:true}).click()
        await expect(section.getByRole('heading',{name:shown+' '+count,exact:true})).toBeVisible()
        await expect(partner.getByRole('button',{name:/^Read more about/})).toHaveAttribute('aria-expanded','false')
        const partnerAfter=await cardBounds(partner)
        if(desktop){
            await expectAlignedCards(section,partner)
            expect(partnerAfter.height).toBeGreaterThan(partnerBefore.height)
        }else expect(Math.abs(partnerAfter.height-partnerBefore.height)).toBeLessThanOrEqual(.1)
        await section.getByRole('button',{name:'Read less about '+heading,exact:true}).click()
        await expect(section.getByRole('heading',{name:shown+' 5',exact:true})).toBeHidden()
        if(desktop)await expectAlignedCards(section,partner)
    }
    if(view==='preview'){
        await offering.getByRole('button',{name:'Buy on Etsy',exact:true}).click()
        await expect(offering.getByRole('status')).toHaveText('Checkout is disabled during profile preview')
        await expect(page.locator('form[action*="paypal"]')).toHaveCount(0)
        expect(await page.evaluate(()=>window.fixtureNavigation)).toEqual(['https://example.test/project-alpha','https://example.test/project-alpha'])
    }
    expect(await page.evaluate(()=>JSON.stringify(window.fixtureData)===window.fixtureOriginal)).toBe(true)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:testInfo.outputPath(view+'-profile-disclosures.png'),fullPage:true})
    await finish(page,state)
})
