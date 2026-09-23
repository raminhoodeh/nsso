import type { DubaiEvent, DubaiPlace } from "../data/places-dubai";

export function activeEventsFor(place: DubaiPlace, now: number | null): DubaiEvent[] {
  if (now === null) return [];
  return (place.events || [])
    .filter((event) => event.status === "scheduled"
      && Date.parse(event.endsAt) > now && Date.parse(event.verifiedUntil) > now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function exhibitionEntries(places: DubaiPlace[], now: number | null, query = "") {
  const search = query.trim().toLowerCase();
  return places.flatMap((place) => activeEventsFor(place, now)
    .filter((event) => event.taxonomyTags.includes("art-exhibitions"))
    .filter((event) => !search || [place.name, place.address, ...place.aliases,
      event.title, event.description, event.dateLabel, event.visitNote || ""]
      .join(" ").toLowerCase().includes(search))
    .map((event) => ({ place, event })))
    .sort((a, b) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt));
}

export function eventCalendarDescription(event: DubaiEvent, place: DubaiPlace) {
  return [event.description, event.dateLabel, event.visitNote,
    "All-day date reminder, not a booking. Check the organiser's latest opening times and admission before travelling.",
    `Venue: ${place.name}. ${place.address}`,
    `Official information: ${event.sourceUrl}`,
    event.bookingUrl ? `Tickets / programme: ${event.bookingUrl}` : null,
    "NSSO map: https://www.nsso.me/places/dubai"].filter(Boolean).join("\n\n");
}

export function googleCalendarUrl(event: DubaiEvent, place: DubaiPlace) {
  if (!event.calendar) return null;
  const dates = [event.calendar.startDate, event.calendar.endDateExclusive].map((date) => date.replaceAll("-", "")).join("/");
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: "TEMPLATE", text: event.title, dates, ctz: "Asia/Dubai",
    details: eventCalendarDescription(event, place), location: `${place.name}, ${place.address}`,
  })}`;
}

function escapeIcs(value: string) {
  return value.replaceAll("\\", "\\\\").replace(/\r?\n/g, "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

// RFC 5545 limits physical lines to 75 UTF-8 octets, not 75 characters.
function foldIcs(line: string) {
  const lines: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const size = new TextEncoder().encode(character).length;
    if (bytes + size > 75) { lines.push(current); current = " "; bytes = 1; }
    current += character;
    bytes += size;
  }
  return [...lines, current].join("\r\n");
}

export function exhibitionsCalendar(places: DubaiPlace[], now: number) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NSSO//Dubai Art Exhibitions//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:NSSO Art Exhibitions", "X-WR-TIMEZONE:Asia/Dubai"];
  for (const {place, event} of exhibitionEntries(places, now)) {
    if (!event.calendar) continue;
    lines.push("BEGIN:VEVENT", `UID:${event.id}@nsso.me`,
      `DTSTAMP:${new Date(event.verifiedAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `DTSTART;VALUE=DATE:${event.calendar.startDate.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${event.calendar.endDateExclusive.replaceAll("-", "")}`,
      `SUMMARY:${escapeIcs(event.title)}`, `DESCRIPTION:${escapeIcs(eventCalendarDescription(event, place))}`,
      `LOCATION:${escapeIcs(`${place.name}, ${place.address}`)}`, `URL:${event.sourceUrl}`, "TRANSP:TRANSPARENT", "STATUS:CONFIRMED");
    for (const days of [7, 1]) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeIcs(event.title)} — check tickets and plan your visit`, `TRIGGER:-P${days}D`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcs).join("\r\n") + "\r\n";
}
