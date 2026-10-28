import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { expectWhiteEditorControls } from './helpers/white-control-assertions.mjs'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
const fixture = `
  import React,{useRef,useState} from 'react';import{createRoot}from'react-dom/client';
  import{TahoeGlassEngineContext}from'./src/components/providers/TahoeGlassProvider';
  import{TahoeGlassDialog,TahoeGlassPopover,TahoeGlassButton}from'./src/components/ui/tahoe-glass';
  import ConfirmDelete from './src/app/dashboard/components/ConfirmDeleteDialog';
  import Cropper from './src/components/ui/ImageCropperModal';
  import Meta from './src/components/analytics/MetaPixelConsent';
  import SaveStatus from './src/components/profile/ProfileSaveStatus';
  import{ToastProvider,ToastViewport,useToast}from'./src/components/ui/Toast';
  window.registrations=[];window.deleteCalls=0;window.cropCalls=0;window.retrySaveCalls=0;window.refreshSaveCalls=0;
  const context={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'white-panel-fixture',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1},
    registerSurface(id,element,options){window.registrations.push({id,refractive:options?.refractive,name:element.getAttribute('data-tahoe-glass-surface')})},unregisterSurface(){},requestRender(){}};
  const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#9abfd1"/><circle cx="100" cy="100" r="60" fill="#335577"/></svg>');
  function App(){const[mode,setMode]=useState('');const[saveState,setSaveState]=useState({status:'saved',message:'',loadError:null});const{showToast}=useToast();const initial=useRef(null);
    window.setSyntheticSaveState=setSaveState;window.whiteSaveProfile={mutationState:{status:saveState.status,message:saveState.message},loadError:saveState.loadError,retryPending:async()=>{window.retrySaveCalls++},refreshProfile:async()=>{window.refreshSaveCalls++}};
    return <>
    <div id="outside"><button onClick={()=>setMode('white')}>Open white dialog</button><button onClick={()=>setMode('dark')}>Open legacy dialog</button><button onClick={()=>setMode('popover')}>Open white help</button><button onClick={()=>setMode('delete')}>Remove synthetic item</button><button onClick={()=>setMode('crop')}>Crop synthetic image</button><button onClick={()=>setMode('privacy')}>Open privacy choices</button>
      {['success','error','info'].map(type=><button key={type} onClick={()=>showToast(type+' synthetic notice',type)}>Show {type} notice</button>)}</div>
    <TahoeGlassDialog open={mode==='white'||mode==='dark'} onOpenChange={open=>{if(!open)setMode('')}} readingMaterial={mode==='white'?'white':'dark'} title="Reading fixture" description="A readable explanation on an opaque panel." initialFocusRef={initial} className="max-w-md" contentClassName="space-y-4">
      <p data-reading-body>Body text inherits the approved reading material.</p><TahoeGlassButton ref={initial} onClick={()=>setMode('')}>Close reading fixture</TahoeGlassButton>
    </TahoeGlassDialog>
    <TahoeGlassPopover open={mode==='popover'} onOpenChange={open=>{if(!open)setMode('')}} readingMaterial="white" aria-label="White help fixture" style={{top:100,left:16,width:'min(360px,calc(100vw - 32px))'}}><p data-help-body>A small readable help panel.</p><button onClick={()=>setMode('')}>Close help fixture</button></TahoeGlassPopover>
    <ConfirmDelete open={mode==='delete'} name="synthetic item" onClose={()=>setMode('')} onConfirm={()=>{window.deleteCalls++;return new Promise(resolve=>window.resolveSyntheticDelete=resolve)}}/>
    <Cropper isOpen={mode==='crop'} onClose={()=>setMode('')} imageSrc={image} aspectRatio={1} onCropComplete={async()=>{window.cropCalls++;}}/>
    {mode==='privacy'&&<div data-fixture-consent><Meta pixelId="1234567890" initialConsent="unset"/></div>}
    <SaveStatus/>
    <ToastViewport/>
  </>}
  const app=createRoot(document.getElementById('root'));window.disposeWhiteFixture=()=>app.unmount();app.render(<TahoeGlassEngineContext.Provider value={context}><ToastProvider><App/></ToastProvider></TahoeGlassEngineContext.Provider>);
`

