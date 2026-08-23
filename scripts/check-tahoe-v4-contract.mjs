import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const projectRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), "nsso-tahoe-v4-contract-"));
const require = createRequire(import.meta.url);

function source(path) {
  return readFileSync(join(projectRoot, path), "utf8");
}

function filesBelow(root) {
  const results = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) results.push(...filesBelow(path));
    else results.push(path);
  }
  return results;
}

function compileCommonJs(input, output) {
  const transpiled = ts.transpileModule(source(input), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: input,
    reportDiagnostics: true,
  });
  const errors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.equal(errors.length, 0, `${input} failed isolated transpilation`);
  writeFileSync(join(tempRoot, output), transpiled.outputText);
}

function canonicalReference(width, height, dpr = 1) {
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  const data = new Uint8Array(pixelWidth * pixelHeight * 4);
  for (let y = 0; y < pixelHeight; y += 1) {
    for (let x = 0; x < pixelWidth; x += 1) {
      const nx = (x / pixelWidth) * 2 - 1;
      const ny = (y / pixelHeight) * 2 - 1;
      const distance = Math.abs(nx) ** 3.5 + Math.abs(ny) ** 3.5;
      const index = (y * pixelWidth + x) * 4;
      const magnitude =
        distance <= 1 ? Math.sin(distance ** 0.8 * Math.PI) : 0;
      data[index] = Math.round(128 + Math.max(-1, Math.min(1, -nx * magnitude)) * 127);
      data[index + 1] = Math.round(128 + Math.max(-1, Math.min(1, -ny * magnitude)) * 127);
      data[index + 2] = 128;
      data[index + 3] = distance <= 1 ? 255 : 0;
    }
  }
  return data;
}

