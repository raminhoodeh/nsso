import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css

// The CI image has no physical GPU. Select the same real software WebGL
// backend explicitly rather than relying on platform-dependent ANGLE defaults.
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

test.beforeAll(async () => {
  const source = readFileSync(root + 'src/components/VantaBackground.tsx', 'utf8')
  const candidates = [...source.matchAll(/["'`]([^"'`\n]+)["'`]/g)]
    .flatMap(match => match[1].split(/\s+/))
  // Include the actual global cascade: compiling utilities alone would miss an
  // unlayered ID rule overriding the component's render-resolution dimensions.
  const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), {
      base: root + 'src/app',
    onDependency() {},
  })
  css = compiler.build(candidates)
  const result = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{
      name: 'isolated-vanta-provider',
      setup(builder) {
        builder.onResolve({ filter: /^(next\/navigation|@\/components\/providers\/TahoeGlassProvider)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents: path === 'next/navigation'
            ? 'export const usePathname=()=>"/";'
            : `const controls={consumeSceneFrameRequest:()=>false,publishOwnedSceneAfterRender(){},renderNow(){},retryBackend(){},subscribeSceneFrameRequests:()=>()=>{}};
              export const useTahoeGlassControls=()=>controls;
              export const useTahoeGlassDiagnostics=()=>({backend:'css-blur',status:'active',reducedMotion:true});`,
        }))
      },
    }],
    stdin: {
      resolveDir: root,
      loader: 'tsx',
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import VantaBackground from './src/components/VantaBackground';
        createRoot(document.getElementById('root')).render(<VantaBackground/>);`,
    },
  })
  bundle = result.outputFiles[0].text
})

async function mountBackground(page) {
  const diagnostics = { console: [], errors: [], webgl: null }
  page.on('console', message => diagnostics.console.push(`${message.type()}: ${message.text()}`))
  page.on('pageerror', error => diagnostics.errors.push(error.message))
  await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>')
  await page.addStyleTag({ content: css })
  diagnostics.webgl = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return { available: false, userAgent: navigator.userAgent }
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    const result = {
      available: true,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return result
  })
  expect(diagnostics.webgl.available, JSON.stringify(diagnostics)).toBe(true)
  // Use the real pinned renderer and cloud shader. The geometry assertion then
  // covers both the CSS host and Vanta's canvas, including its resize lifecycle.
  await page.addScriptTag({ path: root + 'public/vendor/three-r134/three.min.js' })
  await page.addScriptTag({ path: root + 'public/vendor/vanta-0.5.24/vanta.clouds.min.js' })
  await page.addScriptTag({ content: bundle })
  try {
    // Software shader compilation can block the first rendered frame. The
    // capability probe above is mandatory; a missing renderer still fails.
    await expect(page.locator('#vanta-bg canvas')).toHaveCount(1, { timeout: 15_000 })
  } catch (error) {
    const scene = await page.evaluate(() => ({
      host: document.querySelector('#vanta-bg')?.outerHTML,
      canvasCount: document.querySelectorAll('canvas').length,
      renderer: Boolean(window.VANTA?.current?.renderer),
      rendererCanvasConnected: window.VANTA?.current?.renderer?.domElement?.isConnected,
      rendererCanvasParent: window.VANTA?.current?.renderer?.domElement?.parentElement?.id,
    }))
    throw new Error(`${error.message}\nVanta startup diagnostics: ${JSON.stringify({ ...diagnostics, scene })}`)
  }
}

async function backgroundGeometry(page) {
  return page.evaluate(() => {
    const host = document.querySelector('#vanta-bg')
    const canvas = host.querySelector('canvas')
    const rect = element => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      host: rect(host),
      canvas: rect(canvas),
      renderWidth: host.offsetWidth,
      renderHeight: host.offsetHeight,
      bufferWidth: canvas.width,
      bufferHeight: canvas.height,
    }
  })
}

function expectViewportCoverage(geometry) {
  for (const surface of [geometry.host, geometry.canvas]) {
    expect(surface.x).toBeCloseTo(0, 0)
    expect(surface.y).toBeCloseTo(0, 0)
    expect(Math.abs(surface.width - geometry.viewport.width)).toBeLessThan(2)
    expect(Math.abs(surface.height - geometry.viewport.height)).toBeLessThan(2)
  }
  expect(Math.abs(geometry.bufferWidth - geometry.renderWidth)).toBeLessThan(2)
  expect(Math.abs(geometry.bufferHeight - geometry.renderHeight)).toBeLessThan(2)
}

for (const deviceScaleFactor of [1, 2]) {
  test(`clouds cover the desktop viewport without magnification at DPR ${deviceScaleFactor}`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop geometry is independent of the mobile project.')
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor })
    try {
      const page = await context.newPage()
      await mountBackground(page)
      for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 1024, height: 768 }]) {
        await page.setViewportSize(viewport)
        await expect.poll(async () => {
          const geometry = await backgroundGeometry(page)
          return Math.abs(geometry.canvas.width - viewport.width)
        }).toBeLessThan(2)
        const geometry = await backgroundGeometry(page)
        expectViewportCoverage(geometry)
        expect(Math.abs(geometry.renderWidth - viewport.width * 0.75)).toBeLessThan(2)
        expect(Math.abs(geometry.renderHeight - viewport.height * 0.75)).toBeLessThan(2)
      }
    } finally {
      await context.close()
    }
  })
}

test('Apple mobile keeps a full-resolution viewport source across height changes', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Apple mobile source policy is covered in the mobile project.')
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  })
  try {
    const page = await context.newPage()
    await mountBackground(page)
    for (const height of [844, 700]) {
      await page.setViewportSize({ width: 390, height })
      await expect.poll(async () => (await backgroundGeometry(page)).canvas.height).toBeCloseTo(height, 0)
      const geometry = await backgroundGeometry(page)
      expectViewportCoverage(geometry)
      expect(geometry.renderWidth).toBe(390)
      expect(geometry.renderHeight).toBe(height)
    }
  } finally {
    await context.close()
  }
})
