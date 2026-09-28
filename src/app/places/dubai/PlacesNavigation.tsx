"use client";

import Link from "next/link";
import {
  ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
  Compass, Heart, Landmark, Leaf, List, LocateFixed, Map as MapIcon,
  MapPin, PanelLeftClose, PanelLeftOpen, Shapes, Shuffle, Sparkles, Trees, UtensilsCrossed, X,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  minimized: boolean;
  onMinimizedChange: (value: boolean) => void;
  onAskDeity: () => void;
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
    compact, open, minimized, onMinimizedChange, onAskDeity, experienceId, subcategoryId, resultsOpen, savedOnly, savedCount,
    count, resultLabel, groupCounts, subcategoryCounts, emirates, emirate, locationMessage,
    onExperience, onSubcategory, onBack, onResults, onSaved, onEmirate, onClose,
    onMap, onSurprise, onLocate, onReset, children,
    datePlan, agendaWindow, onAgendaWindow, onDatePlan,
  } = props;
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const minimizeRef = useRef<HTMLButtonElement>(null);
  const minimizeRequested = useRef(false);
  const [experiencesExpanded, setExperiencesExpanded] = useState(true);
  const [categoriesExpanded, setCategoriesExpanded] = useState(true);
  const [plansExpanded, setPlansExpanded] = useState(true);
  const experience = EXPERIENCES.find(item => item.id === experienceId);
  const subcategory = experience?.subcategories.find(item => item.id === subcategoryId);
  const title = savedOnly ? "Saved places" : datePlan?.title || subcategory?.label || experience?.label || (resultsOpen ? "All places" : "Let's go somewhere.");
  const key = `${experienceId}:${subcategoryId}:${resultsOpen}:${savedOnly}:${datePlan?.id}`;
  const lastKey = useRef(key);
  const drawerOpen = compact && open;
  const desktopMinimized = !compact && minimized;

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
    if (lastKey.current !== key && (!compact || open) && !desktopMinimized) {
      headingRef.current?.focus({ preventScroll: true });
      scrollRef.current?.scrollTo({ top: 0 });
    }
    lastKey.current = key;
  }, [key, compact, open, desktopMinimized]);

  useEffect(() => {
    if (minimizeRequested.current && !compact) {
      minimizeRef.current?.focus({ preventScroll: true });
      minimizeRequested.current = false;
    }
  }, [minimized, compact]);

  const toggleMinimized = () => {
    minimizeRequested.current = true;
    onMinimizedChange(!minimized);
  };

  const expandToExperience = (id: ExperienceId) => {
    onMinimizedChange(false);
    onExperience(id);
  };

  return (
    <>
      {drawerOpen && <button className={styles.scrim} type="button" tabIndex={-1} aria-label="Dismiss navigation" onClick={onClose} />}
      <aside
        ref={panelRef}
        id="places-mobile-panel"
        className={`${styles.sidebar}${drawerOpen ? ` ${styles.open}` : ""}${desktopMinimized ? ` ${styles.minimized}` : ""}`}
        role={compact ? "dialog" : undefined}
        aria-modal={drawerOpen || undefined}
        aria-label="Explore the UAE"
        aria-hidden={compact && !open ? true : undefined}
        inert={compact && !open}
      >
        <div className={styles.topBar}>
          <Link href="/" className={styles.brand} aria-label="Back to nsso.me">
            <span className={styles.brandMark}>n.</span><span className={styles.brandName}>nsso <span className={styles.brandDivider}>/</span> places</span>
          </Link>
          <button ref={minimizeRef} type="button" className={styles.minimize} aria-label={desktopMinimized ? "Expand navigation" : "Minimize navigation"} title={desktopMinimized ? "Expand navigation" : "Minimize navigation"} aria-expanded={!desktopMinimized} aria-controls="places-navigation-content" onClick={toggleMinimized}>
            {desktopMinimized ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
          <button ref={closeRef} type="button" className={styles.close} aria-label="Close navigation and return to map" onClick={onClose}><X size={20} /></button>
        </div>

        {desktopMinimized && <nav className={styles.rail} aria-label="Quick place categories">
          {EXPERIENCES.map(item => {
            const Icon = ICONS[item.id];
            return <button type="button" key={item.id} className={styles.railAction} aria-label={item.label} title={item.label} aria-pressed={experienceId === item.id && !savedOnly} disabled={!groupCounts[item.id]} onClick={() => expandToExperience(item.id)} style={{ "--experience-color": item.color } as CSSProperties}><Icon size={21} strokeWidth={1.8} /></button>;
          })}
          <span className={styles.railDivider} aria-hidden="true" />
          <button type="button" className={styles.railAction} aria-label="Ask Deity to plan a day" title="Plan with Deity" onClick={onAskDeity}><Sparkles size={20} /></button>
          <button type="button" className={styles.railAction} aria-label={`Saved places, ${savedCount} saved`} title="Saved places" aria-pressed={savedOnly} onClick={() => { onMinimizedChange(false); onSaved(); }}><Heart size={20} fill={savedOnly ? "currentColor" : "none"} /></button>
          <button type="button" className={styles.railAction} aria-label="Show matching places on map" title="Fit map" onClick={onMap}><MapIcon size={20} /></button>
        </nav>}

        <div id="places-navigation-content" className={styles.fullContent} hidden={desktopMinimized}>
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
              <section aria-label="Choose an experience">
                <h2 className={styles.sectionHeading}><button type="button" className={styles.sectionToggle} aria-expanded={experiencesExpanded} aria-controls="places-experience-options" onClick={() => setExperiencesExpanded(value => !value)}><span>Experiences</span><ChevronDown size={17} aria-hidden="true" /></button></h2>
                <nav id="places-experience-options" aria-label="Experiences" className={styles.group} hidden={!experiencesExpanded}>
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
              </section>
            ) : (
              <>
                <div className={styles.collectionSummary} style={{ "--experience-color": experience.color } as CSSProperties}>
                  <span className={styles.collectionIcon}>{(() => { const Icon = ICONS[experience.id]; return <Icon size={25} strokeWidth={1.7} />; })()}</span>
                  <div><strong>{resultLabel}</strong><span>Already showing on your map</span></div>
                </div>
                <h2 className={styles.sectionHeading}><button type="button" className={styles.sectionToggle} aria-expanded={categoriesExpanded} aria-controls="places-category-options" onClick={() => setCategoriesExpanded(value => !value)}><span>Make it your kind of day</span><ChevronDown size={17} aria-hidden="true" /></button></h2>
                <nav id="places-category-options" aria-label={`${experience.label} categories`} className={styles.group} hidden={!categoriesExpanded}>
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
            {!experience && <section className={styles.plans} aria-label="Date ideas"><h2 className={styles.sectionHeading}><button type="button" className={styles.sectionToggle} aria-expanded={plansExpanded} aria-controls="places-date-ideas" onClick={() => setPlansExpanded(value => !value)}><span>Make a day of it</span><ChevronDown size={17} aria-hidden="true" /></button></h2><div id="places-date-ideas" hidden={!plansExpanded}><p className={styles.plansDescription}>Thoughtful pairings, ready to explore.</p><div className={styles.group}>{datePlans.filter(plan => emirate === "all" || plan.area.includes(emirate)).map(plan => <button type="button" className={styles.planRow} key={plan.id} onClick={() => onDatePlan(plan.id)}><Compass size={19} aria-hidden="true" /><span className={styles.rowCopy}><strong>{plan.title}</strong><small>{plan.area}</small></span><ChevronRight size={15} aria-hidden="true" /></button>)}</div></div></section>}
          </div>
        )}

        <footer className={styles.footer}>
          {locationMessage && <p className={styles.status} role="status">{locationMessage}</p>}
          <div className={styles.primaryActions}>
            <button type="button" className={styles.deityAction} aria-label="Ask Deity to plan a day" onClick={onAskDeity}><Sparkles size={17} /><span>Plan with Deity</span><ArrowUpRight size={15} /></button>
            {!resultsOpen && <button type="button" className={styles.viewPlaces} onClick={onResults}><List size={17} />View {resultLabel}<ChevronRight size={15} /></button>}
            <button type="button" className={styles.mapAction} onClick={onMap} aria-label="Show matching places on map"><MapIcon size={17} /><span>{compact ? "Show map" : "Fit map"}</span><ArrowUpRight size={14} /></button>
          </div>
          <div className={styles.utilities}>
            <button type="button" onClick={onSurprise} disabled={!count}><Shuffle size={16} />Surprise us</button>
            <span aria-hidden="true" />
            <button type="button" onClick={onLocate}><LocateFixed size={16} />Near me</button>
          </div>
        </footer>
        </div>
      </aside>
    </>
  );
}
