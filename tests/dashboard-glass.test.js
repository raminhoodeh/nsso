/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

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
  resolveDashboardBackdropPolicy,
} = require("../src/lib/tahoe-glass/dashboard-backdrop-policy.ts");

const DASHBOARD_ROOT = path.join(process.cwd(), "src/app/dashboard");

function dashboardFiles(directory = DASHBOARD_ROOT) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return dashboardFiles(target);
    return entry.name.endsWith(".tsx") ? [target] : [];
  });
}

function jsxAttributes(node, sourceFile) {
  return Object.fromEntries(
    node.attributes.properties
      .filter(ts.isJsxAttribute)
      .map((attribute) => [
        attribute.name.getText(sourceFile),
        attribute.initializer?.getText(sourceFile),
      ]),
  );
}

test("dashboard cards use one readable dark material policy", () => {
  const wrapper = fs.readFileSync(
    path.join(DASHBOARD_ROOT, "components/DashboardGlassCard.tsx"),
    "utf8",
  );

  assert.match(wrapper, /semanticTint = "dark"/);
  assert.match(wrapper, /selected \? 0\.42 : 0\.38/);
  assert.match(wrapper, /tone = "light"/);
  assert.match(wrapper, /TahoeBackdropSurface/);
  assert.match(wrapper, /getDashboardDirectBackdropSnapshot/);

  for (const file of dashboardFiles()) {
    if (file.endsWith("DashboardGlassCard.tsx")) continue;
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /from ["']@\/components\/ui\/GlassCard["']/,
      `${path.relative(process.cwd(), file)} bypasses DashboardGlassCard`,
    );
  }
});