test.beforeAll(async () => {
  const sources = [
    'src/components/ui/light-panel.ts', 'src/components/ui/LightButton.tsx', 'src/components/ui/light-button-styles.ts',
    'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx',
    'src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx',
    'src/components/ui/tahoe-glass/TahoeGlassField.tsx',
    'src/app/dashboard/components/ConfirmDeleteDialog.tsx',
    'src/components/ui/ImageCropperModal.tsx',
    'src/components/ui/Toast.tsx',
    'src/components/analytics/MetaPixelConsent.tsx',
    'src/components/profile/ProfileSaveStatus.tsx',
  ].map(file => readFileSync(root + file, 'utf8')).join('\n') + fixture
  const candidates = [...sources.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/))
  const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
  css = compiler.build(candidates) + '\nbody{margin:0;min-height:1600px;background:#04102a;font-family:Arial}#outside{padding:16px;display:flex;flex-wrap:wrap;gap:12px}#outside button{min-height:44px;padding:8px 16px;background:#eefaff;color:#111;border-radius:12px}'
  const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'local-navigation-only', setup(builder) {
      builder.onResolve({ filter: /^(next\/link|@\/components\/providers\/ProfileProvider)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents: path === 'next/link'
        ? 'export default function Link({children,...props}){return <a {...props}>{children}</a>}'
        : 'export const useProfile=()=>window.whiteSaveProfile;' }))
    } }], stdin: { resolveDir: root, loader: 'tsx', contents: fixture } })
  bundle = result.outputFiles[0].text
})

async function mount(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const external = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.hostname !== 'nsso.test') {
      external.push(url.href)
      if (url.hostname === 'connect.facebook.net') return route.fulfill({ contentType: 'application/javascript', body: 'window.syntheticPixelLoaded=true;' })
      return route.abort()
    }
    if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
    if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
    return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
  })
  await page.goto('https://nsso.test/white-panels')
  return { external, errors }
}

function luminance(rgb) {
  return rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0)
}

async function expectTextContrast(locator, white = true) {
  const { rgb, opacity, shadow } = await locator.evaluate(element => {
    const context = document.createElement('canvas').getContext('2d')
    context.fillStyle = getComputedStyle(element).color; context.fillRect(0, 0, 1, 1)
    let opacity = 1
    for (let current = element; current; current = current.parentElement) opacity *= Number(getComputedStyle(current).opacity)
    return { rgb: [...context.getImageData(0, 0, 1, 1).data], opacity, shadow: getComputedStyle(element).textShadow }
  })
  if (white) expect(shadow).toBe('none')
  const backgrounds = white ? [[227, 231, 237], [226, 226, 237], [236, 224, 226]] : [[32, 33, 38]]
  for (const background of backgrounds) {
    const alpha = opacity * rgb[3] / 255
    const composite = rgb.slice(0, 3).map((value, i) => value * alpha + background[i] * (1 - alpha))
    const a = luminance(composite), b = luminance(background)
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5)
  }
}

async function expectWhiteBacking(page, panel) {
  await expect(panel).toHaveAttribute('data-reading-material', 'white')
  expect(await panel.evaluate(element => getComputedStyle(element, '::before').backgroundColor)).toBe('rgb(227, 231, 237)')
  const samples = []
  for (const background of ['#000', '#fff']) {
    await page.evaluate(value => { document.body.style.background = value }, background)
    const { data, info } = await sharp(await panel.screenshot({ scale: 'css' })).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const offset = (8 * info.width + Math.floor(info.width / 2)) * info.channels
    samples.push([...data.subarray(offset, offset + 3)])
  }
  expect(samples[0]).toEqual(samples[1])
  expect(Math.min(...samples[0])).toBeGreaterThan(200)
  await expect(panel).not.toHaveAttribute('data-tahoe-chromium-optics')
  await expect(panel.locator('[data-tahoe-chromium-optics]')).toHaveCount(0)
}

async function expectTarget(control) {
  const box = await control.boundingBox()
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
}

async function expectKeyboardFocus(page, control) {
  await page.keyboard.press('Tab')
  await control.focus()
  await expect(control).toBeFocused()
  const outline = await control.evaluate(element => {
    const style = getComputedStyle(element)
    const context = document.createElement('canvas').getContext('2d')
    context.fillStyle = style.outlineColor; context.fillRect(0, 0, 1, 1)
    return { visible: element.matches(':focus-visible'), style: style.outlineStyle, width: parseFloat(style.outlineWidth), rgb: [...context.getImageData(0, 0, 1, 1).data] }
  })
  expect(outline.visible).toBe(true)
  expect(outline.style).toBe('solid')
  expect(outline.width).toBeGreaterThanOrEqual(2)
  const background = [226, 226, 237]
  const composite = outline.rgb.slice(0, 3).map((value, i) => value * outline.rgb[3] / 255 + background[i] * (1 - outline.rgb[3] / 255))
  const a = luminance(composite), b = luminance(background)
  expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(3)
}

