import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
const source = `
 import React from 'react';import {createRoot}from'react-dom/client';
 import{LightButton}from'./src/components/ui/LightButton';import Ask from'./src/components/ui/AskDeityButton';
 import{NativeGlassLens}from'./src/components/ui/tahoe-glass/NativeGlassLens';
 import{LIGHT_PANEL}from'./src/components/ui/light-panel';import{TahoeGlassEngineContext}from'./src/components/providers/TahoeGlassProvider';
 window.nativeActions=[];window.nativeRefEvents=[];window.nativeSubmits=0;window.nativeSurfaces=new Map();window.nativeOptions=[];window.nativeRegistryEvents=[];window.nativeReplacementRefEvents=[];
 const diagnostics={status:'fallback',backend:'css-blur',source:'synthetic-native-contract',reason:'native-contract',reducedMotion:false,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1};
 const registerSurface=(id,element,options)=>{window.nativeSurfaces.set(id,element);window.nativeOptions.push(options);window.nativeRegistryEvents.push({kind:'register',id,tag:element.tagName})};
 const unregisterSurface=id=>{const element=window.nativeSurfaces.get(id);window.nativeRegistryEvents.push({kind:'unregister',id,tag:element?.tagName});window.nativeSurfaces.delete(id)};
 const callbackRef=element=>{if(!element){window.nativeRefEvents.push('null');return}window.nativeRefEvents.push('attach');return()=>window.nativeRefEvents.push('cleanup')};
 const ClientLink=React.forwardRef(function ClientLink({children,...props},ref){return<a {...props} ref={ref}>{children}</a>});
 const app=createRoot(document.getElementById('root'));window.nativeUnmount=()=>app.unmount();
 function App(){const[family,setFamily]=React.useState('supplied');window.nativeSetFamily=setFamily;const anchorRef=React.useRef(null);React.useEffect(()=>{window.nativeAnchorRef=anchorRef});
  const[replaceVisible,setReplaceVisible]=React.useState(false),[replaceAs,setReplaceAs]=React.useState('button'),[refVersion,setRefVersion]=React.useState(0);window.nativeShowReplacement=setReplaceVisible;window.nativeReplaceAs=setReplaceAs;window.nativeSetRefVersion=setRefVersion;
  const replacementRef=React.useCallback(element=>{if(!element){window.nativeReplacementRefEvents.push({kind:'null',version:refVersion});return}window.nativeReplacementRefEvents.push({kind:'attach',version:refVersion,tag:element.tagName});return()=>window.nativeReplacementRefEvents.push({kind:'cleanup',version:refVersion,tag:element.tagName})},[refVersion]);
  const context=React.useMemo(()=>({diagnostics,registerSurface,unregisterSurface,requestRender(){},materialFamily:family}),[family]);
  return<TahoeGlassEngineContext.Provider value={context}><form aria-label="Synthetic native form" onSubmit={event=>{event.preventDefault();window.nativeSubmits++}}>
   <LightButton ref={callbackRef} onClick={()=>window.nativeActions.push('normal')}>Native action</LightButton>
   <LightButton type="submit">Submit once</LightButton>
   <LightButton disabled onClick={()=>window.nativeActions.push('disabled')}>Unavailable</LightButton>
   <Ask onClick={()=>window.nativeActions.push('ask')}/>
   <NativeGlassLens as={ClientLink} ref={anchorRef} href="/client-target" className={LIGHT_PANEL.control+' inline-flex min-h-11 items-center rounded-full px-4 py-2'} onClick={event=>{event.preventDefault();window.nativeActions.push('client navigation')}}>Client navigation</NativeGlassLens>
   <NativeGlassLens as="label" className={LIGHT_PANEL.control+' inline-flex min-h-11 items-center rounded-full px-4 py-2'}>Upload fixture<input aria-label="Upload fixture" type="file" className="sr-only" onChange={()=>window.nativeActions.push('upload')}/></NativeGlassLens>
   {replaceVisible&&<NativeGlassLens as={replaceAs} ref={replacementRef} data-testid="replaceable-lens" data-ref-version={refVersion} href={replaceAs==='a'?'/replacement-target':undefined} type={replaceAs==='button'?'button':undefined} className={LIGHT_PANEL.control+' inline-flex min-h-11 items-center rounded-full px-4 py-2'}>Replaceable native lens</NativeGlassLens>}
  </form></TahoeGlassEngineContext.Provider>}
 app.render(<React.StrictMode><App/></React.StrictMode>);
`

