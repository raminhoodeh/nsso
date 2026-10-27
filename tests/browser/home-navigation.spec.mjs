import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, layoutCss
test.beforeAll(async () => {
  const files = ['src/app/page.tsx', 'src/components/home/HomeProfileDemo.tsx', 'src/components/home/HomeProfileClaim.tsx', 'src/components/ui/Input.tsx', 'src/components/layout/Header.tsx', 'src/components/layout/NssoTopBar.tsx']
  const candidates = files.flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
  const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root, onDependency() {} })
  layoutCss = compiler.build(candidates)
  const result = await build({
    absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{name:'isolated-home-boundaries',setup(builder) {
      builder.onResolve({filter:/^(next\/(navigation|image|link)|@\/lib\/supabase\/client|@\/components\/providers\/UserProvider|@\/components\/ui\/Toast|@\/components\/ui\/tahoe-glass|@\/components\/profile\/ProfileGlassCard|@\/components\/home\/HomeVisionPlayer|@\/lib\/tahoe-glass\/dashboard-backdrop-policy)$/}, args => ({path:args.path,namespace:'fixture'}))
      builder.onLoad({filter:/.*/,namespace:'fixture'}, ({path}) => {
        const contents = path === 'next/navigation' ? 'export const useRouter=()=>window.fixtureRouter;export const usePathname=()=>window.fixturePath;export const useSearchParams=()=>new URLSearchParams();'
          : path.endsWith('dashboard-backdrop-policy') ? 'export const getDashboardDesktopLayoutSnapshot=()=>true;export const getDashboardDirectBackdropSnapshot=()=>false;export const getDashboardServerSnapshot=()=>false;export const subscribeDashboardBackdropPolicy=()=>()=>{};'
          : path === '@/lib/supabase/client' ? 'export const createClient=()=>window.fixtureAuth;'
          : path.endsWith('UserProvider') ? 'export const useUser=()=>({user:window.fixtureUser});'
          : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:(message,type)=>window.fixtureToasts.push({message,type})});'
          : path === 'next/image' ? "import React from 'react';export default function Image({priority,fill,...props}){return <img {...props}/>};"
          : path === 'next/link' ? "import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>};"
          : path.endsWith('tahoe-glass') ? `import React from 'react';
              export {TahoeGlassField} from './src/components/ui/tahoe-glass/TahoeGlassField';
              export function TahoeGlassSurface({as:Tag='div',children,contentClassName,variant,radius,tone,semanticTint,semanticTintOpacity,tracking,opticalPriority,chromiumAppearance,...props}){return <Tag {...props} data-fixture-tone={tone} data-fixture-appearance={chromiumAppearance}><span className={contentClassName}>{children}</span></Tag>}
              export function TahoeGlassButton(props){return <TahoeGlassSurface as="button" {...props}/>}
              export function TahoeBackdropSurface({backdropEnabled,...props}){return <TahoeGlassSurface {...props}/>}
              export function TahoeBackdropHeader({displacementProfile,materialLighting,...props}){return <TahoeGlassSurface {...props}/>}
              export function TahoeGlassDialog({open,children}){return open?<div role="dialog">{children}</div>:null}`
          : path.endsWith('HomeVisionPlayer') ? "import React from 'react';export default ()=> <div>Vision player fixture</div>;"
          : "import React from 'react';export default ({children})=><div>{children}</div>;"
        return {contents,loader:'tsx',resolveDir:root}
      })
    }}],
    stdin:{resolveDir:root,loader:'tsx',contents:`
      import React from 'react';import {createRoot} from 'react-dom/client';
      import Home from './src/app/page';import Header from './src/components/layout/Header';import Sidebar from './src/components/layout/DashboardSidebar';import Claim from './src/components/home/HomeProfileClaim';
      window.fixtureUser=null;window.fixturePath='/preview';window.fixtureToasts=[];window.fixtureDestinations=[];
      window.fixtureRouter={push:path=>window.fixtureDestinations.push(path),replace:path=>window.fixtureDestinations.push(path),prefetch(){}};
      window.fixtureSessionMode='guest';window.fixtureSignOutMode='error';window.fixtureSignOutCalls=0;window.fixtureCopied=[];window.fixtureClipboardMode='pending';
      window.fixtureAuth={auth:{
        async getSession(){if(window.fixtureSessionMode==='error')throw Error('Synthetic Auth outage');if(window.fixtureSessionMode==='pending')return new Promise(resolve=>window.fixtureResolveSession=resolve);return {data:{session:window.fixtureSessionMode==='signed-in'?{user:{id:'actor-a'}}:null},error:null}},
        async signOut(){window.fixtureSignOutCalls++;if(window.fixtureSignOutMode==='throw')throw Error('Synthetic sign-out outage');if(window.fixtureSignOutMode==='pending')return new Promise(resolve=>window.fixtureResolveSignOut=resolve);return {error:{message:'Synthetic sign-out failure'}}}
      }};
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(text){window.fixtureCopied.push(text);if(window.fixtureClipboardMode==='error')return Promise.reject(Error('Denied'));return new Promise(resolve=>window.fixtureResolveCopy=resolve)}}});
      window.IntersectionObserver=class{constructor(callback){window.fixtureIntersection=callback}observe(){}disconnect(){}};
      const root=createRoot(document.getElementById('root'));
      function DestinationHeader(){
        React.useLayoutEffect(()=>{
          if(!window.fixtureResolveClaimAtCommit)return;
          window.fixtureResolveClaimAtCommit=false;
          window.fixtureClaimResolvedAfterDetach=!document.querySelector('#choose-profile-name');
          window.fixtureResolveSession({data:{session:null},error:null});
        },[]);
        return <Header/>;
      }
      window.fixtureRender=screen=>root.render(screen==='home'?<Home/>:screen==='sidebar'?<Sidebar/>:<DestinationHeader/>);
      window.fixtureRetainClaim=mode=>root.render(<React.Activity mode={mode}><Claim/></React.Activity>);
    `}
  })
  bundle=result.outputFiles[0].text
})

