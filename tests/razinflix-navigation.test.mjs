import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const pageSource = read("src/app/film/razinflix/page.tsx");
const authenticatedLayoutSource = read(
  "src/components/layout/AuthenticatedLayoutWrapper.tsx",
);
const globalNavigationSource = read(
  "src/components/layout/GlobalNavigation.tsx",
);
const routeBoundarySource = read("src/lib/tahoe-glass/route-boundaries.ts");

test("RazinFlix owns its viewport without dashboard navigation or its desktop gutter", () => {
  assert.doesNotMatch(pageSource, /import\s+GlobalNavigation\b/);
  assert.doesNotMatch(pageSource, /<GlobalNavigation\b/);

  assert.match(routeBoundarySource, /["']\/film\/razinflix["']/);
  assert.match(
    authenticatedLayoutSource,
    /routeSuppressesAuthenticatedNavigation\(pathname\)/,
    "the authenticated wrapper must suppress dashboard chrome on route-owned experiences",
  );
  assert.match(authenticatedLayoutSource, /routeUsesDashboardSidebar\(pathname\)/);
  assert.match(globalNavigationSource, /routeSuppressesAuthenticatedNavigation\(pathname\)/);
  assert.match(globalNavigationSource, /routeUsesDashboardSidebar\(pathname\)/);
  assert.match(globalNavigationSource, /\{usesDashboardSidebar && <DashboardSidebar \/>\}/);
});

test("the desktop sidebar is confined to profile-creation dashboard routes", () => {
  assert.match(
    routeBoundarySource,
    /normalized === ["']\/dashboard["'] \|\| normalized\.startsWith\(["']\/dashboard\/["']\)/,
  );
  assert.match(
    authenticatedLayoutSource,
    /isLoggedIn && usesDashboardSidebar \? ["']lg:pl-\[280px\]["'] : ["']["']/,
  );
  assert.doesNotMatch(
    globalNavigationSource,
    /<DashboardSidebar \/>\s*\n\s*<DashboardBottomNav \/>/,
  );
});

test("the RazinFlix top navigation uses the canonical Tahoe refraction header", () => {
  assert.match(pageSource, /\bTahoeBackdropHeader\b/);

  const navStart = pageSource.indexOf("<TahoeBackdropHeader");
  const navEnd = pageSource.indexOf(">", navStart);
  assert.ok(
    navStart >= 0 && navEnd > navStart,
    "canonical Tahoe top nav is present",
  );

  const navOpening = pageSource.slice(navStart, navEnd + 1);
  assert.match(navOpening, /displacementProfile="prism-top"/);
  assert.match(navOpening, /materialLighting="uniform"/);
  assert.match(pageSource, /<nav\s+aria-label="RazinFlix controls"/);

  assert.doesNotMatch(
    pageSource,
    /<TahoeGlassSurface[\s\S]{0,240}?as="nav"/,
    "the top nav must not regress to the generic transparent glass surface",
  );
});
