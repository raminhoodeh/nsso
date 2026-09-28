# Deity for Places

The `/places/dubai` explorer has a page-specific version of NSSO Deity. It reuses
Deity's brand assets and server-side Gemini provider/key, with a separate public,
read-only context instead of the account assistant's profile tools.

## Experience

- The desktop navigation is pinned at 460px and minimizes to a 72px icon rail.
  The width preference is saved locally; filters and disclosure state survive
  minimizing. Mobile uses a map-first layout with one Explore / Saved / Deity
  bottom bar. Explore and Saved open resizable bottom sheets; category choices
  stay open until the visitor taps Show places on map. Area and date controls
  are tucked into a disclosure rather than crowding the map.
- Deity knows the selected place, current filtered IDs and locally saved IDs.
  The server validates those IDs and supplies the complete public catalog,
  researched visit guides, curated date ideas and currently verified events.
- Recommendation and itinerary cards resolve to canonical map records. Selecting
  one reveals its pin and detail panel without clearing the visitor's filters.
  A recommended place outside the collection gets an additional selected pin.
- Chat can be minimized/closed and resumed without losing messages or draft.
  Conversation state lives in component memory, not browser storage or a profile.
  Messages and context are sent to the server/model when the user asks a question.
- Mobile chat is a focus-contained dialog, with an isolated background, safe-area
  padding, 44px controls and Visual Viewport sizing for the software keyboard.
  The Places assistant uses the same opaque light palette as the explorer,
  with readable body text and generously spaced cards. Map context expands on
  demand, and the composer grows from one line up to a bounded height. New answers
  open at their beginning; returning from the map restores the reading position.
  A single Map button returns to an interactive preview; recommended place
  previews include Back to conversation. Itinerary stops keep their canonical
  event dates visible while longer descriptions are expandable.
- Mobile place sheets start with a compact preview and persistent Directions / Save
  actions. Photos, visit guides and events are available on expansion. Full sheets
  isolate the map and contain focus; smaller sheets leave the map interactive.
  Only the sheet handle resizes the panel, so scrolling content does not drag it.
- Mobile pins cluster by screen-space proximity, keeping the selected place
  separate. Cluster taps zoom into the group. Photos are requested at a smaller
  mobile size only after a place is selected; desktop marker and sidebar behavior
  stays unchanged.

## Backend and configuration

`POST /api/deity/places` uses `GOOGLE_GENERATIVE_AI_API_KEY`, already used by NSSO
Deity. Optional `DEITY_PLACES_MODEL` defaults to `gemini-2.5-flash` and
`DEITY_PLACES_TIMEOUT_MS` defaults to 22000 (bounded to 1000–25000ms). Neither the
provider key nor private profile context is exposed to the client.

The endpoint accepts the shared contract in `src/lib/deity/places-types.ts` and
returns structured, validated JSON. It does not call Supabase, change profiles,
book tickets, access calendars or execute model-provided actions. Output is
rendered as React text, never model-provided HTML or URLs.

Unavailable/season-unconfirmed venues, non-fixed locations, expired/stale events,
cancelled/sold-out events and unknown IDs are not valid recommendation stops.
Event-backed suggestions require a valid event at that venue; itinerary dates
must overlap those event dates. Suggested times are never live opening hours.
Prices, travel times, booking availability and access conditions are not live
checked. The UI retains explicit verification reminders.

Requests are limited to 64KiB, 2000-character messages and 12 bounded history
items. Client history also has a byte budget. Same-origin browser checks and
per-instance limits (8 requests/minute, 40/hour/address, four concurrent calls)
reduce accidental/spam load; these are not a distributed WAF or billing cap.
Provider errors are redacted, and unsuccessful requests can be retried manually.

## Verification

```sh
node --test tests/places-*.test.mjs tests/mobile-deity-overlay.test.js
npm run build
```

Backend tests use a deterministic fake provider, never live API calls. Before
release, separately verify a real provider response and desktop/mobile browser
flows: menu minimize/reopen, sheet resizing on narrow and landscape screens,
map clusters, saved filters, chat context, linked itinerary stops,
error/retry/cancel, Escape/focus and mobile keyboard-height layout. Global Deity
and film-page UI are intentionally unchanged.