async function fixture(page, screen='home', options={}) {
  const errors=[]
  page.on('pageerror', error=>errors.push(error.message))
  const videoRequests=[]
  await page.route('https://nsso.test/**', route => {
    const path=new URL(route.request().url()).pathname
    if(path==='/')return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/fixture.js"></script>'})
    if(path==='/fixture.js')return route.fulfill({contentType:'application/javascript',body:bundle})
    if(path==='/api/check-username')return route.fulfill({contentType:'application/json',body:JSON.stringify({available:true})})
    if(path==='/homepage-video.mp4'){videoRequests.push(path);return route.abort()}
    return route.fulfill({status:204,body:''})
  })
  await page.goto('https://nsso.test/')
  await page.evaluate(({screen,options})=>{Object.assign(window,options);window.fixtureRender(screen)},{screen,options})
  await expect(page.getByRole(screen==='sidebar'?'complementary':'navigation')).toBeVisible()
  if (screen === 'header' && options.fixtureUser) await page.getByRole('button', { name: 'Open account menu' }).click()
  return {errors,videoRequests}
}

test('sign-in navigation is a single semantic link without a nested button', async({page})=>{
  await fixture(page)
  const links=page.getByRole('link',{name:'SIGN IN / SIGN UP',exact:true})
  expect(await links.count()).toBeGreaterThan(0)
  await expect(links.first()).toHaveAttribute('href','/sign-in')
  await expect(links.first().locator('button')).toHaveCount(0)
})

