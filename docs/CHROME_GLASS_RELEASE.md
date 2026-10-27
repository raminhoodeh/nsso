# Chrome glass release checklist

Scope: adopt the user-approved refractive component for eligible desktop Chrome
navigation and cards, preserve NSSO's existing mobile renderer, and keep Deity
and popups readable. This is a visual-system release, not an authorization,
database, payment or assistant-tool change.

All acceptance items below start incomplete. Check them only after recording
the corresponding result, exact revision, environment and evidence location.
Browser emulation must not be described as physical-device verification.

## Implementation and browser routing

- [ ] Desktop Chromium with a fine pointer, width at least 768 CSS pixels and
  supported SVG backdrop primitives uses the approved component on the top
  navigation and shared cards.
- [ ] Measured painted displacement, not merely a `backdrop-filter` declaration,
  confirms that scrolling high-contrast content refracts at navigation/card rims.
- [ ] Existing card tints preserve white-text readability against bright clouds.
- [ ] Eligible surfaces do not receive both old provider optics and new optics.
- [ ] Existing semantic elements, forwarded refs, links and button events remain
  functional; pointer-independent keyboard interaction remains available.
- [ ] Geometry, filter resources and generated textures remain bounded; resizing,
  route changes and unmounting do not retain obsolete filter elements.
- [ ] iPhone Safari and iPhone Chrome retain the existing owned-scene/mobile
  renderer, without silently falling back to the candidate's blur-only path.
- [ ] Android Chrome and other narrow/coarse-pointer layouts retain their existing
  mobile routing and optics.
- [ ] Desktop Safari and Firefox retain supported existing fallback behavior.
- [ ] Forced colors and reduced transparency retain solid accessible surfaces;
  reduced motion does not acquire continuous optical animation.
- [ ] At 320px, 390px and desktop widths, navigation/cards have no horizontal
  overflow, obscured primary controls or regression in touch-target spacing.

## Readable assistants and overlays

- [ ] Deity's chat surface, messages, suggestion controls and composer remain
  opaque/readable on desktop and mobile over high-contrast page content.
- [ ] Shared dialogs, popovers, menus and nested card surfaces do not acquire new
  transparent/refraction layers that expose content underneath.
- [ ] RazinFlix's Add Film and film-detail dialogs retain readable grey surfaces.
- [ ] Modal focus trapping, Escape/close, background inertness, scroll locking
  and focus restoration remain intact.
- [ ] Supplied NSSO logo assets render clearly where needed, with correct aspect
  ratio, accessible naming and no missing-image or hydration errors.
- [ ] Component provenance and the Lissé versioned MIT notice are retained in
  `THIRD_PARTY_NOTICES.md`; no marketplace demo media ships.

## Verification gates

- [ ] New renderer/routing/readability/logo regression tests pass.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes; any existing warnings are distinguished from new ones.
- [ ] `npm test` passes.
- [ ] `npm run test:browser` passes.
- [ ] `npm audit --audit-level=high` and `npm run verify:secrets` pass.
- [ ] `npm run build` passes with existing CSP verification intact.
- [ ] Focused Chrome and WebKit visual/interaction verification passes on the
  homepage, public profile, sign-in and signed-in dashboard/Deity when access is
  available; missing access is disclosed rather than represented as a pass.
- [ ] Browser console errors, failed critical assets and CSP violations are
  reviewed, with application defects resolved before promotion.

## Protected release and production proof

- [ ] The release PR is attached to the task, and its diff contains no unrelated
  source, private artifacts, credentials or database/security-control changes.
- [ ] Required GitHub `verify` and `database` checks pass against an up-to-date PR;
  no branch protection is weakened or bypassed.
- [ ] The merged production revision is recorded; deployment uses that exact
  revision and retains the configured `dub1` region and security headers.
- [ ] Both public domain aliases serve the intended release; `/api/health`
  reports `status: ok` and the exact promoted revision.
- [ ] Live Chrome and WebKit checks repeat the critical visual/interaction matrix,
  including readable Deity/popups and unchanged mobile renderer selection.
- [ ] `NSSO_PRODUCTION_REVISION` matches the verified promoted revision and the
  production-health workflow succeeds after promotion.
- [ ] A concise handoff states the live revision, evidence, test coverage and
  remaining limitations without claiming native Apple rendering or physical
  iPhone testing unless it actually occurred.

## Release evidence

Not yet recorded. Keep credentials, session state and personal profile data out
of committed reports. Link privacy-reviewed evidence here when available.