test('white reading dialogs and help paint opaque, retain dark default, and keep keyboard focus readable', async ({ page }) => {
  const { errors } = await mount(page)
  const trigger = page.getByRole('button', { name: 'Open white dialog', exact: true })
  await trigger.press('Enter')
  const panel = page.getByRole('dialog', { name: 'Reading fixture', exact: true })
  await expectWhiteBacking(page, panel)
  await expectTextContrast(panel.getByRole('heading'))
  await expectTextContrast(panel.locator('[data-reading-body]'))
  await expectTextContrast(panel.locator('p').first())
  const close = panel.getByRole('button', { name: 'Close reading fixture', exact: true })
  await expect(close).toBeFocused()
  await expectTarget(close)
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await expectKeyboardFocus(page, close)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await page.getByRole('button', { name: 'Open legacy dialog', exact: true }).click()
  const dark = page.getByRole('dialog', { name: 'Reading fixture', exact: true })
  expect(await dark.evaluate(element => getComputedStyle(element, '::before').backgroundColor)).toBe('rgb(32, 33, 38)')
  await expectTextContrast(dark.getByRole('heading'), false)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Open white help', exact: true }).click()
  const help = page.getByRole('dialog', { name: 'White help fixture', exact: true })
  await expectWhiteBacking(page, help)
  await expectTextContrast(help.locator('[data-help-body]'))
  await expectKeyboardFocus(page, help.getByRole('button', { name: 'Close help fixture', exact: true }))
  expect(await page.evaluate(() => window.registrations.some(entry => entry.refractive))).toBe(false)
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.disposeWhiteFixture())
  expect(errors).toEqual([])
})

