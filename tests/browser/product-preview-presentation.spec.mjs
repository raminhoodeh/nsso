import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../../', import.meta.url))
const productId = '33333333-3333-4333-8333-333333333333'
let bundle, css

// Real product rendering, real Tahoe provider/surfaces and the pinned Vanta
// assets run together. Only account/data and Next's router are synthetic.
test.beforeAll(async () => {
    const files = [
        'src/app/products/[id]/page.tsx', 'src/components/VantaBackground.tsx',
        'src/components/providers/NSSOTahoeGlassEnvironment.tsx', 'src/components/providers/TahoeGlassProvider.tsx',
        'src/components/ui/PreviewCheckoutButton.tsx', 'src/components/ui/PayPalSmartButton.tsx',
        'src/components/ui/GlassButton.tsx', 'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx',
        'src/components/ui/experimental/liquid-glass-candidate.tsx',
    ]
    const candidates = files.flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root, onDependency() {} })
    css = compiler.build(candidates)
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'product-presentation-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|image|link)|@\/lib\/supabase\/(?:client|public)|@\/components\/providers\/UserProvider)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? `import{useSyncExternalStore}from'react';export const usePathname=()=>useSyncExternalStore(window.fixtureSubscribe,()=>window.fixturePath),useParams=()=>({id:'${productId}'}),useRouter=()=>window.fixtureRouter,useSearchParams=()=>new URLSearchParams(window.fixturePreview?'preview=true':'');`
                    : path === 'next/image' ? 'export default({fill,priority,...props})=><img {...props} style={fill?{position:"absolute",inset:0,width:"100%",height:"100%"}:undefined}/>;'
                        : path === 'next/link' ? 'export default({children,...props})=><a {...props}>{children}</a>;'
                            : path.endsWith('UserProvider') ? 'export const useUser=()=>({user:null,loading:false,error:null});'
                                : path.endsWith('/public') ? 'export const createPublicReadClient=()=>window.fixturePublic;'
                                    : 'export const createClient=()=>{throw new Error("No authenticated client is allowed in this public fixture")};' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React,{useSyncExternalStore}from'react';import{createRoot}from'react-dom/client';
            import Product from'./src/app/products/[id]/page';import Environment from'./src/components/providers/NSSOTahoeGlassEnvironment';import{UIProvider}from'./src/components/providers/UIProvider';
            window.fixturePath='/preview';window.fixturePreview=false;const listeners=new Set();window.fixtureSubscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};
            window.fixtureNavigate=(path,preview=false)=>{window.fixturePath=path;window.fixturePreview=preview;listeners.forEach(fn=>fn())};window.fixtureRouter={push:path=>window.fixtureNavigate(path),back:()=>window.fixtureNavigate('/preview')};
            const product={id:'${productId}',user_id:'11111111-1111-4111-8111-111111111111',name:'Portfolio review',headline:'Your next chapter starts here',tagline:'A thoughtful review of your story',intro_text:'A synthetic offering used to verify product presentation.',price:'GBP 35',description:'A synthetic review',benefits:['Practical feedback on your portfolio'],testimonials:[{name:'Fixture customer',text:'Clear and useful guidance.'}],video_url:'',image_url:'/fixture-product.svg',purchase_link:'https://seller.example.test/pay',purchase_link_active:true,paypal_active:true,sales_page_published:true,value_proposition:'One personal portfolio review, with clear next steps and helpful written feedback.',payment_config:{version:1,kind:'payment-form',action:'https://www.paypal.com/ncp/payment/AB12CD34EF56G',fields:[],label:'Buy Now'}};
            const result=data=>({select(){return this},eq(){return this},abortSignal(){return this},single(){return Promise.resolve({data,error:null})},then(resolve,reject){return Promise.resolve({data,error:null}).then(resolve,reject)}});
            window.fixturePublic={rpc(){return{abortSignal:async()=>{await new Promise(resolve=>setTimeout(resolve,100));return{data:product,error:null}}}},from(table){return result(table==='users'?{username:'fixture-seller'}:[])}};
            function App(){const path=useSyncExternalStore(window.fixtureSubscribe,()=>window.fixturePath);return <UIProvider><Environment>{path.startsWith('/products/')?<Product/>:<main style={{position:'relative',padding:40,color:'white'}}><h1>Fixture profile</h1><button style={{padding:20}} onClick={()=>window.fixtureNavigate('/products/${productId}')}>Open fixture offering</button></main>}</Environment></UIProvider>};
            createRoot(document.getElementById('root')).render(<App/>);
        ` } })
    bundle = result.outputFiles[0].text
})

async function mount(page) {
    const errors = [], unexpected = [], requests = []
    page.on('pageerror', error => errors.push(error.message))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('**/*', async route => {
        const url = new URL(route.request().url())
        requests.push(url.pathname)
        if (url.origin !== 'https://nsso.test') { unexpected.push(url.href); return route.abort() }
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (url.pathname.startsWith('/vendor/')) return route.fulfill({ contentType: 'application/javascript', body: readFileSync(root + 'public' + url.pathname) })
        if (url.pathname === '/guaranteed-logo.png') return route.fulfill({ contentType: 'image/png', body: readFileSync(root + 'public/guaranteed-logo.png') })
        if (url.pathname === '/fixture-product.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#2e596d"/><circle cx="300" cy="250" r="130" fill="#d8b79b"/><text x="300" y="490" text-anchor="middle" fill="white" font-size="42">Portfolio review</text></svg>' })
        if (url.pathname === '/presentation-fixture') return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
        unexpected.push(url.href)
        return route.abort()
    })
    await page.goto('https://nsso.test/presentation-fixture')
    await page.waitForFunction(() => document.querySelector('#vanta-bg canvas'))
    await page.evaluate(() => { window.fixtureCanvas = document.querySelector('#vanta-bg canvas') })
    return { errors, unexpected, requests }
}

test('profile-to-product transition keeps one live blue scene and readable purchase context', async ({ page }, testInfo) => {
    const { errors, unexpected, requests } = await mount(page)
    await page.getByRole('button', { name: 'Open fixture offering', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your next chapter starts here', exact: true })).toBeVisible()
    const support = page.locator('[data-product-purchase-support]:visible')
    await expect(support).toHaveCount(1)
    await support.scrollIntoViewIfNeeded()
    const textColor = await support.evaluate(element => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
        const context = canvas.getContext('2d'); context.fillStyle = getComputedStyle(element).color; context.fillRect(0, 0, 1, 1)
        return [...context.getImageData(0, 0, 1, 1).data]
    })
    for (const channel of textColor.slice(0, 3)) expect(channel).toBeGreaterThanOrEqual(250)
    expect(textColor[3]).toBeGreaterThanOrEqual(225)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('form:visible')).toHaveCount(1)
    expect(await page.evaluate(() => window.fixtureCanvas === document.querySelector('#vanta-bg canvas'))).toBe(true)
    const frames = await page.evaluate(async () => {
        const samples = []
        for (let i = 0; i < 20; i++) {
            await new Promise(requestAnimationFrame)
            const scene = document.querySelector('[data-tahoe-glass-viewport] > div')
            samples.push(getComputedStyle(scene).backgroundColor)
        }
        return samples
    })
    expect([...new Set(frames)]).toEqual(['rgb(88, 110, 145)'])
    expect(requests.some(path => path.includes('siri-gradient'))).toBe(false)
    const screenshot = await page.screenshot({ path: testInfo.outputPath('product-blue-background.png') })
    const { data } = await sharp(screenshot).extract({ left: 4, top: 40, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
    expect(data[2]).toBeGreaterThan(data[0] + 8)
    expect(data[1]).toBeGreaterThan(data[0] + 5)
    await page.getByRole('button', { name: 'Back to Profile', exact: true }).click()
    await page.getByRole('button', { name: 'Open fixture offering', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your next chapter starts here', exact: true })).toBeVisible()
    expect(await page.evaluate(() => window.fixtureCanvas === document.querySelector('#vanta-bg canvas'))).toBe(true)
    expect(errors).toEqual([])
    expect(unexpected).toEqual([])
})

test('styled preview explains a keyboard checkout attempt without starting a payment or showing a top banner', async ({ page }, testInfo) => {
    const { errors, unexpected, requests } = await mount(page)
    await page.evaluate(id => window.fixtureNavigate('/products/' + id, true), productId)
    await expect(page.getByRole('heading', { name: 'Your next chapter starts here', exact: true })).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(page.getByText('Draft preview — checkout is disabled.', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Buy Now', exact: true }).filter({ visible: true }).press('Enter')
    await expect(page.getByRole('status')).toHaveText('Checkout is disabled during profile preview')
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.locator('a[href="https://seller.example.test/pay"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Link to Purchase', exact: true }).filter({ visible: true })).toBeEnabled()
    expect(requests.some(path => path.includes('/sdk/js'))).toBe(false)
    await page.screenshot({ path: testInfo.outputPath('product-preview-checkout-notice.png') })
    expect(errors).toEqual([])
    expect(unexpected).toEqual([])
})
