/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const { buildSync } = require("esbuild");

const root = path.resolve(__dirname, "..");
const candidatePath = path.join(root, "src/components/ui/experimental/liquid-glass-candidate.tsx");
const pagePath = path.join(root, "src/app/glass-candidate/page.tsx");
const demoPath = path.join(root, "src/app/glass-candidate/GlassCandidateDemo.tsx");
const candidateSource = fs.readFileSync(candidatePath, "utf8");
const demoSource = fs.readFileSync(demoPath, "utf8");

// Like the other source-level suites, execute the checked-in TypeScript.
// Private helpers are exposed only in this in-memory test bundle; the shipped
// component's exports and production source remain unchanged.
function loadCandidate() {
  const result = buildSync({
    absWorkingDir: root,
    stdin: {
      contents: `${candidateSource}\nexport const __candidateTest = { mapSize, pixelScale, capsuleBake, detectMode, rimAtlasSampling, rimSourcePosition, rimRowBounds, outlineField, renderRimAtlas, fieldURL, overlayURL, overlayCache };`,
      loader: "tsx",
      resolveDir: path.dirname(candidatePath),
      sourcefile: candidatePath,
    },
    alias: { "@/lib/utils": path.join(root, "src/lib/utils.ts") },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    jsx: "automatic",
  });
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(
    require, compiledModule, compiledModule.exports,
  );
  return compiledModule.exports;
}

function withGlobals(values, run) {
  const previous = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(values)) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    return run();
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function pageModule(environment) {
  const marker = new Error("candidate-production-not-found");
  const source = ts.transpileModule(fs.readFileSync(pagePath, "utf8"), {
    fileName: pagePath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  const demo = () => null;
  const testRequire = (specifier) => {
    if (specifier === "next/navigation") return { notFound() { throw marker; } };
    if (specifier === "./GlassCandidateDemo") return { __esModule: true, default: demo };
    return require(specifier);
  };
  new Function("require", "module", "exports", "process", source)(
    testRequire, compiledModule, compiledModule.exports, { env: environment },
  );
  return { ...compiledModule.exports, marker, demo };
}

test("glass candidate remains development-only and unindexable", () => {
  const production = pageModule({ NODE_ENV: "production", ENABLE_GLASS_REFERENCE: "true", ENABLE_GLASS_CANDIDATE: "true", VERCEL_ENV: "preview" });
  assert.throws(() => production.default(), (error) => error === production.marker);
  assert.deepEqual(production.metadata.robots, { index: false, follow: false });
  assert.equal(production.dynamic, "force-dynamic");

  const development = pageModule({ NODE_ENV: "development" });
  assert.equal(development.default().type, development.demo);
});

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(filename) : /\.[cm]?[jt]sx?$/.test(filename) ? [filename] : [];
  });
}

test("only the approved Chrome bridge and isolated demo import the candidate", () => {
  const importers = [];
  for (const filename of sourceFiles(path.join(root, "src"))) {
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
    let importsCandidate = false;
    const visit = (node) => {
      const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        ? node.moduleSpecifier
        : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === "require")
          ? node.arguments[0] : undefined;
      if (specifier && ts.isStringLiteral(specifier) && /(?:^|\/)liquid-glass-candidate(?:\.[cm]?[jt]sx?)?$/.test(specifier.text)) importsCandidate = true;
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (importsCandidate) importers.push(path.relative(root, filename));
  }
  assert.deepEqual(importers, [
    "src/app/glass-candidate/GlassCandidateDemo.tsx",
    "src/components/ui/tahoe-glass/ChromeGlassOptics.tsx",
  ]);
});

test("the existing reference component retains its own WebGL fallback", () => {
  const original = fs.readFileSync(path.join(root, "src/components/ui/apple-tahoe-liquid-glass-button.tsx"), "utf8");
  assert.match(original, /export const LiquidGlassViewport\b/);
  assert.match(original, /export const LiquidGlassButton\b/);
  assert.match(original, /fallbackMode = "webgl"/);
  assert.match(original, /canvas\.getContext\("webgl"\)/);
  assert.match(original, /registerButton/);
  assert.doesNotMatch(original, /experimental\/liquid-glass-candidate/);
});

