import { ArrowUpRight, BookOpen, ExternalLink } from "lucide-react";
import type { DubaiPlace } from "@/data/places-dubai";
import { visitGuideFor } from "@/lib/places-editorial";
import styles from "./visit-guide.module.css";

export default function PlaceVisitGuide({ place, places, onPair }: {
  place: DubaiPlace;
  places: DubaiPlace[];
  onPair: (place: DubaiPlace) => void;
}) {
  const guide = visitGuideFor(place.id);
  if (!guide) return null;
  const pairings = guide.pairWithPlaceIds.flatMap(id => places.find(item => item.id === id) || []);
  return <section className={styles.guide} aria-label="Plan your visit">
    <header><BookOpen size={17} aria-hidden="true" /><h3>Make a date of it</h3><span>NSSO idea</span></header>
    <p className={styles.idea}>{guide.dateIdea}</p>
    <dl>{guide.practicalities.map(note => <div key={note.label}><dt>{note.label}</dt><dd>{note.text}</dd></div>)}</dl>
    {pairings.length > 0 && <div className={styles.pairings}><h4>Pair it with</h4>{pairings.map(pair => <button key={pair.id} type="button" onClick={() => onPair(pair)}><span>{pair.name}</span><ArrowUpRight size={16} aria-hidden="true" /></button>)}</div>}
    <details className={styles.sources}><summary>Sources · checked {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" }).format(new Date(`${guide.verifiedAt}T12:00:00+04:00`))}</summary>
      <p>Visit details can change. Confirm hours, access and bookings with the venue. Pairings and date ideas are our editorial suggestions.</p>
      {guide.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={12} /></a>)}
    </details>
  </section>;
}