test('core top bar keeps its sky coating, geometry and readable controls across routes and scrolling', async ({ page }, testInfo) => {
  const { errors } = await fixture(page, 'header')
  await page.addStyleTag({ content: layoutCss })
  const widths = testInfo.project.name === 'desktop' ? [1440, 1024, 768] : [390, 320]
  const bar = page.locator('[data-nsso-topbar]')
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/', '/ramin', '/dashboard', '/deity']) {
      await page.evaluate(path => { window.fixturePath = path; window.fixtureRender('header') }, path)
      await expect(bar).toHaveAttribute('data-fixture-appearance', 'light')
      await expect(bar).toHaveAttribute('data-fixture-tone', 'dark')
      const signIn = page.getByRole('link', { name: 'SIGN IN / SIGN UP', exact: true }).filter({ visible: true })
      await expect(signIn).toHaveAttribute('href', '/sign-in')
      await expect(signIn).toHaveAttribute('data-fixture-tone', 'dark')
      const initial = await bar.evaluate(el => {
        document.body.style.minHeight = '2000px'
        const s = getComputedStyle(el, '::after')
        return { top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height, coating: s.backgroundImage, pointerEvents: s.pointerEvents }
      })
      expect(initial.top).toBe(0)
      expect(initial.height).toBe(88)
      expect(initial.coating).toContain('linear-gradient')
      expect(initial.pointerEvents).toBe('none')
      await page.evaluate(() => window.scrollTo(0, 500))
      expect(await bar.evaluate(el => el.getBoundingClientRect().top)).toBe(0)
      expect(await bar.evaluate(el => getComputedStyle(el, '::after').backgroundImage)).toBe(initial.coating)
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
      await page.evaluate(() => window.scrollTo(0, 0))
    }
  }
  await page.emulateMedia({ forcedColors: 'active' })
  expect(await bar.evaluate(el => getComputedStyle(el, '::after').display)).toBe('none')
  await page.emulateMedia({ forcedColors: 'none' })
  await bar.evaluate(el => el.setAttribute('data-tahoe-backdrop-backend', 'solid'))
  expect(await bar.evaluate(el => getComputedStyle(el, '::after').content)).toBe('none')
  expect(errors).toEqual([])
})

