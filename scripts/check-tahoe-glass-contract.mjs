#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const files = {
  golden: "src/components/ui/apple-tahoe-liquid-glass-button.tsx",
  constants: "src/lib/tahoe-glass/constants.ts",
  optics: "src/lib/tahoe-glass/optics.ts",
  provider: "src/components/providers/TahoeGlassProvider.tsx",
  surface: "src/components/ui/tahoe-glass/TahoeGlassSurface.tsx",
  webgl: "src/lib/tahoe-glass/webgl.ts",
};

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

const sources = Object.fromEntries(
  Object.entries(files).map(([name, relativePath]) => [name, read(relativePath)]),
);

const failures = [];
const checks = [];

function check(label, test) {
  try {
    test();
    checks.push(label);
  } catch (error) {
    failures.push(
      `${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function capture(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match?.[1] !== undefined, `could not extract ${label}`);
  return match[1];
}

function numberCapture(source, pattern, label) {
  const value = Number(capture(source, pattern, label));
  assert.ok(Number.isFinite(value), `${label} is not finite`);
  return value;
}

function normalizeCss(value) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const canonical = {
  bins: numberCapture(
    sources.golden,
    /const\s+BINS\s*=\s*([0-9.]+)/,
    "canonical rim bins",
  ),
  displacementScale: numberCapture(
    sources.golden,
    /const\s+DISP_SCALE\s*=\s*([0-9.]+)/,
    "canonical displacement scale",
  ),
  superellipsePower: numberCapture(
    sources.golden,
    /const\s+power\s*=\s*([0-9.]+)/,
    "canonical superellipse power",
  ),
  curvePower: numberCapture(
    sources.golden,
    /Math\.sin\(Math\.pow\(d,\s*([0-9.]+)\)\s*\*\s*Math\.PI\)/,
    "canonical curve power",
  ),
  lightX: numberCapture(
    sources.golden,
    /const\s+LIGHT_SOURCE\s*=\s*\{\s*x:\s*([0-9.]+)/,
    "canonical light x",
  ),
  lightY: numberCapture(
    sources.golden,
    /const\s+LIGHT_SOURCE\s*=\s*\{[^}]*y:\s*([0-9.]+)/,
    "canonical light y",
  ),
  frostBackground: capture(
    sources.golden,
    /background:\s*renderMode\s*===\s*"webgl"\s*\?\s*"[^"]+"\s*:\s*"([^"]+)"/,
    "canonical frost background",
  ),
  frostBackdrop: capture(
    sources.golden,
    /backdropFilter:\s*renderMode\s*===\s*"webgl"\s*\?\s*"none"\s*:\s*"([^"]+)"/,
    "canonical frost backdrop filter",
  ),
  frostWebkitBackdrop: capture(
    sources.golden,
    /WebkitBackdropFilter:\s*renderMode\s*===\s*"webgl"\s*\?\s*"none"\s*:\s*"([^"]+)"/,
    "canonical frost WebKit backdrop filter",
  ),
  frostRadial: capture(
    sources.golden,
    /backgroundImage:\s*renderMode\s*===\s*"webgl"\s*\?\s*"none"\s*:\s*"([^"]+)"/,
    "canonical frost radial highlight",
  ),
  specularShadow: normalizeCss(
    capture(
      sources.golden,
      /boxShadow:\s*`([\s\S]*?)`\s*\n\s*}/,
      "canonical specular shadow",
    ),
  ),
  rimOpacity: capture(
    sources.golden,
    /opacity:\s*"(calc\(0\.62\s*\+\s*var\(--rim-intensity\)\s*\*\s*0\.24\))"/,
    "canonical rim opacity",
  ),
};

function transpileModule(relativePath, requireModule) {
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: relativePath,
  }).outputText;
  const evaluatedModule = { exports: {} };
  vm.runInNewContext(output, {
    module: evaluatedModule,
    exports: evaluatedModule.exports,
    require: requireModule,
    console,
    Math,
    Number,
    Uint8ClampedArray,
  }, { filename: relativePath });
  return evaluatedModule.exports;
}

const productionConstants = transpileModule(files.constants, (specifier) => {
  throw new Error(`unexpected constants import: ${specifier}`);
});

function createFakeDocument() {
  return {
    createElement(tagName) {
      assert.equal(tagName, "canvas", "optics must allocate a canvas");
      const canvas = {
        width: 0,
        height: 0,
        image: null,
        getContext(contextType) {
          assert.equal(contextType, "2d", "optics must use a 2D context");
          return {
            createImageData: (width, height) => ({
              width,
              height,
              data: new Uint8ClampedArray(width * height * 4),
            }),
            putImageData: (image) => {
              canvas.image = image;
            },
          };
        },
      };
      return canvas;
    },
  };
}

function loadProductionOptics() {
  const output = ts.transpileModule(sources.optics, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: files.optics,
  }).outputText;
  const evaluatedModule = { exports: {} };
  vm.runInNewContext(output, {
    module: evaluatedModule,
    exports: evaluatedModule.exports,
    require: (specifier) => {
      if (specifier === "./constants") return productionConstants;
      throw new Error(`unexpected optics import: ${specifier}`);
    },
    document: createFakeDocument(),
    console,
    Math,
    Number,
    Uint8ClampedArray,
  }, { filename: files.optics });
  return evaluatedModule.exports;
}

function createCanonicalField(cssWidth, cssHeight, dpr, alphaOutside) {
  const safeDpr = Math.max(0.25, Number.isFinite(dpr) ? dpr : 1);
  const width = Math.max(1, Math.round(cssWidth * safeDpr) || 0);
  const height = Math.max(1, Math.round(cssHeight * safeDpr) || 0);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x / width) * 2 - 1;
      const ny = (y / height) * 2 - 1;
      const d =
        Math.pow(Math.abs(nx), canonical.superellipsePower) +
        Math.pow(Math.abs(ny), canonical.superellipsePower);
      let red = 128;
      let green = 128;
      let alpha = alphaOutside;

      if (d <= 1) {
        const curveMagnitude = Math.sin(
          Math.pow(d, canonical.curvePower) * Math.PI,
        );
        red = Math.round(128 + -nx * curveMagnitude * 127);
        green = Math.round(128 + -ny * curveMagnitude * 127);
        alpha = 255;
      }

      const index = (y * width + x) * 4;
      data[index] = red;
      data[index + 1] = green;
      data[index + 2] = 128;
      data[index + 3] = alpha;
    }
  }

  return { width, height, safeDpr, data };
}

check("production constants equal the supplied component", () => {
  assert.equal(
    productionConstants.TAHOE_DISPLACEMENT_SCALE,
    canonical.displacementScale,
  );
  assert.equal(
    productionConstants.TAHOE_SUPERELLIPSE_POWER,
    canonical.superellipsePower,
  );
  assert.equal(
    productionConstants.TAHOE_CURVE_POWER,
    canonical.curvePower,
  );
  assert.equal(productionConstants.TAHOE_RIM_BINS, canonical.bins);
  assert.equal(productionConstants.TAHOE_LIGHT_SOURCE.x, canonical.lightX);
  assert.equal(productionConstants.TAHOE_LIGHT_SOURCE.y, canonical.lightY);
});

check("production displacement bytes equal the supplied component", () => {
  const optics = loadProductionOptics();
  assert.equal(
    typeof optics.createTahoeDisplacementField,
    "function",
    "createTahoeDisplacementField is not exported",
  );

  for (const fixture of [
    [1, 1, 1, 0],
    [180, 60, 1, 0],
    [91, 37, 2, 255],
  ]) {
    const [cssWidth, cssHeight, dpr, alphaOutside] = fixture;
    const expected = createCanonicalField(
      cssWidth,
      cssHeight,
      dpr,
      alphaOutside,
    );
    const actual = optics.createTahoeDisplacementField(
      cssWidth,
      cssHeight,
      dpr,
      alphaOutside,
    );
    assert.ok(actual, `field ${fixture.join("x")} was not generated`);
    assert.equal(actual.pixelWidth, expected.width);
    assert.equal(actual.pixelHeight, expected.height);
    assert.equal(actual.dpr, expected.safeDpr);
    assert.deepEqual(
      Array.from(actual.data),
      Array.from(expected.data),
      `field bytes drifted for ${fixture.join("x")}`,
    );
  }
});

check("no noncanonical large-surface displacement profile exists", () => {
  assert.doesNotMatch(
    sources.optics,
    /TahoeDisplacementProfile|profile\s*===\s*["']surface["']|Math\.pow\(superellipse,\s*1\s*\//,
    "production must use the supplied d field verbatim for every surface",
  );
  assert.doesNotMatch(
    sources.surface,
    /CONTROL_PROFILE_VARIANTS|displacementProfileForVariant|profile\s*:/,
    "surfaces must not select an alternate deformation profile",
  );
});

check("SVG filters retain the supplied displacement contract", () => {
  assert.equal(
    occurrences(sources.provider, /scale=\{TAHOE_DISPLACEMENT_SCALE\}/g),
    2,
    "both double-buffered SVG filters must use the canonical scale",
  );
  assert.equal(
    occurrences(sources.provider, /in="SourceGraphic"/g),
    2,
    "both SVG filters must displace SourceGraphic",
  );
  assert.equal(
    occurrences(sources.provider, /in2="dispMap"/g),
    2,
    "both SVG filters must use the composite displacement map",
  );
  assert.equal(occurrences(sources.provider, /xChannelSelector="R"/g), 2);
  assert.equal(occurrences(sources.provider, /yChannelSelector="G"/g), 2);
});

check("WebGL shader retains the supplied displacement contract", () => {
  assert.match(
    sources.webgl,
    /vec2\s+bend\s*=\s*\(displacement\.rg\s*-\s*0\.5\)\s*\*\s*2\.0\s*\*\s*uScale\s*;/,
  );
  assert.match(
    sources.webgl,
    /TAHOE_DISPLACEMENT_SCALE\s*\*\s*Math\.max\(0\.25,\s*dpr\)/,
  );
});

check("specular shadow equals the supplied component", () => {
  assert.equal(
    normalizeCss(productionConstants.TAHOE_SPECULAR_SHADOW),
    canonical.specularShadow,
  );
  assert.match(sources.surface, /boxShadow:\s*TAHOE_SPECULAR_SHADOW/);
});

check("surface body contains only the supplied material values", () => {
  const materialStart = sources.surface.indexOf(
    'className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"',
  );
  const materialEnd = sources.surface.indexOf(
    "{semanticTint !== \"none\"",
    materialStart,
  );
  assert.ok(materialStart >= 0 && materialEnd > materialStart, "material span not found");
  const material = sources.surface.slice(materialStart, materialEnd);

  assert.match(
    sources.surface,
    /const\s+webglMaterial\s*=\s*diagnostics\.backend\s*===\s*["']webgl["']\s*;/,
    "material must explicitly identify the WebGL backend",
  );
  assert.match(
    material,
    new RegExp(
      `background:\\s*webglMaterial\\s*\\?\\s*["']transparent["']\\s*:\\s*solidMaterial\\s*\\?\\s*["']Canvas["']\\s*:\\s*["']${escapeRegExp(canonical.frostBackground)}["']`,
    ),
    "WebGL must be clear; only SVG/CSS may use the canonical frost fill",
  );
  assert.match(
    material,
    new RegExp(
      `backdropFilter:\\s*webglMaterial\\s*\\|\\|\\s*solidMaterial\\s*\\?\\s*["']none["']\\s*:\\s*["']${escapeRegExp(canonical.frostBackdrop)}["']`,
    ),
    "WebGL must not add a backdrop filter",
  );
  assert.match(
    material,
    new RegExp(
      `WebkitBackdropFilter:\\s*webglMaterial\\s*\\|\\|\\s*solidMaterial\\s*\\?\\s*["']none["']\\s*:\\s*["']${escapeRegExp(canonical.frostWebkitBackdrop)}["']`,
    ),
    "WebGL must not add a WebKit backdrop filter",
  );
  assert.match(
    material,
    new RegExp(
      `backgroundImage:\\s*webglMaterial\\s*\\|\\|\\s*solidMaterial\\s*\\?\\s*["']none["']\\s*:\\s*["']${escapeRegExp(canonical.frostRadial)}["']`,
    ),
    "WebGL must not add a material wash",
  );
  for (const value of [
    canonical.frostBackground,
    canonical.frostBackdrop,
    canonical.frostWebkitBackdrop,
    canonical.frostRadial,
  ]) {
    assert.ok(material.includes(value), `missing canonical material value: ${value}`);
  }

  const whiteMixes = new Set(
    [...material.matchAll(/color-mix\(in srgb,\s*white\s+[0-9.]+%,\s*transparent\)/g)]
      .map(([value]) => value),
  );
  assert.deepEqual(whiteMixes, new Set([canonical.frostBackground]));

  const radialHighlights = new Set(
    [...material.matchAll(/["'](radial-gradient\(circle at[^"']+)["']/g)]
      .map((match) => match[1]),
  );
  assert.deepEqual(radialHighlights, new Set([canonical.frostRadial]));
});

check("rim opacity equals the supplied component", () => {
  assert.ok(sources.surface.includes(`opacity: "${canonical.rimOpacity}"`));
});

if (failures.length > 0) {
  console.error("Tahoe glass contract FAILED\n");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "\nThe canonical source is apple-tahoe-liquid-glass-button.tsx; do not tune around this check.",
  );
  process.exitCode = 1;
} else {
  console.log(`Tahoe glass contract passed (${checks.length} checks).`);
}
