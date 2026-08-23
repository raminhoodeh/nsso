/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

// Execute the production TypeScript directly without adding a second test
// runner to the application. CommonJS resolution follows registered
// extensions, so extensionless imports such as "./constants" still resolve to
// their real .ts modules.
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => "\n",
      }),
    );
  }
  module._compile(result.outputText, filename);
};

const {
  resolveTahoeNavSceneRegion,
} = require("../src/lib/tahoe-glass/nav-owned-scene-webgl.ts");
const {
  resolveTahoeNavPlatformRoute,
} = require("../src/lib/tahoe-glass/nav-platform.ts");

const defaultPlatformCapabilities = {
  forcedColors: false,
  maxTouchPoints: 5,
  platform: "iPhone",
  reducedTransparency: false,
  supportsPrimitives: true,
  supportsReferenceSyntax: true,
};

test("routes iPhone Safari and Chrome to the owned-scene WebGL path", () => {
  const cases = [
    {
      label: "iPhone Safari",
      platform: "iPhone",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
    },
    {
      label: "iPhone Chrome",
      platform: "iPhone",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1",
    },
    {
      label: "iPad Safari",
      platform: "iPad",
      userAgent:
        "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
    },
    {
      label: "desktop-mode iPadOS Safari",
      platform: "MacIntel",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15",
    },
  ];

  for (const fixture of cases) {
    assert.equal(
      resolveTahoeNavPlatformRoute({
        ...defaultPlatformCapabilities,
        platform: fixture.platform,
        userAgent: fixture.userAgent,
      }),
      "webgl-owned-scene",
      fixture.label,
    );
  }
});

test("keeps capable Android Chrome on live DOM SVG displacement", () => {
  assert.equal(
    resolveTahoeNavPlatformRoute({
      ...defaultPlatformCapabilities,
      maxTouchPoints: 1,
      platform: "Linux armv81",
      userAgent:
        "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 Chrome/138.0.7204.179 Mobile Safari/537.36",
    }),
    "svg-live-dom",
  );
});

test("uses an honest material fallback when the required engine is unavailable", () => {
  const androidWithoutReferenceFilters = {
    ...defaultPlatformCapabilities,
    maxTouchPoints: 1,
    platform: "Linux armv81",
    supportsReferenceSyntax: false,
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 Chrome/138.0.7204.179 Mobile Safari/537.36",
  };
  const desktopSafari = {
    ...defaultPlatformCapabilities,
    maxTouchPoints: 0,
    platform: "MacIntel",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15",
  };

  assert.equal(
    resolveTahoeNavPlatformRoute(androidWithoutReferenceFilters),
    "css-material",
  );
  assert.equal(
    resolveTahoeNavPlatformRoute(desktopSafari),
    "css-material",
  );
});

test("accessibility modes override every refractive engine", () => {
  const iPhoneSafari = {
    ...defaultPlatformCapabilities,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
  };

  assert.equal(
    resolveTahoeNavPlatformRoute({
      ...iPhoneSafari,
      reducedTransparency: true,
    }),
    "solid",
  );
  assert.equal(
    resolveTahoeNavPlatformRoute({
      ...iPhoneSafari,
      forcedColors: true,
    }),
    "solid",
  );
});

test("maps a top-fixed mobile nav into WebGL bottom-left coordinates", () => {
  assert.deepEqual(
    resolveTahoeNavSceneRegion(
      { width: 390, height: 844 },
      { left: 0, top: 0, width: 390, height: 88 },
    ),
    {
      viewportWidth: 390,
      viewportHeight: 844,
      regionLeft: 0,
      regionBottom: 756,
      regionWidth: 390,
      regionHeight: 88,
    },
  );
});

test("accounts for the owned scene canvas transform and offset", () => {
  assert.deepEqual(
    resolveTahoeNavSceneRegion(
      { width: 520, height: 1125, left: -20, top: -12 },
      { left: 0, top: 0, width: 390, height: 88 },
    ),
    {
      viewportWidth: 520,
      viewportHeight: 1125,
      regionLeft: 20,
      regionBottom: 1025,
      regionWidth: 390,
      regionHeight: 88,
    },
  );
});

test("tracks a shifted visual viewport and a nav below its top edge", () => {
  assert.deepEqual(
    resolveTahoeNavSceneRegion(
      { width: 430, height: 740, left: 6, top: 44 },
      { left: 18, top: 72, width: 394, height: 92 },
    ),
    {
      viewportWidth: 430,
      viewportHeight: 740,
      regionLeft: 12,
      regionBottom: 620,
      regionWidth: 394,
      regionHeight: 92,
    },
  );
});

test("rejects non-finite or non-positive geometry before drawing", () => {
  assert.throws(
    () =>
      resolveTahoeNavSceneRegion(
        { width: 0, height: 844 },
        { left: 0, top: 0, width: 390, height: 88 },
      ),
    /nav-owned-scene-viewport-width-invalid/,
  );
  assert.throws(
    () =>
      resolveTahoeNavSceneRegion(
        { width: 390, height: 844 },
        { left: Number.NaN, top: 0, width: 390, height: 88 },
      ),
    /nav-owned-scene-header-left-invalid/,
  );
  assert.throws(
    () =>
      resolveTahoeNavSceneRegion(
        { width: 390, height: 844 },
        { left: 0, top: 0, width: 390, height: -1 },
      ),
    /nav-owned-scene-header-height-invalid/,
  );
});

test("keeps the navbar as a semantic wrapper around the reusable backdrop surface", () => {
  const source = fs.readFileSync(
    "src/components/ui/tahoe-glass/TahoeBackdropHeader.tsx",
    "utf8",
  );

  assert.match(
    source,
    /export const TahoeBackdropSurface = React\.forwardRef/,
  );
  assert.match(source, /as="header"/);
  assert.match(source, /variant="menu"/);
  assert.match(source, /radius=\{radius\}/);
});

test("uses one reusable refractive backdrop for the outer sign-in card", () => {
  const source = fs.readFileSync("src/app/sign-in/page.tsx", "utf8");
  const surfaceOpenings = source.match(/<TahoeBackdropSurface\b/g) || [];

  assert.equal(surfaceOpenings.length, 1);
  assert.match(source, /as="section"/);
  assert.match(source, /variant="card"/);
  assert.doesNotMatch(source, /<GlassCard\b/);
});
