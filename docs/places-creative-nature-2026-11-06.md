# Screenshot places — verified 6 November 2026

The two supplied tables name eleven experiences. They are represented by thirteen locations because Tashkeel and Tufting Time each have two relevant branches. Nine pins are new; Al Zorah, Oo La Lab and both Tashkeel pins already existed and remain unchanged, including their existing events.

## New permanent places

| Place | Location | Official source and practical detail |
| --- | --- | --- |
| Buhais Geology Park | Jebel Buhais, near Filli Roundabout, Sharjah | [Sharjah tourism](https://www.visitsharjah.com/activities/nature-and-wildlife/buhais-geological-park/) confirms geological exhibits, fossil-inspired pods and an outdoor trail, and independently publishes the exact mapped coordinates. The screenshot's rock-age claim is not repeated. |
| Al Thuraya Astronomy Centre | Mushrif Park, Dubai | [Dubai Astronomy Group](https://dubaiastronomy.com/observatory-services/) identifies its observatory here. [Contact the operator](https://dubaiastronomy.com/contact-us/) before travelling: current walk-in access is unconfirmed. Its older branded Setmore page lists all days closed, while current programmes can be at other venues. No old opening time, price or offsite event is advertised at this pin. |
| Le Piaf Dubai | First floor, Emirates Towers Hotel, hotel entrance | [Dubai venue page](https://lepiaf-restaurant.com/dubai/) confirms French dining, live piano, intimate seating and singalongs; [reservations](https://www.sevenrooms.com/reservations/lepiaf). The Dubai-specific source supports the description without borrowing Paris-specific interior claims. |
| VNTG Wine & Cheese Bar Dubai | Ground level, JW Marriott Marquis, Business Bay | [Official venue](https://www.vntg.ae/) confirms wine, cheese, sharing plates and sommelier-selected flights; [reservations](https://www.opentable.com/r/vntg-business-bay). The old bottle-count and fixed three-glass offer are not repeated. |
| Silver Soul | Ivy's Secret Garden, Unit 14, R450, first floor, Al Quoz Industrial Area 4 | [Official studio](https://www.silversoul.ae/) and [booking](https://www.silversoul.ae/booking) describe a guided silver-ring workshop, approximately two hours. The specific unit comes from the matched Maps business record. |
| Pots & Paints Café | First floor, Town Centre Jumeirah | [Official café](https://potsnpaintscafe.com/) and [contact/location](https://potsnpaintscafe.com/pages/contact) confirm painting ready-made ceramics, glazing and kiln firing. Collection is usually after seven days and may take longer during busy periods. This is not a wheel-throwing claim. The old name Ceramic Corner Café remains a searchable alias. |
| Tufting Time — Jumeirah | Ground floor, Town Centre Jumeirah | [Official studio](https://www.tuftingtime.com/) and [bookings](https://www.tuftingtime.com/bookings) identify this branch separately from Festival City. Guided rug-making; confirm the finishing and collection time. |
| Tufting Time — Dubai Festival City | Mezzanine floor, Dubai Festival City Mall, near PAN and IKEA | The same [official studio](https://www.tuftingtime.com/) lists a distinct branch address, phone and directions link. Its separate Google Place ID and coordinates are retained. No guaranteed same-day collection. |
| Resin Art World | Sheikha Noora Tower, first floor, Office 109, Barsha Heights | [Official workshops](https://resinartworld.ae/pages/workshop) and [mosaic workshop](https://resinartworld.ae/products/mosaic-tiles-art-workshop-in-uae) support mosaic coasters/trinket trays and other craft sessions. The Maps shop classification does not negate its documented workshops. |

## Existing matches

- `al-zorah-nature-reserve`: exact existing coordinates and Google Place ID reconfirmed. [Reserve owner](https://www.alzorahcity.com/mangrove-natural-reserve); [guided activity operator](https://www.questforadventure.net/eco-tours). No duplicate pin or promise of unrestricted wetland access.
- `oo-la-lab-d3`: existing perfume workshop pin and 20 November event preserved. [Official Dubai workshops](https://oola-lab.com/collections/dubai-workshops) also list bukhoor; this does not create an undated calendar event.
- `tashkeel-makerspace` and `tashkeel-nad-al-sheba`: [current official contact page](https://tashkeel.org/contact) lists both Alserkal Makerspace Unit 89 and Nad Al Sheba at the intersection of Streets 5 and 20. No relocation or duplicate is introduced.

## Geocoding and implementation

All nine new points were matched through Firecrawl Maps on 6 November 2026. Their exact Google Place IDs are stored in both canonical curation and the runtime catalogue, supporting the existing directions and lazy Google photo flow. `resolution.source` records `firecrawl-maps`; raw display categories are not fabricated into Google API types or operating-status values.

| Stable ID | Latitude, longitude | Google Place ID |
| --- | --- | --- |
| `buhais-geology-park` | 25.019392, 55.796833 | `ChIJD_kmdp2f9T4RDIj_9YuT57o` |
| `al-thuraya-astronomy-centre` | 25.213476, 55.450391 | `ChIJv9lgkmFcXz4RtVw00vrNoYw` |
| `le-piaf-dubai` | 25.2179644, 55.2818976 | `ChIJM2AB2UtDXz4RFLYY2MZK6Cg` |
| `vntg-wine-cheese-bar-dubai` | 25.1855372, 55.2578681 | `ChIJ7XIOJxppXz4RK0Bi4JHRkuo` |
| `silver-soul-al-quoz` | 25.1165788, 55.2402444 | `ChIJDaXGaHxpXz4RRArcA357CAs` |
| `pots-and-paints-cafe` | 25.2150762, 55.2509837 | `ChIJXx1OfY1DXz4RsIyG9pMOk40` |
| `tufting-time-jumeirah` | 25.2150515, 55.2516685 | `ChIJ2d_IbwBDXz4RPkLZrY8-fus` |
| `tufting-time-dubai-festival-city` | 25.2224445, 55.3555006 | `ChIJKQW3u1RdXz4RfHNHinPzhl4` |
| `resin-art-world-barsha-heights` | 25.098493, 55.1762018 | `ChIJ7ZLhG8ppXz4RRuFYI227XSo` |

The runtime catalogue now contains 200 places, 122 curated records and the same 149 stored events. This update adds permanent venues without inventing dated events or repeating screenshot prices. All existing place objects are preserved byte-for-byte. The full generator was not rerun because it would prune unrelated expired records and re-geocode unrelated locations.

The Parks & nature refinement now recognizes literal park names when their primary classification is nature. This lets Buhais appear in the intended menu despite its Maps display category being Education center; cafés merely mentioning a nearby park still do not qualify. Al Thuraya's source-supported Observatory alias makes it available under Stargazing. The five making venues use Creative workshops; both dining venues use Eat & drink.
