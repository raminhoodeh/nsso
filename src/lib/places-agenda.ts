import type { DubaiEvent, DubaiPlace } from "../data/places-dubai";
import { activeEventsFor } from "./places-events";
import { matchesExperience } from "./places-experiences";

export type AgendaWindow = "all" | "this-week" | "this-month";
export type AgendaEntry = { place: DubaiPlace; event: DubaiEvent };

const dubaiDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit",
});

function dubaiCalendarParts(timestamp: number) {
  const parts = dubaiDate.formatToParts(timestamp);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

/** Dubai has no daylight-saving clock changes: its calendar midnight is UTC−4h. */
function windowEnd(now: number, window: AgendaWindow) {
  if (window === "all") return Infinity;
  const { year, month, day } = dubaiCalendarParts(now);
  return (window === "this-week"
    ? Date.UTC(year, month - 1, day + 7)
    : Date.UTC(year, month, 1)) - 4 * 60 * 60 * 1000;
}

/**
 * One row per active event (not per venue). Reuses the canonical event freshness,
 * cancellation and taxonomy rules. "This week" means today plus the following
 * six Dubai calendar dates; "this month" includes still-running programmes.
 * Neither window implies that the venue is open or tickets remain available.
 */
export function agendaEntries(
  places: DubaiPlace[],
  now: number | null,
  subcategoryId?: string | null,
  window: AgendaWindow = "all",
): AgendaEntry[] {
  if (now === null || !Number.isFinite(now) || !["all", "this-week", "this-month"].includes(window)) return [];
  const end = windowEnd(now, window);
  return places.flatMap(place => activeEventsFor(place, now)
    .filter(event => Number.isFinite(Date.parse(event.startsAt))
      && Date.parse(event.startsAt) < Date.parse(event.endsAt)
      && Date.parse(event.startsAt) < end
      && matchesExperience(place, [event], "whats-on", subcategoryId))
    .map(event => ({ place, event })))
    .sort((a, b) => {
      const aStart = Date.parse(a.event.startsAt);
      const bStart = Date.parse(b.event.startsAt);
      const ongoingDifference = Number(bStart <= now) - Number(aStart <= now);
      return ongoingDifference || aStart - bStart || a.event.id.localeCompare(b.event.id);
    });
}

/** Consistent source-check labels, including when rendered outside the UAE. */
export function agendaVerifiedDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric",
  }).format(timestamp);
}

export function agendaDateTile(value: string): { day: string; month: string } {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return { day: "—", month: "Date" };
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai", ...options,
  }).format(timestamp);
  return { day: format({ day: "numeric" }), month: format({ month: "short" }) };
}
