# Supplied glass evaluation

Open `http://127.0.0.1:3027/glass-candidate` after starting
`npm run dev -- --hostname 127.0.0.1 --port 3027`.
This route is always 404 in a production build, even with preview opt-in flags.
It is intentionally not linked from live NSSO.

The October 27 user paste is isolated in
`src/components/ui/experimental/liquid-glass-candidate.tsx`.
The approved production integration reuses these optics through
`ChromeGlassOptics` on eligible desktop Chromium navigation and uniform-radius
cards. Semantic wrappers, explicit grey contrast washes and the existing mobile
renderer stay in place. Asymmetric speech-bubble cards retain their original
lens so their corner geometry is not changed. Deity and popups stay readable
and opt out. There are no authentication or database changes.

## What to try

- Scroll real text behind the fixed navigation.
- Compare rim pull 0 and 60 on the stationary high-contrast grid.
- Switch to blur-only; animate the grid; disable the grid to reveal the
  existing NSSO Vanta clouds. No third-party demo image downloads are needed.
- Test the button and hide/show surfaces to exercise cleanup.

The code generates displacement/rim maps and applies an SVG
`feDisplacementMap` through `backdrop-filter: url(...)`.
It is a web simulation, not an Apple-native iOS/macOS renderer.
Its supplied auto mode deliberately chooses frost on WebKit and Gecko,
including the usual iPhone Safari and Chrome/CriOS paths. Forcing the
`refract` prop cannot add missing browser rendering support.

## Evaluation-only adjustments

- Reuse NSSO's Tailwind-aware `cn` and React 19-compatible ref composition.
- Balance shared filter references on repeated measurements.
- Include bezel and pixel density in map-cache identities.
- Bound each raster map to 262,144 pixels.
- Default buttons to `type="button"`.
- Keep fluid geometry animation off in the fixture.

Original-source attribution and the version-shipped Lissé MIT notice are
retained in `THIRD_PARTY_NOTICES.md` and the homepage links to the author.
No marketplace demo images are shipped. The compatibility
`LiquidGlassViewport` in the paste ignores `fallbackMode="webgl"`; do not
replace NSSO's existing WebGL fallback with that wrapper.

## Verification

Run `node --test tests/glass-candidate.test.js` and
`node scripts/verify-glass-candidate.mjs` against the loopback dev server.
The latter saves screenshots and a report under
`private/test-results/glass-candidate/` and never signs in or mutates data.

October 27, 2026 local results: Chrome 156 desktop and mobile-sized emulation
showed measurable rim displacement. WebKit 27.2 desktop/mobile and a CriOS-UA
fixture stayed on frost, with zero change when varying rim pull. Button,
scrolling, mode switching, unmount/remount, horizontal overflow and uncaught
error checks passed in all five fixtures. These are browser-emulation tests,
not tests on a physical iPhone. Small central subpixel changes on desktop
come from the supplied 8-bit neutral-map quantization; the test records them
and requires distortion to remain concentrated at the rim.

The existing 459 Node regressions and eight candidate regressions pass,
as do TypeScript, focused lint and the two-pass CSP production build.
The built production route was separately checked to return 404.
