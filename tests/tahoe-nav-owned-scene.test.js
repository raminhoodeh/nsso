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
  hasMeasurableTahoeNavDisplacement,
  resolveTahoeNavSceneRegion,
  resolveTahoeNavTargetSize,
} = require("../src/lib/tahoe-glass/nav-owned-scene-webgl.ts");
const {
  TAHOE_DIRECT_BACKDROP_MAX_FIELD_PIXELS,
  resolveTahoeDirectBackdropFieldSampling,
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

test("caps direct backdrop displacement fields to a 512 by 512 pixel budget", () => {
  const uncapped = resolveTahoeDirectBackdropFieldSampling(390, 88, 1);
  assert.deepEqual(uncapped, {
    generationCssWidth: 390,
    generationCssHeight: 88,
    fieldDpr: 1,
    pixelWidth: 390,
    pixelHeight: 88,
    capped: false,
  });

  for (const [width, height] of [
    [1920, 1080],
    [4000, 3000],
    [10000, 1000],
    [1_000_000_000, 1],
    [1, 1_000_000_000],
  ]) {
    const sampling = resolveTahoeDirectBackdropFieldSampling(
      width,
      height,
      1,
    );
    assert.equal(sampling.capped, true);
    assert.ok(
      sampling.pixelWidth * sampling.pixelHeight <=
        TAHOE_DIRECT_BACKDROP_MAX_FIELD_PIXELS,
    );
    assert.equal(
      Math.round(sampling.generationCssWidth * sampling.fieldDpr),
      sampling.pixelWidth,
    );
    assert.equal(
      Math.round(sampling.generationCssHeight * sampling.fieldDpr),
      sampling.pixelHeight,
    );
  }
});

test("rejects invalid direct backdrop displacement geometry", () => {
  assert.throws(
    () => resolveTahoeDirectBackdropFieldSampling(0, 100, 1),
    /tahoe-direct-backdrop-width-invalid/,
  );
  assert.throws(
    () => resolveTahoeDirectBackdropFieldSampling(100, Infinity, 1),
    /tahoe-direct-backdrop-height-invalid/,
  );
  assert.throws(
    () => resolveTahoeDirectBackdropFieldSampling(100, 100, 0),
    /tahoe-direct-backdrop-dpr-invalid/,
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

test("uses Retina resolution while capping the owned-scene target safely", () => {
  assert.deepEqual(resolveTahoeNavTargetSize(390, 88, 3, 4096), {
    width: 780,
    height: 176,
    dpr: 2,
    capped: true,
  });

  const pixelBudgeted = resolveTahoeNavTargetSize(
    1200,
    2000,
    3,
    4096,
  );
  assert.ok(pixelBudgeted.width * pixelBudgeted.height <= 2_097_152);
  assert.ok(pixelBudgeted.dpr < 1);
  assert.equal(pixelBudgeted.capped, true);

  const textureBudgeted = resolveTahoeNavTargetSize(
    3000,
    1000,
    2,
    2048,
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(textureBudgeted.width, 2048);
  assert.ok(textureBudgeted.height <= 2048);
  assert.ok(textureBudgeted.dpr < 1);
});

function rgbaSamples(colors, alpha = 180) {
  return Uint8Array.from(
    colors.flatMap(([red, green, blue]) => [red, green, blue, alpha]),
  );
}

test("does not accept a merely non-empty owned-scene overlay as refraction", () => {
  const nonEmpty = rgbaSamples([
    [80, 110, 140],
    [90, 120, 150],
    [100, 130, 160],
    [110, 140, 170],
  ]);

  assert.equal(
    hasMeasurableTahoeNavDisplacement(nonEmpty, nonEmpty.slice()),
    false,
  );
});

test("requires distributed measurable RGB displacement before reveal", () => {
  const undistorted = rgbaSamples([
    [80, 110, 140],
    [90, 120, 150],
    [100, 130, 160],
    [110, 140, 170],
  ]);
  const displaced = rgbaSamples([
    [83, 112, 141],
    [94, 122, 150],
    [102, 133, 162],
    [110, 140, 170],
  ]);
  const onlyOneChanged = undistorted.slice();
  onlyOneChanged.set([120, 160, 200, 180], 0);

  assert.equal(
    hasMeasurableTahoeNavDisplacement(displaced, undistorted),
    true,
  );
  assert.equal(
    hasMeasurableTahoeNavDisplacement(onlyOneChanged, undistorted),
    false,
  );
});

test("ignores RGB differences that are effectively transparent", () => {
  const undistorted = rgbaSamples(
    [
      [20, 30, 40],
      [30, 40, 50],
      [40, 50, 60],
    ],
    12,
  );
  const displaced = rgbaSamples(
    [
      [200, 210, 220],
      [210, 220, 230],
      [220, 230, 240],
    ],
    12,
  );

  assert.equal(
    hasMeasurableTahoeNavDisplacement(displaced, undistorted),
    false,
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
  assert.match(source, /window\.devicePixelRatio/);
  assert.match(source, /renderer\.hasMeasurableDisplacement\(\)/);
  assert.doesNotMatch(source, /renderer\.hasVisibleOutput\(\)/);
  assert.match(
    source,
    /nav-owned-scene-measurable-displacement-proof-failed/,
  );
  assert.match(source, /backdropEnabled\?: boolean/);
  assert.match(source, /backdropEnabled = true/);
  assert.match(
    source,
    /backdropEnabled && platformRoute === "webgl-owned-scene"/,
  );
  assert.match(source, /if \(!backdropEnabled\)/);
  assert.match(source, /\{backdropEnabled \? \(\s*<svg/);
  assert.match(
    source,
    /TahoeGlassDirectBackdropBoundaryContext\.Provider/,
  );
  assert.match(source, /value=\{backdropEnabled\}/);
  assert.match(
    source,
    /resolveTahoeDirectBackdropFieldSampling\(/,
  );
  assert.match(source, /setAttribute\("width", String\(width\)\)/);
  assert.match(source, /setAttribute\("height", String\(height\)\)/);
  assert.doesNotMatch(source, /nav-owned-scene-visible-output-proof-failed/);
  assert.doesNotMatch(source, /nav-owned-scene-visibility-proof-retry/);
});

test("uses one reusable refractive backdrop for the outer sign-in card", () => {
  const source = fs.readFileSync("src/app/sign-in/page.tsx", "utf8");
  const surfaceOpenings = source.match(/<TahoeBackdropSurface\b/g) || [];

  assert.equal(surfaceOpenings.length, 1);
  assert.match(source, /as="section"/);
  assert.match(source, /variant="card"/);
  assert.doesNotMatch(source, /<GlassCard\b/);
});
