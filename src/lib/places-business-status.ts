import type { DubaiPlace } from "@/data/places-dubai";

type PlaceStatus = Pick<DubaiPlace, "resolution" | "visitStatus">;

/** A sourced status snapshot, not a live opening-hours or availability check. */
export function placeClosureNotice(place: PlaceStatus) {
  const status = place.resolution.businessStatus;
  const unconfirmedSeason = place.visitStatus?.kind === "season-unconfirmed";
  const label = status === "CLOSED_TEMPORARILY"
    ? "Reported temporarily closed"
    : status === "CLOSED_PERMANENTLY"
      ? "Reported closed"
      : unconfirmedSeason ? "Seasonal reopening unconfirmed" : null;
  if (!label) return null;

  const googleClosure = status === "CLOSED_TEMPORARILY" || status === "CLOSED_PERMANENTLY";
  const timestamp = Date.parse(googleClosure ? place.resolution.matchedAt : place.visitStatus!.checkedAt);
  const checkedDate = Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai",
      }).format(timestamp)
    : null;

  return {
    label,
    checkedDate,
    sourceLabel: googleClosure ? "Google listing snapshot" : "Official-source check",
    note: !googleClosure && unconfirmedSeason ? place.visitStatus!.note : null,
    sourceUrl: !googleClosure && unconfirmedSeason ? place.visitStatus!.sourceUrl : null,
  };
}

/** Keep closed and unconfirmed seasonal listings browsable, but not random outings. */
export function surpriseCandidates<T extends PlaceStatus & { id: string }>(
  places: readonly T[],
  selectedId: string | null,
): T[] {
  const eligible = places.filter(place => !placeClosureNotice(place));
  const alternatives = eligible.filter(place => place.id !== selectedId);
  return alternatives.length ? alternatives : eligible;
}