test("every direct dashboard card and dialog carries the dark transmission layer", () => {
  const missing = [];

  for (const file of dashboardFiles()) {
    const source = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(sourceFile);
        const attributes = jsxAttributes(node, sourceFile);
        const directCard =
          tag === "TahoeGlassSurface" && attributes.variant === '"card"';
        const dialog = tag === "TahoeGlassDialog";

        if (
          (directCard || dialog) &&
          (attributes.semanticTint !== '"dark"' ||
            attributes.semanticTintOpacity !== "{0.38}")
        ) {
          const line =
            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
              .line + 1;
          missing.push(`${path.relative(process.cwd(), file)}:${line}`);
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  assert.deepEqual(missing, []);
});

test("primary dashboard panes use the reusable backdrop engine without mobile lens fan-out", () => {
  const wrapper = fs.readFileSync(
    path.join(DASHBOARD_ROOT, "components/DashboardGlassCard.tsx"),
    "utf8",
  );
  const page = fs.readFileSync(path.join(DASHBOARD_ROOT, "page.tsx"), "utf8");
  const sidebar = fs.readFileSync(
    path.join(process.cwd(), "src/components/layout/DashboardSidebar.tsx"),
    "utf8",
  );
  const vanta = fs.readFileSync(
    path.join(process.cwd(), "src/components/VantaBackground.tsx"),
    "utf8",
  );

  const primaryStart = wrapper.indexOf("function PrimaryBackdropCard");
  const primaryEnd = wrapper.indexOf("/**\n * Dashboard-safe", primaryStart);
  const primaryWrapper = wrapper.slice(primaryStart, primaryEnd);

  assert.match(primaryWrapper, /useSyncExternalStore/);
  assert.match(primaryWrapper, /backdropEnabled=\{directBackdropEnabled\}/);
  assert.equal((primaryWrapper.match(/<TahoeBackdropSurface\b/g) || []).length, 1);
  assert.doesNotMatch(primaryWrapper, /<GlassCard\b/);
  assert.doesNotMatch(primaryWrapper, /if \(!directBackdropEnabled\)/);
  assert.match(page, /<GlassCard refractive/);
  assert.match(sidebar, /<TahoeBackdropSurface/);
  assert.match(sidebar, /backdropEnabled=\{backdropEnabled\}/);
  assert.match(sidebar, /getDashboardDirectBackdropSnapshot/);
  assert.match(sidebar, /semanticTintOpacity=\{0\.38\}/);
  assert.match(vanta, /getDashboardAppleMobileSnapshot/);
  assert.match(vanta, /useFullAppleMobileSource/);
  assert.match(vanta, /h-\[100dvh\] w-screen/);
  assert.match(vanta, /h-\[75vh\] w-\[75vw\]/);
  assert.doesNotMatch(vanta, /lg:h-\[75vh\]/);
});

const BASE_CAPABILITIES = {
  forcedColors: false,
  reducedTransparency: false,
  supportsPrimitives: true,
  supportsReferenceSyntax: true,
};

test("wide iPads keep desktop layout without a local pane or sidebar lens", () => {
  const ipad = resolveDashboardBackdropPolicy({
    ...BASE_CAPABILITIES,
    maxTouchPoints: 5,
    platform: "iPad",
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
    viewportWidth: 1024,
  });
  const wideDesktopModeIpad = resolveDashboardBackdropPolicy({
    ...BASE_CAPABILITIES,
    maxTouchPoints: 5,
    platform: "MacIntel",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15",
    viewportWidth: 1366,
  });

  for (const policy of [ipad, wideDesktopModeIpad]) {
    assert.equal(policy.appleMobile, true);
    assert.equal(policy.desktopLayout, true);
    assert.equal(policy.directBackdropEnabled, false);
    assert.equal(policy.platformRoute, "webgl-owned-scene");
  }
});

test("iPhone Chrome remains material-only while using the full Vanta source", () => {
  const policy = resolveDashboardBackdropPolicy({
    ...BASE_CAPABILITIES,
    maxTouchPoints: 5,
    platform: "iPhone",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1",
    viewportWidth: 430,
  });

  assert.equal(policy.appleMobile, true);
  assert.equal(policy.desktopLayout, false);
  assert.equal(policy.directBackdropEnabled, false);
  assert.equal(policy.platformRoute, "webgl-owned-scene");
});

test("Android and desktop Chromium can enable direct dashboard backdrops", () => {
  const fixtures = [
    {
      maxTouchPoints: 5,
      platform: "Linux armv81",
      userAgent:
        "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 Chrome/138.0.7204.179 Mobile Safari/537.36",
      viewportWidth: 412,
    },
    {
      maxTouchPoints: 0,
      platform: "MacIntel",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/537.36 Chrome/138.0.7204.179 Safari/537.36",
      viewportWidth: 1440,
    },
  ];

  for (const fixture of fixtures) {
    const policy = resolveDashboardBackdropPolicy({
      ...BASE_CAPABILITIES,
      ...fixture,
    });
    assert.equal(policy.appleMobile, false);
    assert.equal(policy.directBackdropEnabled, true);
    assert.equal(policy.platformRoute, "svg-live-dom");
  }
});

test("direct backdrop surfaces make nested glass material-only without a second displacement pass", () => {
  const backdropSurface = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/components/ui/tahoe-glass/TahoeBackdropHeader.tsx",
    ),
    "utf8",
  );
  const genericSurface = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/components/ui/tahoe-glass/TahoeGlassSurface.tsx",
    ),
    "utf8",
  );
  const provider = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/components/providers/TahoeGlassProvider.tsx",
    ),
    "utf8",
  );

  assert.match(
    backdropSurface,
    /TahoeGlassDirectBackdropBoundaryContext\.Provider[\s\S]*value=\{backdropEnabled\}/,
  );
  assert.match(genericSurface, /refractive: !insideDirectBackdrop/);
  assert.match(
    genericSurface,
    /const activeOptics =\s*!insideDirectBackdrop &&/,
  );
  assert.match(provider, /refractive: boolean/);
  assert.match(
    provider,
    /if \(runtime\.refractive\) \{[\s\S]*context\.drawImage\(/,
  );
});
