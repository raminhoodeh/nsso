import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const navigation = fs.readFileSync(new URL("../src/app/places/dubai/PlacesNavigation.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/app/places/dubai/navigation.module.css", import.meta.url), "utf8");

test("desktop navigation minimizes to a pinned rail without resetting the selected collection", () => {
  assert.match(navigation, /const desktopMinimized = !compact && minimized/);
  assert.match(navigation, /aria-label=\{desktopMinimized \? "Expand navigation" : "Minimize navigation"\}/);
  assert.match(navigation, /aria-expanded=\{!desktopMinimized\} aria-controls="places-navigation-content"/);
  assert.match(navigation, /id="places-navigation-content" className=\{styles.fullContent\} hidden=\{desktopMinimized\}/);
  assert.match(css, /\.minimized \{ width: 72px; \}/);
  assert.match(css, /\.sidebar \[hidden\] \{ display: none !important; \}/);
  const toggle = navigation.match(/const toggleMinimized = \(\) => \{([\s\S]*?)\n  \};/)[1];
  assert.match(toggle, /onMinimizedChange\(!minimized\)/);
  assert.doesNotMatch(toggle, /onReset|onExperience|onSubcategory|onSaved|onEmirate|onBack/);
  assert.match(navigation, /minimizeRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
});

test("category and date-idea menus have independent accessible disclosure controls", () => {
  for (const [state, target] of [
    ["experiencesExpanded", "places-experience-options"],
    ["categoriesExpanded", "places-category-options"],
    ["plansExpanded", "places-date-ideas"],
  ]) {
    assert.ok(navigation.includes(`aria-expanded={${state}} aria-controls="${target}"`), target);
    assert.match(navigation, new RegExp(`id="${target}"[^>]*hidden=\\{!${state}\\}`));
  }
  assert.match(css, /\.sectionToggle[^}]*min-height: 44px/);
  assert.match(css, /\.sectionToggle\[aria-expanded="false"\] svg \{ transform: rotate\(-90deg\)/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?\.sectionToggle svg \{ transition: none/);
});

test("the minimized rail retains experience, saved, map and Places Deity entry points", () => {
  assert.match(navigation, /aria-label="Quick place categories"/);
  assert.match(navigation, /const expandToExperience = \(id: ExperienceId\) => \{\s+onMinimizedChange\(false\);\s+onExperience\(id\)/);
  assert.match(navigation, /onMinimizedChange\(false\); onSaved\(\)/);
  assert.equal((navigation.match(/aria-label="Ask Deity to plan a day"/g) || []).length, 2);
  assert.match(navigation, /onClick=\{onAskDeity\}/);
  assert.match(navigation, /aria-label="Close navigation and return to map" onClick=\{onClose\}/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.minimize \{ display: none; \}/);
});