test('homepage uses desktop columns without carrying that layout onto mobile', async ({ page }, testInfo) => {
  const { errors } = await fixture(page)
  await page.addStyleTag({ content: layoutCss })
  const widths = testInfo.project.name === 'desktop' ? [1440, 1024, 768] : [390, 320]
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 })
    const layout = await page.evaluate(() => {
      const rect = selector => {
        const r = document.querySelector(selector).getBoundingClientRect()
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
      }
      return {
        intro: rect('[data-home-intro]'), demo: rect('[data-home-intro] figure'), story: rect('[data-home-story]'),
        claim: rect('[data-home-actions-layout] > section[aria-labelledby]'), offers: rect('[data-home-actions-layout] > section[aria-label]'),
        claimCard: rect('[data-home-claim-card]'), monetiseCard: rect('[data-home-offer-card="monetise"]'), exampleCard: rect('[data-home-offer-card="example-profile"]'),
        headlineParts: [...document.querySelectorAll('[data-home-hero] h1 > span')].map(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right } }),
        tagline: rect('[data-home-intro] h2 + p'),
        contact: rect('[data-home-contact]'), vision: rect('[data-home-vision]'),
        contactPadding: { top: getComputedStyle(document.querySelector('[data-home-contact]')).paddingTop, bottom: getComputedStyle(document.querySelector('[data-home-contact]')).paddingBottom },
        bottomPadding: parseFloat(getComputedStyle(document.querySelector('[data-home-vision]')).paddingBottom),
        cardCoatings: [...document.querySelectorAll('.home-sky-glass')].map(el => { const s = getComputedStyle(el, '::after'); return { content: s.content, background: s.backgroundImage, pointerEvents: s.pointerEvents, zIndex: s.zIndex } }),
        overflow: document.documentElement.scrollWidth > innerWidth,
      }
    })
    expect(layout.overflow, `Overflow at ${width}px`).toBe(false)
    expect(layout.demo.height).toBeGreaterThan(200)
    expect(layout.contactPadding.top).toBe(layout.contactPadding.bottom)
    expect(Math.abs(layout.contact.top - Math.max(layout.claim.bottom, layout.offers.bottom))).toBeLessThanOrEqual(1)
    expect(Math.abs(layout.contact.bottom - layout.vision.top)).toBeLessThanOrEqual(1)
    if (width >= 1024) {
      expect(layout.bottomPadding).toBe(24)
      expect(layout.cardCoatings).toHaveLength(4)
      for (const coating of layout.cardCoatings) {
        expect(coating.background).toContain('linear-gradient')
        expect(coating.pointerEvents).toBe('none')
        expect(coating.zIndex).toBe('7')
      }
      expect(Math.abs(layout.headlineParts[0].top - layout.headlineParts[1].top)).toBeLessThanOrEqual(1)
      expect(layout.headlineParts[1].right).toBeLessThanOrEqual(width)
      expect(layout.demo.right).toBeLessThan(layout.story.left)
      expect(Math.min(layout.demo.bottom, layout.story.bottom)).toBeGreaterThan(Math.max(layout.demo.top, layout.story.top))
      expect(layout.offers.right).toBeLessThan(layout.claim.left)
      expect(Math.abs(layout.monetiseCard.top - layout.claimCard.top)).toBeLessThanOrEqual(1)
      expect(Math.abs(layout.exampleCard.bottom - layout.claimCard.bottom)).toBeLessThanOrEqual(1)
      expect(layout.monetiseCard.bottom).toBeLessThan(layout.exampleCard.top)
      expect(Math.abs(layout.monetiseCard.height - layout.exampleCard.height)).toBeLessThanOrEqual(1)
      if (width === 1440) expect(layout.intro.width).toBeGreaterThan(1000)
    } else {
      expect(layout.bottomPadding).toBe(96)
      for (const coating of layout.cardCoatings) expect(coating.content).toBe('none')
      expect(layout.headlineParts[0].bottom).toBeLessThanOrEqual(layout.headlineParts[1].top + 2)
      expect(layout.demo.bottom).toBeLessThanOrEqual(layout.story.top)
      expect(layout.claim.bottom).toBeLessThanOrEqual(layout.offers.top)
      if (width >= 768) {
        expect(layout.monetiseCard.right).toBeLessThan(layout.exampleCard.left)
        expect(Math.abs(layout.monetiseCard.top - layout.exampleCard.top)).toBeLessThanOrEqual(1)
      } else {
        expect(layout.monetiseCard.bottom).toBeLessThanOrEqual(layout.exampleCard.top)
      }
      expect(layout.demo.top - layout.tagline.bottom).toBeLessThanOrEqual(24)
    }
  }
  await expect(page.locator('[data-home-intro] figure')).toHaveCount(1)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ forcedColors: 'active' })
  expect(await page.locator('.home-sky-glass').first().evaluate(el => getComputedStyle(el, '::after').display)).toBe('none')
  await page.emulateMedia({ forcedColors: 'none' })
  await page.locator('.home-sky-glass').first().evaluate(el => el.setAttribute('data-tahoe-backdrop-backend', 'solid'))
  expect(await page.locator('.home-sky-glass').first().evaluate(el => getComputedStyle(el, '::after').content)).toBe('none')
  expect(errors).toEqual([])
})

test('claim keeps the requested name and offers retry after an Auth rejection',async({page})=>{
  const {errors}=await fixture(page)
  await page.getByRole('textbox',{name:'Profile name'}).first().fill('my-name')
  await page.evaluate(()=>window.fixtureSessionMode='error')
  await page.getByRole('button',{name:'CLAIM IT',exact:true}).first().click()
  await expect(page.getByRole('status').filter({hasText:'Your name is kept'})).toBeVisible()
  await expect(page.getByRole('textbox',{name:'Profile name'}).first()).toHaveValue('my-name')
  await expect(page.getByRole('button',{name:'CLAIM IT',exact:true}).first()).toBeEnabled()
  await page.evaluate(()=>window.fixtureSessionMode='guest')
  await page.getByRole('textbox',{name:'Profile name'}).first().press('Enter')
  await expect.poll(()=>page.evaluate(()=>window.fixtureDestinations.at(-1))).toBe('/sign-up?name=my-name')
  expect(errors).toEqual([])
})