test.beforeAll(async () => {
    const sources = ['src/components/ui/LightButton.tsx', 'src/components/ui/AskDeityButton.tsx', 'src/components/ui/light-button-styles.ts', 'src/components/ui/light-panel.ts', 'src/components/ui/apple-tahoe-liquid-glass-button.tsx', 'src/components/ui/tahoe-glass/NativeGlassLens.tsx'].map(file => readFileSync(root + file, 'utf8')).join('\n') + source
    const candidates = [...sources.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates) + '\nbody{background:#91abc3;font-family:Arial;margin:0;padding:24px}form{display:flex;align-items:center;gap:12px;flex-wrap:wrap}*{box-sizing:border-box}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, stdin: { resolveDir: root, loader: 'tsx', contents: source } })
    bundle = result.outputFiles[0].text
})

async function mount(page) {
    const errors = [], external = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin !== 'https://nsso.test') { external.push(url.href); return route.abort() }
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script>window.nativeRafCalls=0;const nativeRAF=requestAnimationFrame;window.requestAnimationFrame=(...args)=>{window.nativeRafCalls++;return nativeRAF(...args)};</script><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/native-contract')
    await expect(page.getByRole('button', { name: 'Native action', exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.nativeSurfaces.size)).toBe(6)
    return { errors, external }
}

test('supplied native lenses preserve form, link, upload and ref behavior through strict mounting', async ({ page }) => {
    const state = await mount(page)
    const normal = page.getByRole('button', { name: 'Native action', exact: true })
    await expect(normal).toHaveAttribute('type', 'button')
    await expect(normal).toHaveAttribute('data-tahoe-native-lens', 'supplied')
    await expect(normal.locator('[data-supplied-glass-layer="coat"]')).toHaveCount(1)
    await expect(normal.locator('[data-supplied-glass-layer="rim"]')).toHaveCount(1)
    const material = await normal.locator('[data-supplied-glass-layer="coat"]').evaluate(element => ({ background: getComputedStyle(element).backgroundColor, shadow: getComputedStyle(element).boxShadow, filter: getComputedStyle(element).backdropFilter }))
    expect(material.background).toBe('color(srgb 1 1 1 / 0.25)')
    expect(material.shadow.split('inset').length).toBeGreaterThan(6)
    expect(material.filter).toContain('blur(2px)')
    await normal.click()
    expect(await page.evaluate(() => window.nativeSubmits)).toBe(0)
    const submit = page.getByRole('button', { name: 'Submit once', exact: true })
    await submit.focus(); await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => window.nativeSubmits)).toBe(1)
    await expect(page.getByRole('button', { name: 'Unavailable', exact: true })).toBeDisabled()
    const ask = page.getByRole('button', { name: 'Ask Deity', exact: true })
    await ask.focus(); await page.keyboard.press('Enter')
    const askBounds = await ask.boundingBox(), lensBounds = await ask.locator('[data-ask-deity-lens]').boundingBox()
    expect(askBounds.height).toBeGreaterThanOrEqual(44)
    expect(askBounds.width).toBeGreaterThanOrEqual(44)
    expect(lensBounds.height).toBe(28)
    const anchor = page.getByRole('link', { name: 'Client navigation', exact: true })
    await expect(anchor).toHaveAttribute('href', '/client-target')
    expect(await anchor.evaluate(element => window.nativeAnchorRef.current === element)).toBe(true)
    await anchor.click()
    await page.getByLabel('Upload fixture', { exact: true }).setInputFiles({ name: 'synthetic.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic fixture') })
    expect(await page.evaluate(() => window.nativeActions)).toEqual(['normal', 'ask', 'client navigation', 'upload'])
    expect(await page.evaluate(() => window.nativeOptions.every(option => option.continuous === false && option.displacementProfile === 'convex' && option.refractive === true))).toBe(true)
    expect(await page.locator('canvas').count()).toBe(0)
    expect(await page.evaluate(() => window.nativeRafCalls)).toBe(0)
    await page.evaluate(() => window.nativeUnmount())
    await expect.poll(() => page.evaluate(() => window.nativeSurfaces.size)).toBe(0)
    const refs = await page.evaluate(() => window.nativeRefEvents)
    expect(refs.filter(value => value === 'attach').length).toBeGreaterThan(0)
    expect(refs.filter(value => value === 'cleanup')).toHaveLength(refs.filter(value => value === 'attach').length)
    expect(refs).not.toContain('null')
    expect(state.errors).toEqual([])
    expect(state.external).toEqual([])
})

