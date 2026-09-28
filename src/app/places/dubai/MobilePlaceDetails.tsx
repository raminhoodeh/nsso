"use client";
/* eslint-disable @next/next/no-img-element -- Transient Google Places photos, kept in memory only. */
import { ArrowUpRight, ChevronLeft, ChevronRight, Heart, Image as ImageIcon, MessageCircle } from "lucide-react";
import type { DubaiEvent, DubaiPlace } from "@/data/places-dubai";
import { placeClosureNotice } from "@/lib/places-business-status";
import { googleCalendarUrl } from "@/lib/places-events";
import { visitGuideFor } from "@/lib/places-editorial";
import MobileSheet from "./MobileSheet";
import PlaceVisitGuide from "./PlaceVisitGuide";
import styles from "./mobile-places.module.css";

type Photo = { url: string; credits: { displayName: string; uri: string | null }[]; googleMapsUri: string | null; flagContentUri: string | null };
type Props = {
  place: DubaiPlace; places: DubaiPlace[]; events: DubaiEvent[]; categoryLabel: string;
  snap: "peek" | "half" | "full"; onSnapChange: (snap: "peek" | "half" | "full") => void;
  onClose: () => void; saved: boolean; onSave: () => void; directions: string;
  photo: Photo | null; photoIndex: number; photoCount: number; photoUnavailable: boolean; loading: boolean;
  onPhotoError: () => void; onPhotoMove: (direction: -1 | 1) => void; onGallery: () => void;
  mapsUri: string; address: string; dataAttributions: { provider: string; uri: string | null }[];
  fromDeity: boolean; onBackToDeity: () => void; outsideFilters: boolean; onPair: (id: string) => void;
};

export default function MobilePlaceDetails(props: Props) {
  const { place, snap, photo } = props;
  const expanded = snap !== "peek";
  const closure = placeClosureNotice(place);
  return <MobileSheet open snap={snap} onSnapChange={props.onSnapChange} onClose={props.onClose}
    title="Place details" ariaLabel={`Details for ${place.name}`} className={styles.placeSheet}
    footer={<div className={styles.placeActions}>
      <a href={props.directions} target="_blank" rel="noreferrer"><ArrowUpRight size={17} /> Directions</a>
      <button type="button" onClick={props.onSave} aria-label={props.saved ? "Remove from saved places" : "Save this place"} aria-pressed={props.saved}>
        <Heart size={17} fill={props.saved ? "currentColor" : "none"} />{props.saved ? "Saved" : "Save"}
      </button>
    </div>}>
    <div className={styles.placePreview}>
      <button className={styles.thumbnail} type="button" onClick={() => props.onSnapChange(expanded ? "full" : "half")} aria-label={`Expand details for ${place.name}`}>
        {photo && !props.photoUnavailable ? <img src={`/api/places/photo?url=${encodeURIComponent(photo.url)}`} alt="" onError={props.onPhotoError} /> : <ImageIcon size={23} aria-hidden="true" />}
      </button>
      <div><p className={styles.eyebrow}>{props.categoryLabel} · {place.emirate}</p><h2>{place.name}</h2>
        {props.events[0] && <p className={styles.eventDate}>{props.events[0].dateLabel} · {props.events[0].title}</p>}
        {closure && <p className={styles.closure}>{closure.label} · Confirm before travelling</p>}
      </div>
    </div>
    {props.fromDeity && <button type="button" className={styles.backToChat} onClick={props.onBackToDeity}><MessageCircle size={15} /> Back to conversation</button>}
    {props.outsideFilters && <p className={styles.notice}>This place is outside your filters. Your collection is unchanged.</p>}
    {photo && !props.photoUnavailable && <p className={styles.photoCredit}>Photo: {photo.credits.map((credit, index) => <span key={index}>{index > 0 ? ", " : ""}{credit.uri ? <a href={credit.uri} target="_blank" rel="noreferrer">{credit.displayName}</a> : credit.displayName}</span>)} · <a href={photo.googleMapsUri || props.mapsUri} target="_blank" rel="noreferrer">Google Maps</a></p>}
    {expanded && <div className={styles.expandedPlace}>
      {photo && !props.photoUnavailable ? <div className={styles.photos}>
        <button type="button" onClick={props.onGallery} aria-label={`Open full-screen photos of ${place.name}`}><img src={`/api/places/photo?url=${encodeURIComponent(photo.url)}`} alt={`${place.name}, photo ${props.photoIndex + 1}`} onError={props.onPhotoError} /><span>{props.photoIndex + 1} / {props.photoCount} · View photos</span></button>
        {props.photoCount > 1 && <div className={styles.photoNavigation}><button type="button" aria-label="Previous place photo" onClick={() => props.onPhotoMove(-1)}><ChevronLeft size={20} /></button><button type="button" aria-label="Next place photo" onClick={() => props.onPhotoMove(1)}><ChevronRight size={20} /></button></div>}
      </div> : <p className={styles.notice}>{props.loading ? "Photos are loading…" : "Photos unavailable. You can still explore this place."}</p>}
      <p className={styles.description}>{place.description}</p>
      <p className={styles.address}>{props.address}</p>
      {closure && <p className={styles.closure}>{closure.note || `${closure.sourceLabel}${closure.checkedDate ? ` checked ${closure.checkedDate}` : ""}. Check with the venue before going.`}</p>}
      {visitGuideFor(place.id) && <details className={styles.accordion}><summary>Plan your visit</summary><PlaceVisitGuide place={place} places={props.places} onPair={place => props.onPair(place.id)} /></details>}
      {!!props.events.length && <details className={styles.accordion}><summary>What’s on · {props.events.length}</summary>{props.events.map(event => <article key={event.id} className={styles.eventItem}><p className={styles.eventDate}>{event.dateLabel}</p><h3>{event.title}</h3><p>{event.description}</p>{event.visitNote && <p>{event.visitNote}</p>}<a href={event.bookingUrl || event.sourceUrl} target="_blank" rel="noreferrer">Event details & booking <ArrowUpRight size={14} /></a>{event.calendar && <a href={googleCalendarUrl(event, place)!} target="_blank" rel="noreferrer">Add to Google Calendar</a>}</article>)}</details>}
      <details className={styles.accordion}><summary>More links & credits</summary>
        <a href={props.mapsUri} target="_blank" rel="noreferrer">View on Google Maps <ArrowUpRight size={14} /></a>
        {place.sourceUrls[0] && <a href={place.sourceUrls[0]} target="_blank" rel="noreferrer">Original place link <ArrowUpRight size={14} /></a>}
        {photo?.flagContentUri && <a href={photo.flagContentUri} target="_blank" rel="noreferrer">Report photo</a>}
        {props.dataAttributions.map((credit, index) => <p key={index}>Place data: {credit.uri ? <a href={credit.uri} target="_blank" rel="noreferrer">{credit.provider}</a> : credit.provider}</p>)}
      </details>
    </div>}
  </MobileSheet>;
}
