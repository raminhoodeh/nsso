"use client";

import Link from "next/link";
import {
  ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
  Compass, Heart, Landmark, Leaf, List, LocateFixed, Map as MapIcon,
  MapPin, Shapes, Shuffle, Trees, UtensilsCrossed, X,
} from "lucide-react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { EXPERIENCES, type ExperienceId } from "@/lib/places-experiences";
import { datePlans, type DatePlan } from "@/lib/places-editorial";
import type { AgendaWindow } from "@/lib/places-agenda";
import { useTahoeModalAccessibility } from "@/components/ui/tahoe-glass";
import styles from "./navigation.module.css";

const ICONS = {
  "eat-drink": UtensilsCrossed,
  "arts-culture": Landmark,
  outdoors: Trees,
  activities: Shapes,
  unwind: Leaf,
  "whats-on": CalendarDays,
};

type Props = {
  compact: boolean;
  open: boolean;
  experienceId: ExperienceId | null;
  subcategoryId: string | null;
  resultsOpen: boolean;
  savedOnly: boolean;
  savedCount: number;
  count: number;
  resultLabel: string;
  groupCounts: Record<string, number>;
  subcategoryCounts: Record<string, number>;
  emirates: string[];
  emirate: string;
  locationMessage: string | null;
  datePlan: DatePlan | null;
  agendaWindow: AgendaWindow;
  onAgendaWindow: (value: AgendaWindow) => void;
  onDatePlan: (id: string) => void;
  onExperience: (id: ExperienceId) => void;
  onSubcategory: (id: string | null) => void;
  onBack: () => void;
  onResults: () => void;
  onSaved: () => void;
  onEmirate: (value: string) => void;
  onClose: () => void;
  onMap: () => void;
  onSurprise: () => void;
  onLocate: () => void;
  onReset: () => void;
  children: ReactNode;
};

