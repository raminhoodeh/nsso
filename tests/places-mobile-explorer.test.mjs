import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const explorer=read('../src/app/places/dubai/PlacesExplorer.tsx');
const detail=read('../src/app/places/dubai/MobilePlaceDetails.tsx');
const css=read('../src/app/places/dubai/mobile-places.module.css');
test('mobile has one bottom navigation and leaves desktop sidebar intact',()=>{
  assert.match(explorer,/const Navigation = isCompact \? MobilePlacesNavigation : PlacesNavigation/);
  assert.match(explorer,/aria-label="Places navigation"/);
  assert.match(explorer,/id="places-mobile-deity-trigger"/);
  assert.doesNotMatch(explorer,/<nav className=\{styles.mobileDock\}/);
  assert.match(explorer,/selectedPlace && !deityOpen && !isCompact/);
});
test('only full mobile panels isolate the map, partial panels remain usable',()=>{
  assert.match(explorer,/mobilePanelOpen && navigationSnap === "full"/);
  assert.match(explorer,/detailSnap === "full"/);
  assert.match(explorer,/inert=\{galleryOpen \|\| mobileModalOpen\}/);
});
test('place preview keeps directions and save fixed and extra details expandable',()=>{
  assert.match(detail,/footer=\{<div className=\{styles.placeActions\}/);
  assert.match(detail,/Directions<\/a>/);
  assert.match(detail,/props\.saved \? "Saved" : "Save"/);
  assert.match(detail,/<details className=\{styles.accordion\}><summary>Plan your visit/);
  assert.match(detail,/Back to conversation/);
  assert.match(css,/\.thumbnail \{ width: 64px; height: 64px/);
});
test('mobile map groups pins and keeps selected out-of-filter recommendations without resetting filters',()=>{
  assert.match(explorer,/isCompact \? clusterPlaces\(mapPlaces, markerZoom, markerSelection\)/);
  assert.match(explorer,/const markerZoom = isCompact \? mapZoom : 17/);
  assert.match(explorer,/const markerSelection = isCompact \? selectedId : null/);
  assert.match(explorer,/\[\.\.\.filteredPlaces, selectedPlace\] : filteredPlaces/);
  assert.match(explorer,/onSelectPlace=\{id => \{\s+selectPlace\(id, true\)/);
  assert.match(explorer,/map\.setOptions\(\{ zoomControl: !isCompact \}\)/);
  assert.match(explorer,/maxWidth: 720, maxHeight: 540/);
});
