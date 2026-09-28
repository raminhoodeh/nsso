"use client";

import { CalendarPlus, ExternalLink, MapPin } from "lucide-react";
import type { DubaiPlace } from "@/data/places-dubai";
import { agendaDateTile, agendaVerifiedDate, type AgendaEntry } from "@/lib/places-agenda";
import { googleCalendarUrl } from "@/lib/places-events";
import styles from "./events-agenda.module.css";

type Props = {
  entries: AgendaEntry[];
  now: number | null;
  onSelectPlace: (place: DubaiPlace) => void;
};

export default function EventsAgenda({ entries, now, onSelectPlace }: Props) {
  if (now === null) return <p className={styles.empty} role="status">Checking the current programme…</p>;
  if (!entries.length) return (
    <div className={styles.empty} role="status">
      <strong>No verified dates in this selection.</strong>
      <p>Try a wider date range or another emirate. Permanent places are still available in the other experiences.</p>
    </div>
  );

  return (
    <section className={styles.agenda} aria-label="Current and upcoming events">
      <p className={styles.notice}>Dubai time · Ongoing programmes first, then upcoming dates. Check the organiser for opening hours, admission and ticket availability.</p>
      <ol className={styles.list}>
        {entries.map(({ place, event }) => {
          const ongoing = Date.parse(event.startsAt) <= now;
          const date = agendaDateTile(event.startsAt);
          const calendarUrl = googleCalendarUrl(event, place);
          return (
            <li key={`${place.id}:${event.id}`}>
              <article className={styles.card} aria-labelledby={`agenda-${event.id}`}>
                <div className={styles.eventHeading}>
                  <div className={styles.dateTile} aria-hidden="true">
                    <span>{date.month}</span><strong>{date.day}</strong><small>{ongoing ? "Started" : "Starts"}</small>
                  </div>
                  <div className={styles.titleBlock}>
                    <span className={`${styles.badge}${ongoing ? ` ${styles.ongoing}` : ""}`}>{ongoing ? "In progress" : "Upcoming"}</span>
                    <h2 id={`agenda-${event.id}`}>{event.title}</h2>
                    <p className={styles.dates}>{event.dateLabel}</p>
                  </div>
                </div>
                <p className={styles.venue}><MapPin size={14} aria-hidden="true" /><span>{place.name} <span className={styles.emirate}>· {place.emirate}</span></span></p>
                <p className={styles.description}>{event.description}</p>
                {event.visitNote && <p className={styles.visitNote}>{event.visitNote}</p>}
                <div className={styles.actions}>
                  <button type="button" onClick={() => onSelectPlace(place)} aria-label={`View ${event.title} at ${place.name} on the map`}><MapPin size={15} aria-hidden="true" />View on map</button>
                  <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Official details for ${event.title} (opens in a new tab)`}>Official details<ExternalLink size={14} aria-hidden="true" /></a>
                  {calendarUrl && <a href={calendarUrl} target="_blank" rel="noopener noreferrer" className={styles.calendar} aria-label={`Add ${event.title} to Google Calendar (opens in a new tab)`}><CalendarPlus size={15} aria-hidden="true" />Add to Google Calendar</a>}
                </div>
                <p className={styles.verified}>Source checked <time dateTime={event.verifiedAt}>{agendaVerifiedDate(event.verifiedAt)}</time>{calendarUrl && <span> · Calendar reminder, not a booking.</span>}</p>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
