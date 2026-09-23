# Art Exhibitions — September 2026 curation

Source: https://www.instagram.com/p/Dcx5OULkf4C/ (@the_nextdubai).
Inspected all seven carousel items from its public captioned embed: cover, five event cards, and a short green closing video with no additional event text.

| Event | Visitor dates | Pin / caveat | Verification |
| --- | --- | --- | --- |
| Dubai Design Week | 3–8 November 2026 | Existing d3 pin; activity hours vary | https://www.dubaidesignweek.ae/programme-2026-volunteer/ |
| Downtown Design | 5–8 November 2026 public days | Existing d3 pin; 4 November is an invitation-only preview | https://www.downtowndesign.com/dubai/visit |
| Art Connects Women | 12–15 November 2026 programme | DIFC area-level pin, not an exact gallery entrance. Public access needs confirmation. Private viewing, conference, cultural tour and off-site Royal Mirage gala are not four days of confirmed public gallery access. | https://www.artconnectswomen.com/program/ and participating artist https://www.heike-berl.de/ |
| World Art Dubai | 19–22 November 2026, 1–9pm daily | Updated to DWTC, Za’abeel Halls 2 & 3; removed from existing Dubai Exhibition Centre pin | https://www.worldartdubai.com/the-fair and September 11 entry at https://www.worldartdubai.com/art-blog-news |
| Quoz Arts Fest | 30–31 January 2027 | Existing Alserkal Avenue pin; hours, tickets and line-up TBA | https://www.visitdubai.com/en/festivals-and-events/dubai-events-calendar/quoz-arts-fest |

World Art Dubai's Instagram card and the Dubai Media Office's August 19 calendar name Dubai Exhibition Centre. The organiser's newer September announcement says it is returning to Dubai World Trade Centre; current fair and visitor pages name Za’abeel Halls 2 & 3. Prefer the newer organiser information and retain the correction prominently in the entry.

New DWTC and DIFC venue coordinates and Place IDs were checked with Google Places on 23 September. The DIFC coordinate is deliberately marked approximate because it identifies the district, not a confirmed event entrance. Existing venues and their favourites IDs are preserved.

## Calendar behaviour

Five separate all-day, non-blocking date reminders with stable UIDs. Multi-day ends are exclusive. Downtown Design starts on its first public day. Art Connects Women is explicitly a save-the-date requiring admission confirmation. ICS includes 7-day and 1-day display reminders; importing services may handle alarms differently. Download is not a Google Calendar sync and does not imply events were saved to the user's account.

Expired, cancelled, sold-out and verification-expired events are omitted at runtime and from the calendar download. Existing unrelated events and place data are unchanged. The new category tags live on events, so permanent venues do not remain in the exhibitions category after their event ends.

## Verification

`node --test tests/places-exhibitions.test.mjs`, scoped ESLint, TypeScript check, production build, desktop/mobile browser checks, and live route/calendar checks.

The initial raster map fit could apply a tighter zoom while retaining an old centre, leaving exhibition pins offscreen. Framing now sets centre and zoom together and reserves desktop sidebar space. Browser checks assert all four venue markers are inside the viewport before testing event cards, search, selection and dismissal at 1440px and 390px widths.
