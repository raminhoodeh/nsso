/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (filename) => fs.readFileSync(path.join(root, filename), "utf8");
const overlays = read("src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx");

function surfaces(filename) {
  const source = ts.createSourceFile(filename, read(filename), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = (node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === "TahoeGlassSurface") {
      const attributes = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map((attribute) => [attribute.name.getText(source), attribute.initializer?.getText(source)]));
      if (['"dialog"', '"popover"'].includes(attributes.variant)) found.push({ node, source, attributes });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function hasBackdropBoundary(node, source) {
  let ancestor = node.parent;
  while (ancestor) {
    if (ts.isJsxElement(ancestor) && ancestor.openingElement.tagName.getText(source) === "TahoeGlassDirectBackdropBoundaryContext.Provider") {
      return ancestor.openingElement.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "value" && attribute.initializer?.getText(source) === "{true}");
    }
    ancestor = ancestor.parent;
  }
  return false;
}

test("shared dialogs and popovers have opaque backing and explicit optics opt-out", () => {
  const panels = surfaces("src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx");
  assert.equal(panels.length, 2);
  for (const { node, source, attributes } of panels) {
    assert.equal(attributes["data-tahoe-readable-overlay"], '"true"');
    assert.ok(hasBackdropBoundary(node, source), "all panel controls inherit the no-new-refraction boundary");
    assert.match(attributes.className, /READABLE_OVERLAY_BACKING/);
    assert.equal(attributes.tone, '{readingMaterial === "white" ? "inherit" : surfaceProps.tone ?? "light"}');
    assert.match(attributes.contentClassName, /readingMaterial === "white".*LIGHT_PANEL.content/);
  }
  assert.match(overlays, /before:bg-\[#202126\]/);
  assert.match(overlays, /before:inset-0/);
  assert.match(overlays, /before:z-\[19\]/);
  assert.match(overlays, /before:rounded-\[inherit\]/);
  assert.match(overlays, /before:pointer-events-none/);
  assert.match(overlays, /forced-colors:before:bg-\[Canvas\]/);
});

test("direct Places popovers opt out while retaining their readable backings", () => {
  const panels = surfaces("src/app/places/dubai/PlacesExplorer.tsx");
  assert.equal(panels.length, 2);
  for (const { attributes } of panels) assert.equal(attributes["data-tahoe-readable-overlay"], '"true"');
  const placesStyles = read("src/app/places/dubai/places.module.css");
  assert.match(placesStyles, /\.mapError\s*\{[^}]*--surface-fill:\s*rgba\(250, 247, 238, 0\.96\)/);
  assert.match(placesStyles, /\.mapError::before,[\s\S]*?background:\s*var\(--surface-fill\)/);
  assert.match(placesStyles, /\.photoCredit::before,[\s\S]*?background:\s*var\(--control-fill, rgba\(24, 31, 26, 0\.74\)\)/);
});

test("the PayPal help popup uses the shared opaque white reading surface", () => {
  const panels = surfaces("src/app/dashboard/components/ProductsServicesEditor.tsx");
  assert.equal(panels.length, 1);
  const { node, source, attributes } = panels[0];
  assert.equal(attributes.id, '"paypal-guide"');
  assert.equal(attributes["data-tahoe-readable-overlay"], '"true"');
  assert.match(attributes.contentClassName, /LIGHT_PANEL\.surface/);
  assert.match(read("src/components/ui/light-panel.ts"), /surface:\s*'[^']*\bbg-\[#[a-f\d]{6}\]/i, "The shared reading material must keep an opaque RGB base beneath its gradient.");
  assert.doesNotMatch(attributes.contentClassName, /\bopacity-/);
  assert.ok(hasBackdropBoundary(node, source));
});

test("Deity and native film overlays never import the new clear-glass renderer", () => {
  for (const filename of [
    "src/components/agent/NSSOAgent.tsx",
    "src/components/agent/AgentChatInterface.tsx",
    "src/app/deity/page.tsx",
    "src/components/film/AddFilmModal.tsx",
    "src/app/places/dubai/PlacesDeity.tsx",
  ]) {
    const source = read(filename);
    assert.doesNotMatch(source, /liquid-glass-candidate|TahoeGlass(?:Surface|Dialog|Popover)/, filename);
  }
  assert.match(read("src/components/agent/AgentChatInterface.tsx"), /data-deity-surface="opaque"/);
  assert.match(read("src/components/agent/AgentChatInterface.tsx"), /LIGHT_PANEL\.surface/);
  assert.match(read("src/components/film/AddFilmModal.module.css"), /\.dialog\s*\{[^}]*background:\s*#202126/);
  assert.match(read("src/components/film/AddFilmModal.module.css"), /\.textarea\s*\{[^}]*background:\s*#2b2d33/);
  assert.match(read("src/components/film/MovieModal.module.css"), /\.window\s*\{[^}]*background:\s*#151619/);
  assert.match(read("src/components/film/MovieModal.tsx"), /<TahoeGlassDirectBackdropBoundaryContext\.Provider value=\{true\}>/);
});
