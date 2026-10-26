import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle
test.beforeAll(async () => {
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'cropper-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:react-easy-crop|@\/lib\/canvasUtils|@\/components\/ui\/tahoe-glass)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'react-easy-crop' ? 'import React,{useEffect} from "react";export default function Crop({image,onCropComplete}){useEffect(()=>{onCropComplete({}, {x:0,y:0,width:50,height:50})},[image,onCropComplete]);return <div>Selected image</div>;}'
                    : path.endsWith('canvasUtils') ? 'export default async()=>{if(window.fixtureDecodeFailure)throw new Error("Synthetic corrupt image");return new Blob(["fixture-raster"],{type:"image/jpeg"})};'
                        : 'import React from "react";export const TahoeGlassDialog=({open,onOpenChange,children})=>open?<div role="dialog" onKeyDown={event=>{if(event.key==="Escape")onOpenChange(false)}}>{children}</div>:null;export const TahoeGlassButton=({children,onClick,disabled,...props})=><button onClick={onClick} disabled={disabled} aria-label={props["aria-label"]}>{children}</button>;export const TahoeGlassField=({label,children})=><label>{label}{children}</label>;' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Cropper from './src/components/ui/ImageCropperModal';import {uploadProfileMedia} from './src/lib/profile-media-client';
            window.fixtureUpload=()=>uploadProfileMedia(new Blob(['fixture-raster'],{type:'image/jpeg'}),'avatar','11111111-1111-4111-8111-111111111111');
            window.fixtureCloses=0;window.fixtureUploads=0;window.fixtureDecodeFailure=false;
            function Fixture(){const [source,setSource]=useState('first-image');return <><button onClick={()=>setSource('second-image')}>Select another image</button><Cropper isOpen imageSrc={source} aspectRatio={1} onClose={()=>{window.fixtureCloses++}} onCropComplete={async()=>{window.fixtureUploads++;await new Promise(resolve=>{window.fixtureReleaseUpload=resolve})}}/></>}
            createRoot(document.getElementById('root')).render(<Fixture/>);
        ` } })
    bundle = result.outputFiles[0].text
})
async function fixture(page) {
    await page.route('https://nsso.test/fixture', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
    await page.goto('https://nsso.test/fixture')
    await page.addScriptTag({ content: bundle })
    await expect(page.getByRole('button', { name: 'Apply Crop', exact: true })).toBeEnabled()
}

test('an async upload stays busy, blocks closing/repeated submits and settles before another crop', async ({ page }) => {
    await fixture(page)
    await page.getByRole('button', { name: 'Apply Crop', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Processing...', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Close image cropper', exact: true })).toBeDisabled()
    await page.getByRole('dialog').press('Escape')
    expect(await page.evaluate(() => window.fixtureCloses)).toBe(0)
    expect(await page.evaluate(() => window.fixtureUploads)).toBe(1)
    await page.evaluate(() => window.fixtureReleaseUpload())
    await expect(page.getByRole('button', { name: 'Apply Crop', exact: true })).toBeEnabled()
})

test('a failed crop reports the error and retains a working retry', async ({ page }) => {
    await fixture(page)
    await page.evaluate(() => { window.fixtureDecodeFailure = true })
    await page.getByRole('button', { name: 'Apply Crop', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Your crop is still here')
    expect(await page.evaluate(() => window.fixtureUploads)).toBe(0)
    await page.evaluate(() => { window.fixtureDecodeFailure = false })
    await page.getByRole('button', { name: 'Apply Crop', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.fixtureUploads)).toBe(1)
    await page.evaluate(() => window.fixtureReleaseUpload())
    await expect(page.getByRole('button', { name: 'Apply Crop', exact: true })).toBeEnabled()
})

test('selecting a different image starts with its own default zoom', async ({ page }) => {
    await fixture(page)
    await page.getByRole('slider', { name: 'Zoom' }).fill('2.5')
    await page.getByRole('button', { name: 'Select another image', exact: true }).click()
    await expect(page.getByRole('slider', { name: 'Zoom' })).toHaveValue('1')
    await expect(page.getByRole('button', { name: 'Apply Crop', exact: true })).toBeEnabled()
})

test('a callback that never settles releases crop controls at the deadline and keeps the crop for explicit recovery', async ({ page }) => {
    await page.clock.install()
    await fixture(page)
    await page.getByRole('button',{name:'Apply Crop',exact:true}).click()
    await page.waitForFunction(() => Boolean(window.fixtureReleaseUpload))
    await page.clock.fastForward(30_001)
    await expect(page.getByRole('alert')).toContainText('Your crop is still here')
    await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeEnabled()
    await expect(page.getByRole('button',{name:'Apply Crop',exact:true})).toBeEnabled()
    await page.evaluate(() => window.fixtureReleaseUpload())
    await expect(page.getByRole('alert')).toBeVisible()
    expect(await page.evaluate(() => window.fixtureUploads)).toBe(1)
    await page.getByRole('button',{name:'Cancel',exact:true}).click()
    expect(await page.evaluate(() => window.fixtureCloses)).toBe(1)
})

test('upload fetch and body decoding have a deadline even if the transport ignores abort, without an automatic retry', async ({ page }) => {
    await page.clock.install()
    await fixture(page)
    await page.evaluate(() => {
        window.fixtureUploadCalls=0
        window.fetch=async(_url,init)=>{window.fixtureUploadCalls++;window.fixtureUploadSignal=init.signal;return{ok:true,json:()=>new Promise(resolve=>window.fixtureReleaseBody=resolve)}}
        window.fixtureUpload().then(()=>window.fixtureUploadResult='success').catch(error=>window.fixtureUploadResult=error.message)
    })
    await page.waitForFunction(() => Boolean(window.fixtureReleaseBody))
    await page.clock.fastForward(20_001)
    await expect.poll(() => page.evaluate(() => window.fixtureUploadResult)).toContain('could not be confirmed')
    expect(await page.evaluate(() => window.fixtureUploadCalls)).toBe(1)
    expect(await page.evaluate(() => window.fixtureUploadSignal.aborted)).toBe(true)
    await page.evaluate(() => window.fixtureReleaseBody({accountId:'11111111-1111-4111-8111-111111111111',url:'https://fixture.test/image.jpg',path:'11111111-1111-4111-8111-111111111111/avatar/image.jpg'}))
    expect(await page.evaluate(() => window.fixtureUploadResult)).not.toBe('success')
})