test('a signed-in home visitor keeps their name intent for explicit claiming',async({page})=>{
  await fixture(page)
  await page.evaluate(()=>window.fixtureSessionMode='signed-in')
  await page.getByRole('textbox',{name:'Profile name'}).first().fill('chosen-name')
  await page.getByRole('button',{name:'CLAIM IT',exact:true}).first().click()
  await expect.poll(()=>page.evaluate(()=>window.fixtureDestinations.at(-1))).toBe('/dashboard?claim=chosen-name')
})

test('a late claim session cannot override navigation away from home',async({page})=>{
  await fixture(page)
  await page.getByRole('textbox',{name:'Profile name'}).first().fill('kept-name')
  await page.evaluate(()=>window.fixtureSessionMode='pending')
  await page.getByRole('button',{name:'CLAIM IT',exact:true}).first().click()
  await expect(page.getByRole('textbox',{name:'Profile name'}).first()).toBeDisabled()
  await expect.poll(() => page.evaluate(() => typeof window.fixtureResolveSession)).toBe('function')
  await page.evaluate(()=>window.fixtureRender('header'))
  await expect(page.getByRole('textbox',{name:'Profile name'})).toHaveCount(0)
  await page.evaluate(()=>window.fixtureResolveSession({data:{session:null},error:null}))
  await page.waitForTimeout(50)
  expect(await page.evaluate(()=>window.fixtureDestinations)).toEqual([])
})

test('claim completion at the destination commit cannot navigate after its form is detached',async({page})=>{
  await fixture(page)
  await page.getByRole('textbox',{name:'Profile name'}).fill('kept-name')
  await page.evaluate(()=>window.fixtureSessionMode='pending')
  await page.getByRole('button',{name:'CLAIM IT',exact:true}).click()
  await expect(page.getByRole('textbox',{name:'Profile name'})).toBeDisabled()
  await expect.poll(()=>page.evaluate(()=>typeof window.fixtureResolveSession)).toBe('function')
  // Resolve from the next screen's layout effect: DOM removal is committed,
  // but passive cleanup is not guaranteed to have run yet on every engine.
  await page.evaluate(()=>{window.fixtureResolveClaimAtCommit=true;window.fixtureRender('header')})
  await expect(page.getByRole('textbox',{name:'Profile name'})).toHaveCount(0)
  await expect.poll(()=>page.evaluate(()=>window.fixtureClaimResolvedAfterDetach)).toBe(true)
  await page.waitForTimeout(50)
  expect(await page.evaluate(()=>window.fixtureDestinations)).toEqual([])
})

test('a retained claim recovers after Activity hides it and an obsolete session cannot interrupt the next attempt',async({page})=>{
  await fixture(page)
  await page.evaluate(()=>window.fixtureRetainClaim('visible'))
  const input=page.getByRole('textbox',{name:'Profile name'})
  await expect(input).toBeEnabled()
  await input.fill('kept-name')
  await page.evaluate(()=>window.fixtureSessionMode='pending')
  await page.getByRole('button',{name:'CLAIM IT',exact:true}).click()
  await expect(input).toBeDisabled()
  await expect.poll(()=>page.evaluate(()=>typeof window.fixtureResolveSession)).toBe('function')
  await page.evaluate(()=>{window.fixtureOldClaimSession=window.fixtureResolveSession;window.fixtureRetainClaim('hidden')})
  await expect(page.locator('#choose-profile-name')).toBeHidden()
  await expect(page.locator('#choose-profile-name')).toHaveCount(1)
  await page.evaluate(()=>window.fixtureRetainClaim('visible'))
  await expect(input).toBeEnabled()
  await expect(input).toHaveValue('kept-name')
  await expect(page.getByRole('form',{name:'Choose your profile name'})).toHaveAttribute('aria-busy','false')
  await input.fill('recovered-name')
  await page.getByRole('button',{name:'CLAIM IT',exact:true}).click()
  await expect(input).toBeDisabled()
  await expect.poll(()=>page.evaluate(()=>window.fixtureResolveSession!==window.fixtureOldClaimSession)).toBe(true)
  await page.evaluate(()=>window.fixtureOldClaimSession({data:{session:null},error:null}))
  await page.waitForTimeout(50)
  expect(await page.evaluate(()=>window.fixtureDestinations)).toEqual([])
  await expect(input).toBeDisabled()
  await expect(input).toHaveValue('recovered-name')
  await expect(page.getByRole('button',{name:'CHECKING…',exact:true})).toBeDisabled()
  await page.evaluate(()=>window.fixtureResolveSession({data:{session:null},error:null}))
  await expect.poll(()=>page.evaluate(()=>window.fixtureDestinations)).toEqual(['/sign-up?name=recovered-name'])
})

