/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { buildSync } = require("esbuild");

const root = path.resolve(__dirname, "..");
const bundle = buildSync({
  absWorkingDir: root,
  stdin: {
    contents: 'export { prefersNewChromeOptics } from "./src/lib/tahoe-glass/chrome-policy"; export { resolveTahoeNavPlatformRoute } from "./src/lib/tahoe-glass/nav-platform";',
    loader: "ts",
    resolveDir: root,
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
});
const compiledModule = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(require, compiledModule, compiledModule.exports);
const { prefersNewChromeOptics, resolveTahoeNavPlatformRoute } = compiledModule.exports;

const desktopChrome = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36",
  platform: "MacIntel",
  maxTouchPoints: 0,
  supportsReferenceSyntax: true,
  supportsPrimitives: true,
  reducedTransparency: false,
  forcedColors: false,
};

function enabled(overrides = {}, width = 1440, coarsePointer = false) {
  const capabilities = { ...desktopChrome, ...overrides };
  return prefersNewChromeOptics(resolveTahoeNavPlatformRoute(capabilities), capabilities.userAgent, width, coarsePointer);
}

test("desktop Chromium can select the new optics without changing its route", () => {
  assert.equal(resolveTahoeNavPlatformRoute(desktopChrome), "svg-live-dom");
  assert.equal(enabled(), true);
  assert.equal(enabled({}, 768), true);
});

test("narrow windows and coarse pointers retain their original glass", () => {
  assert.equal(enabled({}, 767), false);
  assert.equal(enabled({}, 390), false);
  assert.equal(enabled({}, 1440, true), false);
});

test("Android Chrome remains on its existing live SVG implementation", () => {
  const android = { platform: "Linux armv81", maxTouchPoints: 5, userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 Chrome/143.0.0.0 Mobile Safari/537.36" };
  assert.equal(resolveTahoeNavPlatformRoute({ ...desktopChrome, ...android }), "svg-live-dom");
  assert.equal(enabled(android, 412, true), false);
  assert.equal(enabled(android, 1440, false), false, "a wide Android window must not become a desktop rollout");
});

test("iPhone Safari, iPhone Chrome and desktop-mode iPad keep the owned-scene route", () => {
  const fixtures = [
    { platform: "iPhone", maxTouchPoints: 5, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1" },
    { platform: "iPhone", maxTouchPoints: 5, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 CriOS/143.0.0.0 Mobile/15E148 Safari/604.1" },
    { platform: "MacIntel", maxTouchPoints: 5, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15" },
  ];
  for (const fixture of fixtures) {
    assert.equal(resolveTahoeNavPlatformRoute({ ...desktopChrome, ...fixture }), "webgl-owned-scene");
    assert.equal(enabled(fixture, 1440), false);
  }
});

test("Safari, Firefox and unsupported SVG implementations never select Chrome optics", () => {
  for (const userAgent of [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:143.0) Gecko/20100101 Firefox/143.0",
  ]) assert.equal(enabled({ userAgent }), false);
  assert.equal(enabled({ supportsReferenceSyntax: false }), false);
  assert.equal(enabled({ supportsPrimitives: false }), false);
});

test("reduced-transparency and forced-colors preferences override the desktop rollout", () => {
  assert.equal(enabled({ reducedTransparency: true }), false);
  assert.equal(enabled({ forcedColors: true }), false);
  assert.equal(enabled({ reducedTransparency: true, forcedColors: true }), false);
});
