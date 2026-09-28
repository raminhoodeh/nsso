import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = file => fs.readFileSync(new URL(file, import.meta.url), "utf8");
const explorer = read("../src/app/places/dubai/PlacesExplorer.tsx");
const navigation = read("../src/app/places/dubai/PlacesNavigation.tsx");
const navigationCss = read("../src/app/places/dubai/navigation.module.css");
const mapCss = read("../src/app/places/dubai/places.module.css");

test("experiences replace the always-visible search, chips and venue list", () => {
  assert.ok(explorer.includes("<PlacesNavigation"));
  assert.ok(!explorer.includes("styles.categoryScroller"));
  assert.ok(!explorer.includes('placeholder="Search a place, area or mood…"'));
  assert.match(navigation, /resultsOpen \? \(/);
  assert.match(navigation, /aria-label="Experiences"/);
  assert.match(navigation, /View \{resultLabel\}/);
  assert.match(explorer, /matchesExperience\(place, events, experienceId, subcategoryId\)/);
});

test("desktop sidebar is flush and owns layout space instead of covering the map", () => {
  assert.match(mapCss, /--navigation-width: 460px/); // 368 × 1.25; mobile remains capped.
  assert.match(navigationCss, /inset: 0 auto 0 0/);
  assert.match(navigationCss, /border-radius: 0/);
  assert.match(navigationCss, /height: 100%/);
  assert.match(mapCss, /inset: 0 0 0 var\(--navigation-width\)/);
  assert.match(explorer, /detailPanelRef\.current\?\.getBoundingClientRect\(\)\.width/);
  assert.match(explorer, /const leftPadding = isMobile \? 42 : 48/);
});

test("mobile drawer has isolation, focus containment, dismissal and reduced motion", () => {
  assert.match(navigation, /useTahoeModalAccessibility\(\{/);
  assert.match(navigation, /open: drawerOpen/);
  assert.match(navigation, /restoreFocus: false/);
  assert.match(navigation, /role=\{compact \? "dialog" : undefined\}/);
  assert.match(navigation, /inert=\{compact && !open\}/);
  assert.match(navigation, /aria-label="Dismiss navigation"/);
  assert.match(navigationCss, /translateX\(-100%\)/);
  assert.match(navigationCss, /prefers-reduced-motion: reduce/);
  assert.match(explorer, /inert=\{galleryOpen \|\| \(isCompact && \(mobilePanelOpen \|\| deityOpen\)\)\}/);
  assert.match(explorer, /if \(!media\.matches\) setMobilePanelOpen\(false\)/);
  assert.match(explorer, /marker\.node\.tabIndex = media\.matches \? -1 : 0/);
});

test("saved places, exhibition deep links and calendar actions remain reachable", () => {
  assert.match(navigation, /aria-label=\{`Saved places, \$\{savedCount\} saved`\}/);
  assert.match(explorer, /get\("category"\) === "art-exhibitions"/);
  assert.match(explorer, /setExperienceId\("whats-on"\)/);
  assert.match(explorer, /setSubcategoryId\("art-exhibitions"\)/);
  assert.match(explorer, /googleCalendarUrl\(event, selectedPlace\)/);
  assert.match(explorer, /art-exhibitions\.ics/);
  assert.match(explorer, /localStorage\.setItem\(STORAGE_KEY/);
});

test("small navigation labels have readable contrast on the sidebar and selected rows", () => {
  const secondary = navigationCss.match(/--nav-secondary: #(\w{6})/)[1];
  const luminance = hex => {
    const [r,g,b] = hex.match(/\w\w/g).map(value => parseInt(value,16)/255)
      .map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
    return r*.2126 + g*.7152 + b*.0722;
  };
  for (const background of ["ffffff", "f4f5f7", "edf4fb"]) {
    assert.ok((luminance(background)+.05)/(luminance(secondary)+.05) >= 4.5, background);
  }
});

test("long visit guides scroll independently of the fixed save and close controls", () => {
  assert.match(explorer, /contentClassName=\{`\$\{styles.detailFrame\} relative`\}/);
  assert.ok(explorer.indexOf('className={styles.detailControls}') < explorer.indexOf('className={styles.detailContent}'));
  assert.match(mapCss, /\.detailFrame \{ max-height: inherit; \}/);
  assert.match(mapCss, /\.detailContent \{[\s\S]*?overflow: auto;/);
});