try {
  writeFileSync(join(tempRoot, "package.json"), '{"type":"commonjs"}');
  compileCommonJs("src/lib/tahoe-glass/v4/constants.ts", "constants.js");
  compileCommonJs("src/lib/tahoe-glass/v4/optics.ts", "optics.js");
  compileCommonJs("src/lib/tahoe-glass/v4/state.ts", "state.js");
  compileCommonJs(
    "src/lib/tahoe-glass/v4/route-policy.ts",
    "route-policy.js",
  );

  const constants = require(join(tempRoot, "constants.js"));
  const optics = require(join(tempRoot, "optics.js"));
  const state = require(join(tempRoot, "state.js"));
  const routePolicy = require(join(tempRoot, "route-policy.js"));

  assert.equal(constants.TAHOE_V4_CONTROL_DISPLACEMENT_PX, 35);
  assert.equal(constants.TAHOE_V4_CONTROL_SUPERELLIPSE_POWER, 3.5);
  assert.equal(constants.TAHOE_V4_CONTROL_CURVE_POWER, 0.8);
  assert.equal(constants.TAHOE_V4_RIM_BINS, 24);
  assert.deepEqual(constants.TAHOE_V4_LIGHT_SOURCE, { x: 0.5, y: 0 });

  for (const fixture of [
    [180, 60, 1],
    [91, 37, 1],
    [340, 600, 0.75],
  ]) {
    const [width, height, dpr] = fixture;
    const actual = optics.createTahoeV4CanonicalControlField({
      width,
      height,
      dpr,
      alphaOutside: 0,
    }).data;
    assert.deepEqual(
      actual,
      canonicalReference(width, height, dpr),
      `canonical control bytes drifted at ${width}x${height}@${dpr}`,
    );
  }

  const panel = optics.createTahoeV4RoundedEdgeLensField({
    width: 340,
    height: 600,
    dpr: 1,
    radiusPx: 30,
  });
  assert.equal(panel.profile, "edge-lens");
  assert.ok(panel.edgeBandPx >= 40 && panel.edgeBandPx <= 88);
  assert.ok(
    optics.tahoeV4FieldMaximumBend(panel) >= 0.95,
    "large-surface edge lens lost its observable bend",
  );
  const asymmetric = optics.createTahoeV4RoundedEdgeLensField({
    width: 200,
    height: 100,
    dpr: 1,
    cornerRadiiPx: {
      topLeft: 0,
      topRight: 0,
      bottomRight: 24,
      bottomLeft: 24,
    },
  });
  const alphaAt = (x, y) =>
    asymmetric.data[(y * asymmetric.pixelWidth + x) * 4 + 3];
  assert.equal(alphaAt(0, 0), 255, "square top corner was rounded");
  assert.equal(
    alphaAt(0, asymmetric.pixelHeight - 1),
    0,
    "rounded bottom corner leaked outside its mask",
  );
  const analysis = optics.analyzeTahoeV4Refraction(panel, -Math.PI / 2);
  assert.equal(analysis.profile.length, 24);
  const rim = optics.calculateTahoeV4Rim(panel, 0.5, 0.5);
  const rimCss = optics.tahoeV4RimCssVariables(rim);
  for (const property of [
    "--cos",
    "--sin",
    "--light-angle",
    "--rim-intensity",
    "--rim-gradient",
  ]) {
    assert.equal(typeof rimCss[property], "string");
  }

  let lifecycle = state.initialTahoeV4Lifecycle(0);
  lifecycle = state.reduceTahoeV4Lifecycle(lifecycle, {
    type: "SOURCE_LOADING",
    now: 1,
  });
  lifecycle = state.reduceTahoeV4Lifecycle(lifecycle, {
    type: "SOURCE_READY",
    now: 2,
  });
  lifecycle = state.reduceTahoeV4Lifecycle(lifecycle, {
    type: "FRAME_PRESENTED",
    now: 3,
  });
  assert.equal(lifecycle.lifecycle, "refraction-presented");
  const fallback = state.reduceTahoeV4Lifecycle(lifecycle, {
    type: "FALLBACK",
    reason: "contract-test",
    now: 4,
  });
  assert.equal(fallback.lifecycle, "fallback");
  assert.equal(fallback.reason, "contract-test");

  assert.equal(routePolicy.tahoeV4RouteScenePolicy("/"), "clouds");
  assert.equal(
    routePolicy.tahoeV4RouteScenePolicy("/products/example"),
    "siri-image",
  );
  assert.equal(
    routePolicy.tahoeV4RouteScenePolicy("/film/razinflix"),
    "razinflix-image",
  );
  assert.equal(
    routePolicy.tahoeV4RouteScenePolicy("/places/dubai"),
    "places-map-material-only",
  );

  const surfaceSource = source(
    "src/components/ui/tahoe-glass-v4/TahoeGlassV4Surface.tsx",
  );
  assert.match(surfaceSource, /reducedTransparency\s*\?\s*72\s*:\s*25/);
  assert.match(surfaceSource, /blur\(2px\) saturate\(180%\) brightness\(1\.05\)/);
  assert.match(surfaceSource, /blur\(1px\) saturate\(180%\) brightness\(1\.05\)/);
  assert.match(surfaceSource, /rgba\(255,255,255,0\.2\) 0%, transparent 60%/);
  assert.match(surfaceSource, /data-tahoe-glass-v4-material="true"/);
  assert.match(surfaceSource, /backdrop-filter", "none", "important"/);
  assert.doesNotMatch(
    surfaceSource,
    /backend\s*===\s*["']webgl["'][\s\S]{0,200}background:\s*["']transparent/,
    "renderer backend must never remove the material body",
  );

  const shaderSource = source("src/lib/tahoe-glass/v4/shaders.ts");
  assert.match(shaderSource, /p\.y \+= uHorizonOffset/);
  assert.match(shaderSource, /vec2\(vUv\.x, 1\.0 - vUv\.y\)/);
  assert.match(shaderSource, /bend = \(displacement\.rg - 0\.5\) \* 2\.0 \* uScale/);
  const rendererSource = source("src/lib/tahoe-glass/v4/renderer.ts");
  assert.match(rendererSource, /TAHOE_V4_CONTROL_DISPLACEMENT_PX \* dpr/);
  assert.match(
    rendererSource,
    /UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0/,
  );
  assert.match(rendererSource, /document\.visibilityState === "hidden"/);
  assert.match(rendererSource, /onSurfaceOptics/);

  const providerSource = source(
    "src/components/providers/TahoeGlassV4Provider.tsx",
  );
  assert.match(providerSource, /scene\.kind === "material-only"/);
  assert.match(providerSource, /diagnostics\.lifecycle === "refraction-presented"/);
  assert.match(providerSource, /data-tahoe-glass-v4-frame-presented/);

  const labSource = source("src/app/glass-lab-v4/GlassLabV4.tsx");
  assert.match(labSource, /glass-lab-v4-capture-\$\{mode\}/);
  assert.match(labSource, /glass-lab-v4-provider-material/);
  assert.match(labSource, /glass-lab-v4-provider-refraction/);
  assert.match(
    source("public/glass-lab-v4/checker-calibration.svg"),
    /preserveAspectRatio="none"/,
    "checker CSS and WebGL paths must stretch identical scene pixels",
  );

  const legacyProviderImportAllowlist = new Set([
    "src/components/VantaBackground.tsx",
    "src/components/providers/AdaptiveTahoeGlassProvider.tsx",
    "src/components/providers/NSSOTahoeGlassEnvironment.tsx",
    "src/components/providers/TahoeGlassProvider.tsx",
    "src/components/ui/tahoe-glass/TahoeGlassSurface.tsx",
    "src/components/ui/tahoe-glass/index.ts",
  ]);
  const sourceRoot = join(projectRoot, "src");
  for (const absolutePath of filesBelow(sourceRoot)) {
    if (!/\.(?:ts|tsx)$/.test(absolutePath)) continue;
    const relativePath = absolutePath.slice(projectRoot.length + 1);
    const contents = readFileSync(absolutePath, "utf8");
    if (
      contents.includes('from "@/components/providers/TahoeGlassProvider"') ||
      contents.includes("from '@/components/providers/TahoeGlassProvider'")
    ) {
      assert.ok(
        legacyProviderImportAllowlist.has(relativePath),
        `${relativePath} bypasses the adaptive V4 provider seam`,
      );
    }
    if (!relativePath.includes("glass-reference/")) {
      assert.doesNotMatch(
        contents,
        /(?:glass-style-(?:card|navbar)|\bglass-panel\b)/,
        `${relativePath} reintroduced a legacy glass shell`,
      );
    }
  }

  console.log("Tahoe V4 contract: PASS");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