test('supplied native lenses keep solid accessibility fallback and unregister when family changes', async ({ page }) => {
    const state = await mount(page)
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
    const action = page.getByRole('button', { name: 'Native action', exact: true })
    const fallback = await action.locator('[data-supplied-glass-layer="coat"]').evaluate(element => ({ filter: getComputedStyle(element).backdropFilter, shadow: getComputedStyle(element).boxShadow }))
    expect(fallback).toEqual({ filter: 'none', shadow: 'none' })
    await action.focus()
    const focus = await action.evaluate(element => ({ width: getComputedStyle(element).outlineWidth, style: getComputedStyle(element).outlineStyle }))
    expect(focus.style).toBe('solid')
    expect(parseFloat(focus.width)).toBeGreaterThanOrEqual(2)
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' })
    await page.evaluate(() => window.nativeSetFamily('candidate'))
    await expect.poll(() => page.evaluate(() => window.nativeSurfaces.size)).toBe(0)
    await expect(action).not.toHaveAttribute('data-tahoe-native-lens')
    await expect(page.locator('[data-supplied-glass-layer]')).toHaveCount(0)
    await action.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))) })
    expect(await action.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(255, 255, 255, 0.28)')
    await page.evaluate(() => window.nativeUnmount())
    expect(state.errors).toEqual([])
    expect(state.external).toEqual([])
})


test('polymorphic native roots replace their registered DOM node without callback-ref churn', async ({ page }) => {
    const state = await mount(page)
    await page.evaluate(() => window.nativeShowReplacement(true))
    const lens = page.getByTestId('replaceable-lens')
    await expect(lens).toHaveJSProperty('tagName', 'BUTTON')
    await expect.poll(() => page.evaluate(() => window.nativeSurfaces.size)).toBe(7)
    const original = await lens.evaluate(element => {
        window.nativeReplacementOldNode = element
        const entry = [...window.nativeSurfaces.entries()].find(([, node]) => node === element)
        window.nativeReplacementId = entry?.[0]
        return { id: entry?.[0], registrations: window.nativeRegistryEvents.filter(event => event.id === entry?.[0]).length }
    })
    expect(original.id).toBeTruthy()
    await page.evaluate(() => window.nativeReplaceAs('a'))
    await expect(lens).toHaveJSProperty('tagName', 'A')
    await expect(lens).toHaveAttribute('href', '/replacement-target')
    await expect.poll(() => lens.evaluate(element => window.nativeSurfaces.get(window.nativeReplacementId) === element)).toBe(true)
    expect(await page.evaluate(() => window.nativeReplacementOldNode.isConnected)).toBe(false)
    expect(await page.evaluate(() => [...window.nativeSurfaces.values()].every(element => element.isConnected))).toBe(true)
    expect(await page.evaluate(() => window.nativeSurfaces.size)).toBe(7)
    const replacementEvents = await page.evaluate(start => window.nativeRegistryEvents.filter(event => event.id === window.nativeReplacementId).slice(start), original.registrations)
    expect(replacementEvents.map(event => ({ kind: event.kind, tag: event.tag }))).toEqual([
        { kind: 'unregister', tag: 'BUTTON' }, { kind: 'register', tag: 'A' },
    ])
    // A new forwarded callback on the same connected anchor must receive its
    // own cleanup/attach cycle without rebuilding the provider's field.
    const beforeCallbackChange = await page.evaluate(() => window.nativeRegistryEvents.length)
    await page.evaluate(() => window.nativeSetRefVersion(1))
    await expect(lens).toHaveAttribute('data-ref-version', '1')
    expect(await lens.evaluate(element => window.nativeSurfaces.get(window.nativeReplacementId) === element)).toBe(true)
    expect(await page.evaluate(() => window.nativeRegistryEvents.length)).toBe(beforeCallbackChange)
    await page.evaluate(() => window.nativeUnmount())
    await expect.poll(() => page.evaluate(() => window.nativeSurfaces.size)).toBe(0)
    const refs = await page.evaluate(() => window.nativeReplacementRefEvents)
    expect(refs.some(event => event.kind === 'attach' && event.version === 1 && event.tag === 'A')).toBe(true)
    expect(refs.filter(event => event.kind === 'cleanup')).toHaveLength(refs.filter(event => event.kind === 'attach').length)
    expect(refs.some(event => event.kind === 'null')).toBe(false)
    expect(state).toEqual({ errors: [], external: [] })
})