test('white removal confirmation stays busy and preserves the item after a failed synthetic save', async ({ page }) => {
  const { errors, external } = await mount(page)
  await page.getByRole('button', { name: 'Remove synthetic item', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Delete synthetic item?', exact: true })
  await expectWhiteBacking(page, panel)
  const keep = panel.getByRole('button', { name: 'Keep item', exact: true })
  await expect(keep).toBeFocused()
  await expectTarget(keep)
  await expectTarget(panel.getByRole('button', { name: 'Delete', exact: true }))
  await expectTextContrast(panel.getByRole('heading'))
  await expectTextContrast(panel.locator('p').first())
  await expectKeyboardFocus(page, panel.getByRole('button', { name: 'Delete', exact: true }))
  await expectTextContrast(panel.getByRole('button', { name: 'Delete', exact: true }).locator('[data-light-button-content]'))
  await panel.getByRole('button', { name: 'Delete', exact: true }).press('Enter')
  await expect(panel.getByRole('button', { name: 'Deleting…', exact: true })).toBeDisabled()
  await expect(keep).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(panel).toBeVisible()
  expect(await page.evaluate(() => window.deleteCalls)).toBe(1)
  await page.evaluate(() => window.resolveSyntheticDelete(false))
  await expect(panel.getByRole('alert')).toContainText('Removal could not be confirmed')
  await expectTextContrast(panel.getByRole('alert'))
  await expect(panel.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled()
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(panel).toHaveCount(0)
  expect(external).toEqual([])
  await page.evaluate(() => window.disposeWhiteFixture())
  expect(errors).toEqual([])
})

test('cropper uses white reading chrome and an opaque dark editing stage with working keyboard zoom', async ({ page }) => {
  const { errors, external } = await mount(page)
  await page.getByRole('button', { name: 'Crop synthetic image', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Crop Image', exact: true })
  await expect(panel).toHaveAttribute('data-reading-material', 'white')
  await expectTextContrast(panel.getByRole('heading'))
  const stage = panel.locator('.reactEasyCrop_Container').locator('..')
  await expect(stage).toHaveCSS('background-color', 'rgb(32, 33, 38)')
  const zoom = panel.getByRole('slider', { name: 'Zoom', exact: true })
  await expectTarget(zoom)
  await zoom.focus()
  await zoom.press('ArrowRight')
  await expect(zoom).toHaveValue('1.1')
  await expectKeyboardFocus(page, zoom)
  await expectTarget(panel.getByRole('button', { name: 'Close image cropper', exact: true }))
  await expectTarget(panel.getByRole('button', { name: 'Cancel', exact: true }))
  await expectTarget(panel.getByRole('button', { name: 'Apply Crop', exact: true }))
  await expectTextContrast(panel.getByRole('button', { name: 'Apply Crop', exact: true }).locator('[data-light-button-content]'))
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(panel).toHaveCount(0)
  expect(await page.evaluate(() => window.cropCalls)).toBe(0)
  expect(external).toEqual([])
  await page.evaluate(() => window.disposeWhiteFixture())
  expect(errors).toEqual([])
})

test('white notification statuses retain semantic announcements, contrast and accessible dismissal', async ({ page }) => {
  const { errors } = await mount(page)
  for (const type of ['success', 'error', 'info']) {
    await page.getByRole('button', { name: `Show ${type} notice`, exact: true }).click()
    const message = `${type} synthetic notice`
    await expect(page.getByRole(type === 'error' ? 'alert' : 'status')).toHaveText(message)
    const dismiss = page.getByRole('button', { name: `Dismiss notification: ${message}`, exact: true })
    await expect(dismiss).toHaveCSS('animation-name', 'none')
    await expect(dismiss).toHaveCSS('opacity', '1')
    await expect(dismiss).toHaveCSS('background-color', 'rgb(227, 231, 237)')
    await expectTextContrast(dismiss)
    await expectTarget(dismiss)
    await expectKeyboardFocus(page, dismiss)
    await dismiss.press('Enter')
    await expect(dismiss).toHaveCount(0)
  }
  await page.evaluate(() => window.disposeWhiteFixture())
  expect(errors).toEqual([])
})

test('white marketing consent never requests a provider before an explicit Allow choice', async ({ page }) => {
  const { errors, external } = await mount(page)
  await page.getByRole('button', { name: 'Open privacy choices', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Marketing privacy', exact: true })
  await expectWhiteBacking(page, panel)
  await expectTextContrast(panel.getByRole('heading'))
  await expectTextContrast(panel.locator('p').first())
  const notice = panel.getByRole('link', { name: 'Read the tracking notice', exact: true })
  await expect(notice).toBeFocused()
  await expectTarget(notice)
  await expectKeyboardFocus(page, notice)
  await expectWhiteEditorControls(panel)
  for (const name of ['Decline', 'Allow']) await expectTarget(panel.getByRole('button', { name, exact: true }))
  await expectTextContrast(panel.getByRole('button', { name: 'Allow', exact: true }).locator('[data-light-button-content]'))
  expect(external).toEqual([])
  await page.keyboard.press('Escape')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Decline', exact: true }).press('Enter')
  await expect(panel).toHaveCount(0)
  expect(external).toEqual([])
  expect(await page.context().cookies()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'nsso_meta_marketing_consent', value: 'denied' })]))
  await expectWhiteEditorControls(page.locator('[data-fixture-consent]'))
  await page.getByRole('button', { name: 'Privacy choices', exact: true }).click()
  await expect(panel).toBeVisible()
  expect(external).toEqual([])
  await panel.getByRole('button', { name: 'Allow', exact: true }).press('Enter')
  await expect.poll(() => page.evaluate(() => window.syntheticPixelLoaded)).toBe(true)
  expect(external).toHaveLength(1)
  expect(external[0]).toBe('https://connect.facebook.net/en_US/fbevents.js')
  expect(await page.evaluate(() => window.fbq.queue)).toEqual(expect.arrayContaining([['init', '1234567890'], ['consent', 'grant'], ['track', 'PageView']]))
  await page.evaluate(() => window.disposeWhiteFixture())
  expect(errors).toEqual([])
})

test('white profile save feedback preserves saving, failed retry and refresh states', async ({ page }) => {
  const { errors, external } = await mount(page)
  const status = page.locator('[data-profile-save-status]')
  await expect(status).toHaveCount(0)
  await page.evaluate(() => window.setSyntheticSaveState({ status: 'saving', message: 'Saving synthetic changes…', loadError: null }))
  await expect(status).toHaveAttribute('role', 'status')
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await expect(status).toContainText('Saving synthetic changes…')
  await expect(status).toHaveCSS('background-color', 'rgb(227, 231, 237)')
  await expectTextContrast(status.locator('p'))
  await expect(status.getByRole('button')).toHaveCount(0)
  await expect(status).not.toHaveAttribute('data-tahoe-chromium-optics')
  await page.evaluate(() => window.setSyntheticSaveState({ status: 'failed', message: 'Synthetic changes were not confirmed. Your draft is kept.', loadError: null }))
  const retry = status.getByRole('button', { name: 'Check status and retry my draft', exact: true })
  await expectTextContrast(status.locator('p'))
  await expectTextContrast(retry)
  await expectTarget(retry)
  await expectKeyboardFocus(page, retry)
  await retry.press('Enter')
  expect(await page.evaluate(() => window.retrySaveCalls)).toBe(1)
  await expect(status).toBeVisible()
  await page.evaluate(() => window.setSyntheticSaveState({ status: 'saved', message: '', loadError: 'Synthetic profile read failed. Your saved profile is kept.' }))
  const refresh = status.getByRole('button', { name: 'Refresh profile', exact: true })
  await expectTextContrast(status.locator('p'))
  await expectTextContrast(refresh)
  await expectTarget(refresh)
  await expectKeyboardFocus(page, refresh)
  await refresh.press('Enter')
  expect(await page.evaluate(() => window.refreshSaveCalls)).toBe(1)
  await expect(status).toBeVisible()
  await page.evaluate(() => window.setSyntheticSaveState({ status: 'saved', message: '', loadError: null }))
  await expect(status).toHaveCount(0)
  expect(external).toEqual([])
  await page.evaluate(() => window.disposeWhiteFixture())
  expect(errors).toEqual([])
})