test("auto mode honestly chooses frost for iPhone Safari and Chrome", () => {
  const fixtures = [
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1", "webkit", "frost"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1", "webkit", "frost"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15", "webkit", "frost"],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 Chrome/138.0.7204.179 Mobile Safari/537.36", "chromium", "refract"],
    ["Mozilla/5.0 Firefox/143.0", "gecko", "frost"],
  ];
  for (const [userAgent, engine, mode] of fixtures) {
    withGlobals({ navigator: { userAgent }, window: {} }, () => {
      const candidate = loadCandidate();
      assert.equal(candidate.detectEngine(), engine, userAgent);
      assert.equal(candidate.__candidateTest.detectMode(), mode, userAgent);
    });
  }
});

test("demo does not force unsupported refraction or claim a native renderer", () => {
  assert.doesNotMatch(demoSource, /mode\s*=\s*["']refract["']/);
  assert.match(demoSource, /const mode = frost \? "frost" : "auto"/);
  assert.match(demoSource, /Frosted blur — no refraction/);
  assert.match(demoSource, /SVG refraction requested — inspect the grid/);
  assert.match(demoSource, /Safari and WebKit-based iPhone browsers intentionally receive blur/);
  assert.match(demoSource, /not Apple’s native renderer/);
});

test("full displacement maps keep their strict pixel budget", () => {
  withGlobals({ window: { devicePixelRatio: 3 } }, () => {
    const { mapSize, pixelScale } = loadCandidate().__candidateTest;
    for (const [width, height] of [[1000, 263], [390, 844], [1920, 1080], [1, 1], [2_000_000_000, 1], [1, 2_000_000_000]]) {
      const size = mapSize(width, height, pixelScale(width, height));
      assert.ok(Number.isInteger(size.width) && size.width >= 1);
      assert.ok(Number.isInteger(size.height) && size.height >= 1);
      assert.ok(size.width * size.height <= 262_144, `${width}x${height} allocated ${size.width}x${size.height}`);
    }
  });
  // Both the original field and the capsule's sliced destination use the cap.
  assert.match(candidateSource, /width: mw, height: mh\s*\}\s*= mapSize\(w, h, k\)/);
  assert.match(candidateSource, /const dimensions = mapSize\(w, h, scale\)/);
});

test("rim density is independent of card area and bounded at high zoom", () => {
  const { rimAtlasSampling } = loadCandidate().__candidateTest;
  for (const dpr of [1, 1.25, 2, 3, 4, 8]) {
    const first = rimAtlasSampling(1088, 854, 40, dpr);
    const taller = rimAtlasSampling(1088, 4000, 40, dpr);
    const wider = rimAtlasSampling(4000, 4000, 40, dpr);
    assert.deepEqual(taller, first, 'A taller card must not blur or enlarge its corner atlas');
    assert.deepEqual(wider, first, 'The empty center must not consume texture resolution');
    assert.equal(first.scale, Math.min(4, Math.ceil(dpr)));
    assert.ok(first.pixelWidth * first.pixelHeight <= 1_048_576);
    assert.equal(first.pixelSliceX / first.sliceX, first.scale);
    assert.equal(first.pixelSliceY / first.sliceY, first.scale);
  }
  for (const [w, h, radius] of [[300, 88, 44], [2, 2, 1], [10000, 10000, 4000], [2e9, 1, 0], [1, 2e9, 0]]) {
    const sample = rimAtlasSampling(w, h, radius, 8);
    assert.ok(sample.pixelWidth >= 1 && sample.pixelHeight >= 1);
    assert.ok(sample.pixelWidth * sample.pixelHeight <= 1_048_576);
    assert.ok(sample.sliceX * 2 < sample.cssWidth);
    assert.ok(sample.sliceY * 2 < sample.cssHeight);
  }
});

test("nine-slice coordinates retain original corners and stretch only straight middles", () => {
  const { rimAtlasSampling, rimSourcePosition } = loadCandidate().__candidateTest;
  for (const [w, h, radius] of [[1088, 854, 40], [300, 88, 44], [160, 64, 32]]) {
    const s = rimAtlasSampling(w, h, radius, 2);
    for (const [atlas, original, slice] of [[s.cssWidth, w + 4, s.sliceX], [s.cssHeight, h + 4, s.sliceY]]) {
      for (const distance of [0, 0.25, slice - 0.25]) {
        assert.equal(rimSourcePosition(distance, atlas, original, slice), distance);
        assert.equal(rimSourcePosition(atlas - distance, atlas, original, slice), original - distance);
      }
      assert.equal(rimSourcePosition(atlas / 2, atlas, original, slice), original / 2);
    }
  }
});

test("rim row bounds never discard near-outline pixels and exclude the deep interior", () => {
  const candidate = loadCandidate();
  const { rimRowBounds, outlineField } = candidate.__candidateTest;
  for (const [w, h, radius] of [[1088, 854, 40], [300, 88, 44], [160, 64, 32], [56, 40, 18], [200, 50, 0]]) {
    const outline = candidate.squircleOutline(w, h, radius);
    const hw = w / 2, hh = h / 2;
    // Cover the corner and its full +/-6px support at half-CSS-pixel steps.
    // All four reflected corners must survive the conservative prefilter.
    for (let py = -hh - 3; py <= -hh + outline.extent + 7; py += 0.5) {
      for (let px = hw - outline.extent - 7; px <= hw + 3; px += 0.5) {
        for (const [x, y] of [[px, py], [-px, py], [px, -py], [-px, -py]]) {
          const { d } = outlineField(x, y, outline);
          if (Math.abs(d) > 6) continue;
          const bounds = rimRowBounds(y, outline);
          assert.ok(bounds, `Missing row for ${w}x${h}r${radius} at ${x},${y}`);
          assert.ok(Math.abs(x) >= bounds[0] && Math.abs(x) <= bounds[1], `Excluded rim pixel for ${w}x${h}r${radius} at ${x},${y}`);
        }
      }
    }
    assert.deepEqual(rimRowBounds(-hh, outline), [0, Infinity], 'The horizontal edge keeps its full straight run');
    if (hh - outline.extent > 6) {
      const bounds = rimRowBounds(0, outline);
      assert.ok(bounds[0] > hw - 7 && bounds[1] < hw + 7, 'Middle rows only inspect the narrow vertical rim');
    }
  }
});

test("capsule cache does not reuse a different bezel or pixel density", () => {
  const window = { devicePixelRatio: 1 };
  const document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      return {
        width: 0, height: 0,
        getContext() {
          return {
            createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
            putImageData() {},
          };
        },
      };
    },
  };
  withGlobals({ window, document }, () => {
    const { capsuleBake } = loadCandidate().__candidateTest;
    const initial = capsuleBake(6, 3, { bezel: 1, dark: false });
    assert.ok(initial && initial.width > 0 && initial.height > 0);
    assert.ok(initial.width * initial.height <= 262_144);
    assert.equal(capsuleBake(6, 3, { bezel: 1, dark: false }), initial);
    assert.equal(capsuleBake(6, 3, { bezel: 1, dark: true, tint: [1, 0, 0] }), initial, 'The displacement cache depends on geometry, not lighting');
    assert.notEqual(capsuleBake(6, 3, { bezel: 2, dark: false }), initial);
    window.devicePixelRatio = 2;
    assert.notEqual(capsuleBake(6, 3, { bezel: 1, dark: false }), initial);
  });
});