export default function PlacesNavigation(props: Props) {
  const {
    compact, open, experienceId, subcategoryId, resultsOpen, savedOnly, savedCount,
    count, resultLabel, groupCounts, subcategoryCounts, emirates, emirate, locationMessage,
    onExperience, onSubcategory, onBack, onResults, onSaved, onEmirate, onClose,
    onMap, onSurprise, onLocate, onReset, children,
    datePlan, agendaWindow, onAgendaWindow, onDatePlan,
  } = props;
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const experience = EXPERIENCES.find(item => item.id === experienceId);
  const subcategory = experience?.subcategories.find(item => item.id === subcategoryId);
  const title = savedOnly ? "Saved places" : datePlan?.title || subcategory?.label || experience?.label || (resultsOpen ? "All places" : "Let's go somewhere.");
  const key = `${experienceId}:${subcategoryId}:${resultsOpen}:${savedOnly}:${datePlan?.id}`;
  const lastKey = useRef(key);
  const drawerOpen = compact && open;

  useTahoeModalAccessibility({
    open: drawerOpen,
    panelRef,
    initialFocusRef: closeRef,
    modal: true,
    closeOnEscape: true,
    restoreFocus: false,
    hideBackground: false,
    onOpenChange: value => { if (!value) onClose(); },
  });

  useEffect(() => {
    if (lastKey.current !== key && (!compact || open)) {
      headingRef.current?.focus({ preventScroll: true });
      scrollRef.current?.scrollTo({ top: 0 });
    }
    lastKey.current = key;
  }, [key, compact, open]);

  return (
    <>
      {drawerOpen && <button className={styles.scrim} type="button" tabIndex={-1} aria-label="Dismiss navigation" onClick={onClose} />}
      <aside
        ref={panelRef}
        id="places-mobile-panel"
        className={`${styles.sidebar}${drawerOpen ? ` ${styles.open}` : ""}`}
        role={compact ? "dialog" : undefined}
        aria-modal={drawerOpen || undefined}
        aria-label="Explore the UAE"
        aria-hidden={compact && !open ? true : undefined}
        inert={compact && !open}
      >
        <div className={styles.topBar}>
          <Link href="/" className={styles.brand} aria-label="Back to nsso.me">
            <span className={styles.brandMark}>n.</span><span>nsso <span className={styles.brandDivider}>/</span> places</span>
          </Link>
          <button ref={closeRef} type="button" className={styles.close} aria-label="Close navigation and return to map" onClick={onClose}><X size={20} /></button>
        </div>

        <div className={styles.areaRow}>
          <label className={styles.area}>
            <MapPin size={16} aria-hidden="true" />
            <select aria-label="Filter by emirate" value={emirate} onChange={event => onEmirate(event.target.value)}>
              <option value="all">Across the UAE</option>
              {emirates.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          <button type="button" className={`${styles.saved}${savedOnly ? ` ${styles.savedActive}` : ""}`} onClick={onSaved} aria-label={`Saved places, ${savedCount} saved`} aria-pressed={savedOnly}>
            <Heart size={17} fill={savedOnly ? "currentColor" : "none"} /><span>{savedCount || "Saved"}</span>
          </button>
        </div>

        {(experience || resultsOpen || savedOnly) && (
          <button type="button" className={styles.back} onClick={onBack}>
            <ChevronLeft size={19} /><span>{resultsOpen && experience && !savedOnly ? "Back to categories" : "All experiences"}</span>
          </button>
        )}

        <header className={`${styles.heading}${experience || resultsOpen || savedOnly ? ` ${styles.headingNested}` : ""}`}>
          {!experience && !resultsOpen && !savedOnly && <p className={styles.eyebrow}>A little time together</p>}
          <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
          <p>{datePlan ? datePlan.area : resultsOpen ? `${resultLabel} · ${emirate === "all" ? "across the UAE" : emirate}` : experience ? (subcategory?.description || experience.description) : "What do you feel like doing?"}</p>
        </header>

        {experienceId === "whats-on" && <label className={styles.when}><CalendarDays size={16} aria-hidden="true" /><span>When</span><select aria-label="Event date window" value={agendaWindow} onChange={event => onAgendaWindow(event.target.value as AgendaWindow)}><option value="all">All upcoming dates</option><option value="this-week">Next 7 days</option><option value="this-month">This month</option></select><ChevronDown size={14} aria-hidden="true" /></label>}

        {resultsOpen ? (
          <div className={styles.results}>{children}</div>
        ) : (
          <div ref={scrollRef} className={styles.scroll}>
            {!experience ? (
              <nav aria-label="Experiences" className={styles.group}>
                {EXPERIENCES.map(item => {
                  const Icon = ICONS[item.id];
                  const total = groupCounts[item.id] || 0;
                  return (
                    <button key={item.id} type="button" className={styles.experienceRow} onClick={() => onExperience(item.id)} disabled={!total} style={{ "--experience-color": item.color } as CSSProperties}>
                      <span className={styles.icon}><Icon size={21} strokeWidth={1.8} /></span>
                      <span className={styles.rowCopy}><strong>{item.label}</strong><small>{item.description}</small></span>
                      <span className={styles.count}>{total}<span className={styles.srOnly}> places</span></span>
                      <ChevronRight size={15} className={styles.chevron} aria-hidden="true" />
                    </button>
                  );
                })}
              </nav>
            ) : (
              <>
                <div className={styles.collectionSummary} style={{ "--experience-color": experience.color } as CSSProperties}>
                  <span className={styles.collectionIcon}>{(() => { const Icon = ICONS[experience.id]; return <Icon size={25} strokeWidth={1.7} />; })()}</span>
                  <div><strong>{resultLabel}</strong><span>Already showing on your map</span></div>
                </div>
                <p className={styles.sectionLabel}>Make it your kind of day</p>
                <nav aria-label={`${experience.label} categories`} className={styles.group}>
                  <button type="button" className={styles.categoryRow} aria-pressed={!subcategoryId} onClick={() => onSubcategory(null)}>
                    <span className={styles.rowCopy}><strong>Explore all</strong><small>The whole collection</small></span>
                    <span className={styles.count}>{groupCounts[experience.id] || 0}</span>
                    {!subcategoryId ? <Check size={17} className={styles.check} /> : <ChevronRight size={15} className={styles.chevron} />}
                  </button>
                  {experience.subcategories.map(item => {
                    const total = subcategoryCounts[item.id] || 0;
                    return (
                      <button key={item.id} type="button" className={styles.categoryRow} aria-pressed={subcategoryId === item.id} disabled={!total} onClick={() => onSubcategory(item.id)}>
                        <span className={styles.rowCopy}><strong>{item.label}</strong><small>{item.description}</small></span>
                        <span className={styles.count}>{total}<span className={styles.srOnly}> places</span></span>
                        {subcategoryId === item.id ? <Check size={17} className={styles.check} /> : <ChevronRight size={15} className={styles.chevron} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </nav>
                {experience.id === "whats-on" && <p className={styles.note}>Current and upcoming dates only. Check the venue's booking details before you go.</p>}
                {!count && <div className={styles.empty}><strong>No matches in this area.</strong><button type="button" onClick={onReset}>Explore all of the UAE</button></div>}
              </>
            )}
            {!experience && <section className={styles.plans} aria-label="Date ideas"><h2>Make a day of it</h2><p>Thoughtful pairings, ready to explore.</p><div className={styles.group}>{datePlans.filter(plan => emirate === "all" || plan.area.includes(emirate)).map(plan => <button type="button" className={styles.planRow} key={plan.id} onClick={() => onDatePlan(plan.id)}><Compass size={19} aria-hidden="true" /><span className={styles.rowCopy}><strong>{plan.title}</strong><small>{plan.area}</small></span><ChevronRight size={15} aria-hidden="true" /></button>)}</div></section>}
          </div>
        )}

        <footer className={styles.footer}>
          {locationMessage && <p className={styles.status} role="status">{locationMessage}</p>}
          <div className={styles.primaryActions}>
            {!resultsOpen && <button type="button" className={styles.viewPlaces} onClick={onResults}><List size={17} />View {resultLabel}<ChevronRight size={15} /></button>}
            <button type="button" className={styles.mapAction} onClick={onMap} aria-label="Show matching places on map"><MapIcon size={17} /><span>{compact ? "Show map" : "Fit map"}</span><ArrowUpRight size={14} /></button>
          </div>
          <div className={styles.utilities}>
            <button type="button" onClick={onSurprise} disabled={!count}><Shuffle size={16} />Surprise us</button>
            <span aria-hidden="true" />
            <button type="button" onClick={onLocate}><LocateFixed size={16} />Near me</button>
          </div>
        </footer>
      </aside>
    </>
  );
}