for (const screen of ['header','sidebar']) test(screen+' copy waits for the clipboard and reports a denied copy truthfully',async({page})=>{
  await fixture(page,screen,{fixtureUser:{id:'actor-a',username:'actor-a',user_type:'standard'}})
  const copy = page.getByRole('button',{name:screen==='sidebar'?'Copy profile link':'Copy profile URL',exact:true})
  await copy.click()
  expect(await page.evaluate(()=>window.fixtureToasts)).toEqual([])
  await page.evaluate(()=>window.fixtureResolveCopy())
  await expect.poll(()=>page.evaluate(()=>window.fixtureToasts.at(-1)?.type)).toBe('success')
  expect(await page.evaluate(()=>window.fixtureCopied.at(-1))).toBe('https://nsso.test/actor-a')
  await page.evaluate(()=>window.fixtureClipboardMode='error')
  if(screen==='header') await page.getByRole('button',{name:'Open account menu'}).click()
  await copy.click()
  await expect.poll(()=>page.evaluate(()=>window.fixtureToasts.at(-1)?.type)).toBe('error')
})

for(const screen of ['header','sidebar'])for(const mode of ['error','throw'])test(screen+' failed sign-out stays retryable: '+mode,async({page})=>{
  const {errors}=await fixture(page,screen,{fixtureUser:{id:'actor-a',username:'actor-a',user_type:'standard'},fixtureSignOutMode:mode})
  const signOut=page.getByRole('button',{name:'Sign Out',exact:true})
  await signOut.click()
  await expect.poll(()=>page.evaluate(()=>window.fixtureToasts.at(-1)?.type)).toBe('error')
  await expect(signOut).toBeEnabled()
  expect(errors).toEqual([])
})

for(const screen of ['header','sidebar'])test(screen+' stalled sign-out recovers without a late false navigation',async({page})=>{
  await page.clock.install()
  await fixture(page,screen,{fixtureUser:{id:'actor-a',username:'actor-a',user_type:'standard'},fixtureSignOutMode:'pending'})
  let navigations=0
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++})
  await page.evaluate(()=>window.fixtureDocumentSentinel='same-document')
  const signOut=page.getByRole('button',{name:'Sign Out',exact:true})
  await signOut.click()
  await page.clock.fastForward(8100)
  await expect.poll(()=>page.evaluate(()=>window.fixtureToasts.at(-1)?.type)).toBe('error')
  await expect(signOut).toBeEnabled()
  await page.evaluate(()=>window.fixtureResolveSignOut({error:null}))
  await page.clock.fastForward(100)
  await page.waitForTimeout(100)
  await expect(page).toHaveURL('https://nsso.test/')
  expect(navigations).toBe(0)
  expect(await page.evaluate(()=>window.fixtureDocumentSentinel)).toBe('same-document')
  expect(await page.evaluate(()=>window.fixtureSignOutCalls)).toBe(1)
})

test('decorative video waits for visibility and blocked playback does not reject globally',async({page})=>{
  const {errors,videoRequests}=await fixture(page)
  await expect(page.locator('video')).toHaveAttribute('preload','none')
  expect(videoRequests).toEqual([])
  await page.evaluate(()=>window.fixtureIntersection([{isIntersecting:true}]))
  await expect.poll(()=>videoRequests.length).toBeGreaterThan(0)
  await page.waitForTimeout(100)
  expect(errors).toEqual([])
})