test("field and rim generation allocate one separate bounded plane each and cache the result", () => {
  const canvases = [];
  const document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = {
        width: 0, height: 0, pixels: null,
        getContext() {
          return {
            createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
            putImageData(image) { canvas.pixels = image.data; },
          };
        },
        toDataURL() { return `data:image/png;base64,canvas-${canvases.indexOf(canvas)}`; },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  withGlobals({ window: { devicePixelRatio: 2 }, document }, () => {
    const { fieldURL, overlayURL, renderRimAtlas, rimAtlasSampling, overlayCache } = loadCandidate().__candidateTest;
    const options = { bezel: 32, dark: false };
    const field = fieldURL(1088, 854, 40, options);
    assert.equal(canvases.length, 1, 'Generating displacement must not also allocate the rim');
    assert.ok(canvases[0].width * canvases[0].height <= 262_144);
    const rim = overlayURL(1088, 854, 40, options);
    assert.equal(canvases.length, 2, 'Generating the rim must not also allocate displacement');
    assert.equal(rim.scale, 2);
    assert.ok(canvases[1].width * canvases[1].height <= 1_048_576);
    const center = (Math.floor(rim.pixelHeight / 2) * rim.pixelWidth + Math.floor(rim.pixelWidth / 2)) * 4;
    assert.equal(canvases[1].pixels[center + 3], 0, 'The omitted center must remain transparent');
    assert.ok(canvases[1].pixels.some((value, index) => index % 4 === 3 && value > 0), 'Analytic rim highlights must remain visible');
    assert.equal(fieldURL(1088, 854, 40, options), field);
    assert.equal(overlayURL(1088, 854, 40, options), rim);
    assert.equal(canvases.length, 2, 'Cached measurements must not allocate more planes');
    const capsule = renderRimAtlas(300, 88, 44, false);
    assert.equal(capsule.cssHeight, 92, 'A capsule retains its original short-axis geometry');
    assert.deepEqual({ width: capsule.pixelWidth, height: capsule.pixelHeight }, {
      width: rimAtlasSampling(300, 88, 44, 2).pixelWidth,
      height: rimAtlasSampling(300, 88, 44, 2).pixelHeight,
    });
    // More distinct large cards than the raw-pixel cache allowance permits.
    window.devicePixelRatio = 4;
    for (let index = 0; index < 12; index++) overlayURL(1088 + index, 854, 40, options);
    assert.ok([...overlayCache.values()].reduce((pixels, entry) => pixels + entry.pixelWidth * entry.pixelHeight, 0) <= 4_194_304);
  });
});

test("repeated identical measurements acquire a filter only once", () => {
  const source = ts.createSourceFile(candidatePath, candidateSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let buildArrow;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "build" && node.initializer && ts.isArrowFunction(node.initializer)) buildArrow = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(buildArrow, "execute the real map/filter acquisition closure");
  const acquired = [];
  const released = [];
  let currentMap = null;
  let fieldAvailable = true;
  const dependencies = {
    window: { devicePixelRatio: 1 },
    bezel: 28, dark: true, tintRGB: undefined, mode: "refract", appearance: "dark", material: "clear", tint: undefined, amount: 32, dispersion: 0, nested: false,
    squircleOutline: () => ({ polygon: "polygon(0 0, 100% 0, 100% 100%)" }),
    overlayURL: () => "overlay",
    fieldURL: () => fieldAvailable ? "field" : "",
    filterMarkup: () => "<feDisplacementMap/>",
    acquireFilter: (id) => acquired.push(id),
    releaseFilter: (id) => released.push(id),
    setMap: (update) => { currentMap = update(currentMap); },
  };
  const compiled = ts.transpileModule(`module.exports = function (${Object.keys(dependencies).join(",")}) { let heldFilter = null; const build = ${buildArrow}; return { build, held: () => heldFilter }; };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("module", "exports", compiled)(compiledModule, compiledModule.exports);
  const fixture = compiledModule.exports(...Object.values(dependencies));

  fixture.build(300, 88, 28);
  fixture.build(300, 88, 28);
  assert.equal(acquired.length, 1);
  assert.equal(released.length, 0);
  fixture.build(320, 88, 28);
  assert.equal(acquired.length, 2);
  assert.deepEqual(released, [acquired[0]]);
  dependencies.window.devicePixelRatio = 2;
  fixture.build(320, 88, 28);
  assert.equal(acquired.length, 3, 'An unchanged CSS size on a denser display needs its own field/filter');
  assert.notEqual(acquired[1], acquired[2]);
  fieldAvailable = false;
  fixture.build(320, 88, 28);
  assert.deepEqual(released, acquired);
  assert.equal(fixture.held(), null);
});
