# NSSO UX release — 27 October 2026

Continuous goal: resolve every item from the current UX audit, deploy the release,
and verify production behaviour. Baseline: `2824b0f` (checkout and live health).

Status: `[ ]` pending, `[~]` implemented awaiting verification, `[x]` verified.
Every item requires evidence here before completion. No production customer
content should be removed to solve a presentation issue.

## Public pages

- [x] P01 Claim flow validates syntax and availability before signup; truthful claiming copy and retained draft.
- [x] P02 Every Create profile action opens account creation and preserves a safe destination.
- [x] P03 Public experience and qualification cards avoid nested scroll traps on mobile.
- [x] P04 Bio preview/collapse works for all long profiles; long profiles have useful section navigation.
- [x] P05 Primary homepage setup action is accessible above the fold and repeated appropriately.
- [x] P06 Decorative video respects reduced motion, has pause control, poster and loading fallback.
- [x] P07 Vision player synchronizes duration/progress after hydration and exposes reliable controls.
- [x] P08 Large videos load on demand; avoid unnecessary initial requests and redundant downloads.
- [x] P09 Privacy choices do not cover profile content; preserve explicit tracking consent.
- [x] P10 Public actions/contact links/bio toggle meet mobile touch-target sizing.
- [x] P11 Purchase links have distinct product-specific accessible names.
- [x] P12 Photo/QR toggle has an understandable touch affordance.
- [x] P13 Hero text remains readable against animated light backgrounds.

## Dashboard and account flows

- [x] D01 All signed-in mobile users can open Account security; only the Admin item is privileged.
- [x] D02 One validated completeness function is shared by dashboard, provider and Deity; score can reach 100.
- [x] D03 One consistent save/load status region prevents duplicate errors.
- [x] D04 Substantive deletions consistently offer confirmation or undo.
- [x] D05 My nsso uses readable mobile cards, explicit accessible sorting and adequately sized notes controls.
- [x] D06 Notes and product-delete dialogs portal above fixed app navigation.
- [x] D07 Image cropper fits short/landscape screens and keeps actions accessible.
- [x] D08 Advanced editor labels/placeholders are readable and explanations work with touch/keyboard.
- [x] D09 Empty My nsso displays actionable onboarding and QR guidance.

## Deity

- [x] A01 Composer grows across multiple lines while retaining submission and length limits.
- [x] A02 Repeated Ask Deity shortcut events each enqueue the requested prompt once.
- [x] A03 Mobile full-screen header respects safe areas and viewport/keyboard changes.
- [x] A04 Category controls meet touch sizing and expanded lists do not clip.
- [x] A05 Database image overlay offers a visible dismiss control and accessible modal behaviour.

## RazinFlix

- [x] R01 Unavailable/private trailers have a useful fallback; American Doctor is repaired or honestly marked unavailable.
- [x] R02 Browser Back closes film details; forward/deep links preserve sensible navigation.
- [x] R03 Details-only and Play trailer are distinct; browsing details does not autoplay.
- [x] R04 Catalogue rendering scales on mobile with bounded initial DOM and progressive rows/grid.
- [x] R05 Add film processing is cancellable, has bounded requests and removes artificial delays.
- [x] R06 Mobile header avoids a dedicated pause-only row and keeps search usable.
- [x] R07 Shelf arrows reflect boundaries and do not obscure mobile card interactions.
- [x] R08 Category chips filter exact membership, independently of free-text search.
- [x] R09 Recommendations ignore generic collection labels and require meaningful relevance.
- [x] R10 Visible home/back navigation and page-specific metadata prevent navigation dead ends.
- [x] R11 Mobile controls meet touch sizes; title casing and rating presentation are consistent.
- [x] R12 Public requests avoid unnecessary anonymous-auth error noise where safely possible.

## Release acceptance

- [x] V01 Functional regressions cover relevant interactions and failure states; required tests pass.
- [x] V02 Type checks, lint of changed files and production build pass.
- [x] V03 Desktop, narrow/mobile and short/landscape browser inspection passes; emulation is labelled accurately.
- [x] V04 Independent review completed and material findings resolved.
- [x] V05 Commit pushed and production deployment ready; live health revision matches intended commit.
- [x] V06 Critical live journeys repeated and remaining limitations disclosed.

## Evidence and handoff

- Initial checkout is clean; main and origin/main match live `/api/health` at `2824b0f`.
- Physical iPhone access has not been established; browser emulation must not be presented as device testing.

## Implementation verification (pre-production)

