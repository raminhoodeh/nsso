# Tahoe Glass V4 core

V4 owns one WebGL context and one explicit pixel scene. It renders that scene
to an FBO and applies the displacement composite in the same context. The DOM
material is intentionally outside this package so it remains visible during
loading, fallback, context loss, and feature rollback.

## Supported scene contract

- `clouds`: the pinned Vanta CLOUDS 0.5.24 volumetric shader, bundled locally,
  with `horizonOffset` as a real uniform.
- `image`: a same-origin/CORS-enabled URL or owned decoded image.
- `video`: an owned `<video>` with a current CORS-safe frame.
- `material-only`: an explicit, non-refractive fallback.

Arbitrary DOM, interactive Maps DOM, and foreign WebGL canvases are not scene
sources. V4 does not use `captureStream`, DOM screenshots, or cross-context
canvas uploads.

## Optical contract

- `control` preserves the supplied `35 / 3.5 / 0.8 / 24` control field bytes.
- `edge-lens` uses the actual rounded-rectangle radius and a fixed CSS-pixel
  band: `clamp(40px, 12% of the short side, 88px)`, capped at half the short
  side.
- `material-only` surfaces are ignored by the displacement compositor.
- Overlapping refractive surfaces use deterministic priority/DOM paint order;
  the top field wins. V4 does not claim recursive refraction of foreground DOM.
- The supplied 24-bin analysis is exported and emitted as directional rim CSS
  variables when surface geometry changes.

## Runtime limits

- Default maximum DPR: `1`.
- Default continuous frame cap: `30fps` (caller may request `1..60`).
- Clouds render at the approved Vanta `75%` internal resolution by default and
  are linearly presented at the output resolution in the same context.
- Rendering stops while the document is hidden.
- Maximum viewport allocation: `2,500,000` pixels, further capped by the
  context's `MAX_TEXTURE_SIZE`.
- Maximum generated pixels per cached surface field: `1,000,000`.
- Displacement field cache: at most `96` entries and `32MiB`, LRU-evicted.
- Image/video dimensions may not exceed the context's `MAX_TEXTURE_SIZE`.
- Source resolution timeout: `10s` by default.

`refraction-presented` is a runtime renderer pixel-proof state. The renderer selects up
to 12 high-bend probes while reserving two spatially separated probes per
visible refractive surface (up to six surfaces), renders the same scene/map once
at zero displacement and once at the normal scale, then adjusts both RGB pairs
for the conservative 50% white-layer plus semantic-tint transmission, evaluates
both light- and dark-tint offsets, and compares them with CIEDE2000.
Certification requires at least half of the probes to clear one JND, an average
of one JND across all probes, a two-JND maximum, and changed probes spanning at
least two vertical viewport regions and (when available) two final owner
surfaces. The
candidate scan is capped at 100,000 map points and the displaced render is
always left as the final output. Initial proof retries for at most two visible
seconds; a `refraction-subthreshold` or
`refraction-no-presentable-surfaces` result remains fail-closed behind material
and retries at no more than 1Hz without rebuilding the source or WebGL context.
Later map revisions are revalidated in the background without hiding or
demoting an already-proven scene. This prediction does not simulate the CSS
blur, saturation, brightness, or spatial highlight at each probe; final
CSS-composited physical-device A/B approval remains mandatory.
