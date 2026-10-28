import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
const fixture = `
  import React,{useState}from'react';import{createRoot}from'react-dom/client';
  import LightGlassPanel from './src/components/ui/LightGlassPanel';
  function App(){const[blue,setBlue]=useState(false);return <>
    <div style={{position:'fixed',inset:0,background:blue?'#5588cc':'#cc8855'}}/>
    <LightGlassPanel data-testid="satin" className="home-crystal-glass p-6" chromiumAppearance="light" materialFinish="satin" style={{width:'min(600px,calc(100% - 40px))',height:200,margin:20}}>
      <h1>All of you. All in one place.</h1><p>Readable content stays above the crystal.</p>
    </LightGlassPanel>
    <LightGlassPanel data-testid="clear" chromiumAppearance="light" style={{width:280,height:100,margin:20}}>Default glass stays clear.</LightGlassPanel>
    <button style={{position:'relative',padding:16}} onClick={()=>setBlue(!blue)}>Change scene</button>
  </>}
  const app=createRoot(document.getElementById('root'));window.disposeFixture=()=>app.unmount();app.render(<App/>);
`

test.beforeAll(async()=>{
  const source=['src/components/ui/tahoe-glass/TahoeBackdropHeader.tsx','src/components/ui/experimental/liquid-glass-candidate.tsx'].map(file=>readFileSync(root+file,'utf8')).join('\n')+fixture
  const candidates=[...source.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match=>match[1].split(/\s+/))
  const compiler=await compile(readFileSync(root+'src/app/globals.css','utf8'),{base:root+'src/app',onDependency(){}})
  css=compiler.build(candidates)+'\nbody{margin:0;font-family:Arial}h1{font-size:24px;font-weight:bold}'
  const result=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},stdin:{resolveDir:root,loader:'tsx',contents:fixture}})
  bundle=result.outputFiles[0].text
})

async function mount(page){
  await page.route('https://nsso.test/**',route=>{
    const path=new URL(route.request().url()).pathname
    if(path==='/fixture.js')return route.fulfill({contentType:'application/javascript',body:bundle})
    if(path==='/fixture.css')return route.fulfill({contentType:'text/css',body:css})
    return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>'})
  })
  await page.goto('https://nsso.test/crystal')
}

async function filter(surface,desktop){
  return surface.evaluate((el,desktop)=>desktop
    ?[...el.children].map(child=>getComputedStyle(child).backdropFilter).find(value=>value.includes('url('))
    :getComputedStyle(el).backdropFilter,desktop)
}

test('neutral satin glass transmits scene colour and keeps its own content sharp',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await mount(page)
  const satin=page.getByTestId('satin'),clear=page.getByTestId('clear'),desktop=testInfo.project.name==='desktop'
  if(desktop)await expect(satin).toHaveAttribute('data-tahoe-chromium-optics','refract')
  await expect(satin).toHaveAttribute('data-tahoe-material-finish','satin')
  expect(await filter(satin,desktop)).toContain('blur(5px)')
  expect(await filter(clear,desktop)).toContain(desktop?'blur(1px)':'blur(2px)')
  const coating=await satin.evaluate(el=>getComputedStyle(el,'::after').backgroundImage)
  const stops=[...coating.matchAll(/rgba?\((\d+), (\d+), (\d+)/g)]
  expect(stops.length).toBeGreaterThanOrEqual(2)
  for(const stop of stops)expect([stop[1],stop[2],stop[3]]).toEqual(['255','255','255'])
  expect(await satin.getByRole('heading').evaluate(el=>getComputedStyle(el).filter)).toBe('none')
  const centre=async()=>{
    const {data,info}=await sharp(await satin.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true})
    const offset=(Math.floor(info.height*.75)*info.width+Math.floor(info.width*.5))*info.channels
    return [...data.subarray(offset,offset+3)]
  }
  const warm=await centre()
  await page.getByRole('button',{name:'Change scene',exact:true}).click()
  const cool=await centre()
  expect(warm[0]-warm[2]).toBeGreaterThan(20)
  expect(cool[2]-cool[0]).toBeGreaterThan(20)
  await page.evaluate(()=>window.disposeFixture())
  await expect(page.locator('filter[id^="lgf"]')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('neutral satin respects solid accessibility material',async({page,context})=>{
  await mount(page)
  const cdp=await context.newCDPSession(page)
  for(const feature of ['prefers-reduced-transparency','forced-colors']){
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:feature,value:feature==='forced-colors'?'active':'reduce'}]})
    const satin=page.getByTestId('satin')
    await expect(satin).toHaveAttribute('data-tahoe-refraction-backend','solid')
    await expect(satin).not.toHaveAttribute('data-tahoe-chromium-optics')
    expect(await satin.evaluate(el=>getComputedStyle(el,'::after').content)).toBe('none')
    await expect(page.locator('filter[id^="lgf"]')).toHaveCount(0)
    await cdp.send('Emulation.setEmulatedMedia',{features:[]})
  }
  await cdp.detach()
  await page.evaluate(()=>window.disposeFixture())
})