- Public: 60/60 focused browser cases and 16/16 targeted node checks passed; claim action measured above fold at 390×844, 1440×900 and 667×375; videos initially have no media source; public/preview experience overflow is visible. Poster extracted from the existing demo, and the preferred metallic CTA preserved.
- Dashboard: 36/36 focused browser checks and 23/23 targeted contracts passed. Tests cover standard-account menu/security, all six delete flows, failure/cancel paths, high modal layers, responsive connection cards, notes and 667×320 cropper controls. Synthetic fixtures use the actual UI and compiled CSS.
- Root: 26/26 account/Deity browser cases and 32/32 targeted node checks passed. Identical shortcut events enqueue separately without rerender replay; database information has a native dismissible dialog; multiline messages retain line breaks. Local actual Deity inspected at 390×844, 390×400, 667×375 and 1440×900 with no page errors or horizontal overflow; composer/send/close remain visible.
- RazinFlix: 30/30 focused browser cases, plus six cancellation/stall rechecks passed; initial actual DOM now contains 40 cards. Details do not embed or play video until requested. Private American Doctor clip is handled with an honest unavailable state and an external trailer search instead of a broken panel. Exact category filtering and meaningful recommendation helpers have tests.
- Final combined suite: 405/405 unit/API tests, 300/300 Chromium browser cases (desktop/mobile), and 22/22 WebKit mobile cases pass. Typecheck, production build, CSP/critical-CSS verification, and secret scan pass. Full lint exits zero with 50 non-blocking warnings.
- Independent dashboard review confirmed the optional account API preserves private/no-store and default protected 401 responses. It found the default New Product/price 0 completeness edge case; root corrected it and added the exact regression.

## Acceptance evidence by issue

- P01–P02, P05: `public-ux-release` and account-journey browser regressions cover invalid, reserved, taken and unavailable names, retained draft, safe destinations and truthful copy. Actual rendered CTA fits above the fold at 320×568, 390×844, 667×375 and 1440×900.
- P03–P04, P09–P12: public-profile regressions cover generic bio collapse, semantic sections, visible overflow, distinct purchase labels, 44px actions and photo/QR instructions. Actual /ramin has visible experience overflow, no horizontal overflow or page errors, and document-flow privacy controls.
- P06–P08, P13: media regressions cover reduced motion, pause persistence, unavailable media/retry, hydration metadata, lazy sources and legible hero surfaces. Both homepage video sources are unset initially in actual Chrome and WebKit rendering.
- D01, D03–D09: `dashboard-ux-release`, account and network suites cover standard-account menu/security access, one save/load region, all six confirmation flows including failure/cancel, responsive sorted cards, notes layering, onboarding, upload/help accessibility and cropper actions at 667×320.
- D02: `profile-completeness.test.mjs` verifies a reachable 100, invalid/empty row exclusion, and the default New Product/price-0 regression. Provider, dashboard and Deity import the same function.
- A01–A05: `deity-initial-message` regressions cover bounded multiline input, event queue order and exactly-once consumption, touch targets and dismissible database modal. Actual rendered Deity was inspected at desktop, mobile, short-keyboard and landscape sizes; send and close remain visible.
- R01, R03: trailer/browsing tests plus actual YouTube playback confirm details-only creates no iframe and Play starts explicitly. A real available trailer played beyond 19 seconds with onReady/infoDelivery messages and advancing subtitles. American Doctor's private clip produces an honest unavailable message and official trailer-search link.
- R02, R08: personal-app-quality regressions cover Back/Forward, direct links, category/search/view reload restoration, exact membership, category-from-modal, same-filter closure and search clearing. Actual WebKit Back/Forward and private-trailer fallback also pass.
- R04, R06–R07, R09–R11: browsing helpers and desktop/mobile regressions cover bounded initial 40-card DOM, progressive rendering, meaningful recommendations, consistent ratings, visible home link and heading-level shelf arrows. Actual 390×844, 844×390 and 1440×900 catalogue views have no horizontal overflow.
- R05: cancelled-add route tests and browser cancellation/stall cases cover no pre-abort writes, sequential bounded requests and honest saved/failed/unconfirmed counts. No real catalogue writes were made for verification.
- R12: account-security and optional-account checks retain protected-default 401, private/no-store and backend-failure 503 while allowing explicit optional unauthenticated reads to return a quiet null account.
- V04: independent reviewers checked root/account/Deity and film browsing/history changes. Two material findings (default product completeness and filter history) were corrected and given regression coverage.

## Verification limitations

- Browser mobile checks use Chromium emulation and desktop WebKit, not a physical iPhone or Android device.
- Authenticated editing and deletion checks use controlled fixtures of the real components and compiled CSS. No customer account, payments, real deletion, signup email or production AI spend is exercised.
- The local checkout's privileged credential is not current; local protected API outage paths were tested honestly. Deployment must use configured production credentials and pass live health.
- American Doctor's configured YouTube clip is private. It is labelled unavailable with a useful fallback, not claimed repaired or silently replaced.
- Final application release `fa3a9d697d9b7df44382d59052a37dd1116627c7` is deployed and verified. Both first-pass live findings described below are fixed and their production retests pass.

## First production verification and follow-up findings

