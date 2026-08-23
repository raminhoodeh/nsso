import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
  mkdirSync(dirname(join(tempRoot, output)), { recursive: true });
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
  compileCommonJs("src/lib/tahoe-glass/v4/proof.ts", "proof.js");
  compileCommonJs(
    "src/lib/tahoe-glass/v4/__tests__/proof-contract.ts",
    "__tests__/proof-contract.js",
  );
  compileCommonJs("src/lib/tahoe-glass/v4/state.ts", "state.js");
  compileCommonJs(
    "src/lib/tahoe-glass/v4-testing/types.ts",
    "v4-testing-types.js",
  );
  compileCommonJs(
    "src/lib/tahoe-glass/v4-testing/geometry.ts",
    "geometry.js",
  );
  compileCommonJs(
    "src/lib/tahoe-glass/v4-testing/fixtures.ts",
    "fixtures.js",
  );
  compileCommonJs(
    "src/lib/tahoe-glass/v4-testing/measurements.ts",
    "measurements.js",
  );
  compileCommonJs(
    "src/lib/tahoe-glass/v4/route-policy.ts",
    "route-policy.js",
  );

  const constants = require(join(tempRoot, "constants.js"));
  const optics = require(join(tempRoot, "optics.js"));
  require(join(tempRoot, "__tests__/proof-contract.js"));
  const state = require(join(tempRoot, "state.js"));
  const measurements = require(join(tempRoot, "measurements.js"));
  const routePolicy = require(join(tempRoot, "route-policy.js"));

  assert.equal(constants.TAHOE_V4_CONTROL_DISPLACEMENT_PX, 35);
  assert.equal(constants.TAHOE_V4_CONTROL_SUPERELLIPSE_POWER, 3.5);
  assert.equal(constants.TAHOE_V4_CONTROL_CURVE_POWER, 0.8);
  assert.equal(constants.TAHOE_V4_RIM_BINS, 24);
  assert.deepEqual(constants.TAHOE_V4_LIGHT_SOURCE, { x: 0.5, y: 0 });
  assert.equal(constants.TAHOE_V4_PANEL_EDGE_DISPLACEMENT_PX, 35);
  assert.equal(constants.TAHOE_V4_PANEL_BODY_DISPLACEMENT_PX, 12.5);
  assert.equal(constants.TAHOE_V4_PANEL_MAX_DISPLACEMENT_PX, 42);

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
  const panelRadii = {
    topLeft: 30,
    topRight: 30,
    bottomRight: 30,
    bottomLeft: 30,
  };
  const panelCenter = optics.sampleTahoeV4PanelDisplacementPx({
    x: 170,
    y: 300,
    width: 340,
    height: 600,
    cornerRadiiPx: panelRadii,
    edgeBandPx: panel.edgeBandPx,
  });
  assert.ok(panelCenter, "panel center fell outside its rounded mask");
  assert.ok(
    Math.hypot(panelCenter.x, panelCenter.y) < 1e-9,
    "panel center must remain optically neutral",
  );
  const panelBody = optics.sampleTahoeV4PanelDisplacementPx({
    x: 56.44,
    y: 99.3,
    width: 340,
    height: 600,
    cornerRadiiPx: panelRadii,
    edgeBandPx: panel.edgeBandPx,
  });
  assert.ok(panelBody, "deep panel body sample fell outside its rounded mask");
  assert.ok(
    Math.hypot(panelBody.x, panelBody.y) > 11.4,
    "deep panel interior lost the canonical body bend",
  );
  const clampedPanel = optics.sampleTahoeV4PanelDisplacementPx({
    x: 18.5,
    y: 166.5,
    width: 340,
    height: 600,
    cornerRadiiPx: panelRadii,
    edgeBandPx: panel.edgeBandPx,
  });
  assert.ok(clampedPanel, "clamp probe fell outside its rounded mask");
  assert.ok(
    Math.abs(Math.hypot(clampedPanel.x, clampedPanel.y) - 42) < 1e-9,
    "two-scale panel displacement did not honor its 42px radial cap",
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

  const barePixels = new Uint8Array(4 * 4 * 4);
  const refractedPixels = new Uint8Array(barePixels);
  for (let index = 3; index < barePixels.length; index += 4) {
    barePixels[index] = 255;
    refractedPixels[index] = 255;
  }
  refractedPixels[0] = 255;
  refractedPixels[1] = 255;
  refractedPixels[2] = 255;
  const runtimeMeasurement = measurements.evaluateRuntimeRefraction({
    bare: { width: 4, height: 4, data: barePixels },
    refraction: { width: 4, height: 4, data: refractedPixels },
    probes: [],
    thresholds: {
      jndDeltaE: 2.3,
      minimumMaterialJndRatio: 0,
      minimumRefractionJndRatio: 0.01,
      minimumProbeEdgeContrast: 0,
      minimumLensProbeShiftCssPx: 0,
      minimumLensProbeCount: 0,
      minimumMaximumProbeShiftCssPx: 0,
      minimumSourceDetailProbeShiftCssPx: 0,
      minimumSourceDetailProbeCount: 0,
      requireBidirectionalLensShift: false,
    },
  });
  assert.equal(runtimeMeasurement.pass, true);
  assert.ok(
    runtimeMeasurement.refraction.jndRatio > 0,
    "runtime pixel evaluator did not consume the supplied frame bytes",
  );
  const runtimeProof = measurements.evaluateRuntimeOpticalProof({
    lifecycle: "refraction-presented",
    backend: "webgl",
    sourceKind: "image",
    reason: null,
    framePresented: true,
    proofPassed: true,
    refractiveSurfaceCount: 1,
    sampleCount: 8,
    changedCount: 5,
    meanDelta: 7.5,
    maxDelta: 18,
  });
  assert.equal(runtimeProof.pass, true);
  assert.equal(runtimeProof.changedRatio, 5 / 8);
  assert.equal(
    measurements.evaluateRuntimeOpticalProof({
      lifecycle: "initializing",
      backend: "webgl",
      sourceKind: "image",
      reason: null,
      framePresented: false,
      proofPassed: false,
      refractiveSurfaceCount: 1,
      sampleCount: 0,
      changedCount: 0,
      meanDelta: 0,
      maxDelta: 0,
    }).pass,
    false,
    "runtime proof evaluator accepted empty renderer diagnostics",
  );

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
    type: "PROOF_RECOVERING",
    reason: "refraction-subthreshold",
    now: 3,
  });
  assert.equal(lifecycle.lifecycle, "source-ready");
  assert.equal(lifecycle.reason, "refraction-subthreshold");
  lifecycle = state.reduceTahoeV4Lifecycle(lifecycle, {
    type: "FRAME_PRESENTED",
    now: 4,
  });
  assert.equal(lifecycle.lifecycle, "refraction-presented");
  assert.equal(lifecycle.reason, null);
  const fallback = state.reduceTahoeV4Lifecycle(lifecycle, {
    type: "FALLBACK",
    reason: "contract-test",
    now: 5,
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
  assert.match(
    source("src/lib/tahoe-glass/route-boundaries.ts"),
    /ROUTES_WITHOUT_GLOBAL_TAHOE_SURFACES[\s\S]*["']\/glass-lab-v4["']/,
    "the isolated V4 lab must not mount global Tahoe surfaces outside its provider",
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
  assert.match(rendererSource, /TAHOE_V4_PROOF_RECOVERY_INTERVAL_MS = 1_000/);
  assert.match(rendererSource, /enterRecoverableProof\(this\.proofFailureReason/);
  assert.match(rendererSource, /tahoeV4PublishedProofMetrics/);
  assert.doesNotMatch(
    rendererSource,
    /enterFallback\(this\.proofFailureReason/,
    "subthreshold proof must remain recoverable without rebuilding WebGL",
  );

  const providerSource = source(
    "src/components/providers/TahoeGlassV4Provider.tsx",
  );
  assert.match(providerSource, /scene\.kind === "material-only"/);
  assert.match(providerSource, /diagnostics\.lifecycle === "refraction-presented"/);
  assert.match(providerSource, /data-tahoe-glass-v4-frame-presented/);
  assert.match(providerSource, /reduced-transparency-active/);
  assert.match(providerSource, /requestRender\("refraction-visible-commit"\)/);
  assert.match(providerSource, /!proofRecoveryActive/);

  const rolloutSource = source(
    "src/components/providers/TahoeV4RolloutGate.tsx",
  );
  assert.doesNotMatch(
    rolloutSource,
    /localStorage/,
    "stale browser storage must not override the deployed V4 mode",
  );

  const labSource = source("src/app/glass-lab-v4/GlassLabV4.tsx");
  assert.match(labSource, /glass-lab-v4-capture-\$\{mode\}/);
  assert.match(labSource, /glass-lab-v4-provider-material/);
  assert.match(labSource, /glass-lab-v4-provider-refraction/);
  assert.match(labSource, /evaluateRuntimeOpticalProof\s*\(diagnostics\)/);
  assert.match(labSource, /evaluateRuntimeRefraction\s*\(/);
  assert.match(labSource, /glass-lab-v4-acceptance-verdict/);
  assert.match(
    labSource,
    /data-runtime-pixel-evaluator=\{pixelEvaluatorStatus\}/,
  );
  assert.match(labSource, /status:\s*measurement\.pass\s*\?\s*"pass"\s*:\s*"fail"/);
  assert.match(
    labSource,
    /pixelEvaluatorStatus:\s*measurement\.pass\s*\?\s*"complete"\s*:\s*"failed"/,
  );
  assert.match(labSource, /Checker UNQUALIFIED/);
  assert.match(labSource, /NOT GEOMETRY-GATED/);
  assert.match(
    labSource,
    /\$\{proof\.changedCount\}\/\$\{proof\.sampleCount\}/,
  );
  const runtimeCaptureSource = source(
    "src/lib/tahoe-glass/v4-testing/runtime-capture.ts",
  );
  assert.match(runtimeCaptureSource, /gl\.readPixels\s*\(/);
  assert.match(runtimeCaptureSource, /inspectRuntimeMaterial/);
  assert.match(runtimeCaptureSource, /inspectRuntimeSourceParity/);
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
