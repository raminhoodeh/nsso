# Experience-led UAE places navigation

## Scope and design

Replace the always-visible search/chips/venue list with six experience collections: Eat & drink, Art & culture, Get outdoors, Do something together, Relax & unwind, and What's on. Venue data, Google Place IDs, images, event records and unrelated pages are unchanged.

The visual direction translates familiar Apple grouped-navigation patterns to the existing React website; this is not a native SwiftUI application. References: [Apple sidebar guidance](https://developer.apple.com/design/human-interface-guidelines/sidebars), [materials](https://developer.apple.com/design/human-interface-guidelines/materials) and [iOS design refinements](https://images.apple.com/os/ios/). In accordance with the user's explicit refinement, the sidebar is attached to the viewport's left edge, full-height and square at its outer edges, rather than floating over the map.

Desktop reserves 368px for navigation. Map fitting uses its actual remaining viewport; selected pins also allow space for the detail card. Mobile uses a full-height left drawer, not the previous floating bottom sheet. Text and place results use high-contrast solid surfaces; subtle material treatment is reserved for controls and the footer. The existing photo/detail overlay is retained.

## Interaction

- Selecting a parent immediately filters pins and reveals optional refinements.
- Selecting a refinement narrows the collection; on phones it closes the drawer so the map can be used. Reopening retains the selection.
- View matching places opens the accessible venue list. Back returns to the collection without losing its refinement; All experiences returns to the main menu.
- The emirate selector scopes both counts and results. Counts represent unique venues, so a venue with overlapping tags is not double-counted within a collection.
- Saved opens its own collection; existing local-storage identities are preserved. Surprise uses the current filtered collection. Near me keeps the existing distance sorting.
- What's on requires active, verified dated events from the existing event filter. Permanent event-series bookmarks are not presented as dated events. Art exhibitions retains individual event cards, calendar links, ICS download and the existing `?category=art-exhibitions` deep link.
- Refinements use existing taxonomy, Google venue types, names/aliases and a small documented set of curated identity exceptions. No mood, opening time, event date or romantic-suitability metadata is invented.

## Accessibility and containment

The mobile drawer has modal semantics, focus containment, a labelled close control, Escape/scrim dismissal and an inert background. Closing returns focus to Explore; selecting a venue instead focuses the detail close control. Closed drawer content is immediately inert, including during its exit transition. View changes focus their heading. Leaving the mobile breakpoint clears drawer isolation and updates marker tab stops. Motion and transparency preferences have scoped fallbacks.

Only the places route and its new pure navigation model are changed. No shared glass components, global styles or Razinflix files are modified.

## Validation

`node --test tests/places-*.test.mjs` covers the new collection model, complete place coverage, conservative refinements, event expiry, geometry/focus wiring and the pre-existing data/calendar regressions. Targeted ESLint and a production build validate the TypeScript components. Browser acceptance includes parent/refinement marker counts, left-edge geometry, photo navigation, saved places, exhibitions, drawer focus/dismissal, map gestures, responsive breakpoints and reduced motion.

Release checks on 28 September: 40 Node tests passed; 19 browser checks passed without page errors or failed network requests. Desktop geometry was checked at 1440, 1024 and 901px. Mobile checks covered 390×844 and 320×568, including focus trapping, dismissal, breakpoint transitions, map dragging/zooming and the sixth navigation row remaining above the footer at 390×844. Actual map tiles and gallery images were allowed to finish loading before visual inspection. Small navigation labels also have a 4.5:1 minimum contrast regression check against sidebar, white and selected-row backgrounds.