- Protected PR #25 merged after both required jobs passed: database authorization/negative-control (2m48s) and full verification (5m42s). `npm audit --audit-level=high` found zero vulnerabilities.
- Vercel production deployment `dpl_EviTgkVCCz4XNAYBWY7LCdADoc9R` is READY. All five smoke routes return 200 with enforced CSP/nosniff, and health matches exact merge revision `b4f364a30c890ba010ad4dbadcd675101439dc31`.
- The production-health revision variable was updated and workflow run `40462764140` passed.
- Live RazinFlix: all six journey groups passed in Chrome desktop, WebKit mobile and Chrome landscape; actual YouTube ready messages and advancing playback verified in all three. Evidence: `private/test-results/ux-film-live-2026-10-27T06-43-04.647Z/report.json`.
- Live public journeys: 30/31 groups passed; both actual homepage videos decoded and duration/controls synchronized in desktop Chrome and mobile WebKit. Profile expansion, section anchors, touch actions, QR, privacy and initial unloaded media passed. Evidence: `private/test-results/ux-public-live-2026-10-27T06-43-03-497Z/report.json`.
- P01 follow-up: first-render Chrome can accept input before hydration then clear it during draft restoration. Keep SSR controls disabled until draft restoration and event handlers are ready; add a held-client/hydrateRoot regression and repeat live.
- A03 follow-up: actual /deity at WebKit 390×400 with four input lines places Send below the viewport (bottom425 versus400). Desktop and 390×844 pass. Compact the short-panel layout and verify using actual compiled CSS, then repeat live without sending AI messages.
- Live account reads confirm optional anonymous lookup returns 200/null, protected-default lookup retains 401, both private/no-store; malformed/taken names return available:false.
- Release incident: an initially started deployment completed while being stopped after the protected-branch rejection. Removing it briefly caused domain 404 responses. Both domains were restored to the previously verified baseline and health200 before the protected release was merged/deployed. No customer data was changed. Future deployment attempts must resolve branch protection and required checks before starting promotion.

## Follow-up implementation verification

- P01 fixed: server input/submit remain disabled until hydration restores the optional draft and makes handlers ready. Real renderToString → held-client → hydrateRoot regressions cover retained first edit, restored draft and denied browser storage. Public/hydration checks pass 32/32, with 3/3 dedicated WebKit hydration checks.
- A03 fixed: actual pane/header/toggle/padding measurements budget the composer and category list; short panes receive compact spacing. ResizeObserver and visualViewport listeners preserve fitting controls and drafts while resizing. Eight compiled-CSS WebKit regressions pass at 390×400, 390×844, 667×375 and resizing 844→400→320→844, including long drafts, category expansion and database dismissal, with zero page errors or observer-loop warnings.
- Root independently ran 20/20 follow-up browser cases and the production build/CSP checks. All 405 unit/API tests pass again; independent source review found no material remaining defect. Final production retests pass as recorded below.

## Final production acceptance — all 39 UX items verified

- PR #26 merged after both protected jobs passed: 405/405 unit/API tests, 314/314 browser tests, dependency audit (zero vulnerabilities), secret scan, lint, typecheck, production build, CSP/critical-CSS checks, and isolated database authorization/negative-control checks. CI run: `40463689508`.
- Final application merge revision: `fa3a9d697d9b7df44382d59052a37dd1116627c7`. Vercel deployment `dpl_9uQEMeZB4xFPixaDjZLRuDrzC38J` is READY. All five production smoke routes return200 with enforced security headers; public health reports that exact intended revision. The updated production-health workflow run `40464418689` passed.
- P01–P13 live retest: 42/42 journey groups passed in desktop Chrome, mobile Chrome emulation, mobile WebKit and short landscape WebKit. The original early-input hydration failure is resolved. Both actual homepage media files decode and playback/duration/controls synchronize in all three full-media browser configurations. No page exceptions or application write attempts.
  Evidence: `private/test-results/ux-public-live-2026-10-27T06-59-44-790Z/report.json`.
- A01/A03–A05 live retest: 5/5 actual /deity viewport cases pass (desktop Chrome, mobile Chrome, mobile WebKit, WebKit390×400 keyboard-sized, WebKit667×375 landscape). Four-line and twenty-line drafts retain an on-screen Send control; composer grows from56px to126px, capped111px where the short landscape needs it; categories and database dismissal remain usable. No AI requests, page errors or writes.
  Evidence: `private/test-results/ux-deity-live-2026-10-27T06-59-47.673Z/report.json`.
- R01–R04/R06–R11 live retest: all six journey groups pass in Chrome desktop, WebKit mobile and Chrome landscape. Exact New membership, filter/deep-link history, bounded rendering and unavailable-trailer fallback pass. A real available YouTube trailer emits ready messages and advances playback in all three; no external-provider verification limitation occurred. No catalogue writes.
  Evidence: `private/test-results/ux-film-live-2026-10-27T06-59-47.089Z/report.json`.
- D01–D09, A02 and R05 retain the passing authenticated fixture, native-HTTP and isolated authorization/transactional evidence described above; real customer account edits, destructive actions, signup emails, payments and production AI spend were deliberately not exercised. Mobile verification is browser emulation, not physical-device certification.
- American Doctor's configured private YouTube clip remains explicitly unavailable, with working trailer search/retry; no invented metadata or silent catalogue change.
- All feature and release acceptance boxes are complete. This evidence-only update changes no application, schema, dependencies or customer content. After its protected merge, repeat release-identity/route health and lightweight public/Deity smoke on the promoted documentation revision.
