"use client";

import {
  CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Compass, Landmark,
  Leaf, List, Map as MapIcon, Shapes, SlidersHorizontal, Trees, UtensilsCrossed,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type CSSProperties } from "react";
import { EXPERIENCES } from "@/lib/places-experiences";
import { datePlans } from "@/lib/places-editorial";
import type { AgendaWindow } from "@/lib/places-agenda";
import type PlacesNavigation from "./PlacesNavigation";
import MobileSheet from "./MobileSheet";
import PlaceSearch from "./PlaceSearch";
import styles from "./mobile-navigation.module.css";

type Props = ComponentProps<typeof PlacesNavigation> & {
  snap: "half" | "full";
  onSnapChange: (snap: "half" | "full") => void;
};
const ICONS = {
  "eat-drink": UtensilsCrossed, "arts-culture": Landmark, outdoors: Trees,
  activities: Shapes, unwind: Leaf, "whats-on": CalendarDays,
};
const WINDOWS: Record<AgendaWindow, string> = { all: "All upcoming dates", "this-week": "Next 7 days", "this-month": "This month" };

export default function MobilePlacesNavigation(props: Props) {
  const {
    open, snap, onSnapChange, experienceId, subcategoryId, resultsOpen, savedOnly,
    count, resultLabel, groupCounts, subcategoryCounts, searchQuery, onSearchChange,
    datePlan, agendaWindow, onAgendaWindow, onDatePlan, onExperience, onSubcategory,
    onBack, onResults, onClose, onMap, onReset, children,
  } = props;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const searching = searchQuery.trim().length > 0;
  useEffect(() => {
    if (!open || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const sheet = sheetRef.current;
    const syncKeyboard = () => {
      if (!sheet) return;
      sheet.dataset.keyboardOpen = String(window.innerHeight - viewport.height > 120);
      sheet.style.setProperty("--search-viewport-height", `${viewport.height}px`);
      sheet.style.setProperty("--search-viewport-top", `${viewport.offsetTop}px`);
    };
    syncKeyboard();
    viewport.addEventListener("resize", syncKeyboard);
    viewport.addEventListener("scroll", syncKeyboard);
    return () => {
      viewport.removeEventListener("resize", syncKeyboard);
      viewport.removeEventListener("scroll", syncKeyboard);
      if (sheet) { delete sheet.dataset.keyboardOpen; sheet.style.removeProperty("--search-viewport-height"); sheet.style.removeProperty("--search-viewport-top"); }
    };
  }, [open]);
  useEffect(() => {
    // Short landscape screens need the available height for readable choices.
    // Explicit minimize/close controls still return to the map.
    if (open && window.matchMedia("(max-height: 500px)").matches) onSnapChange("full");
  }, [open, onSnapChange]);
  const experience = EXPERIENCES.find(item => item.id === experienceId);
  const subcategory = experience?.subcategories.find(item => item.id === subcategoryId);
  const title = searching ? "Search places" : savedOnly ? "Saved places" : datePlan?.title || subcategory?.label || experience?.label || "Explore the UAE";
  const applicablePlans = datePlans;
  const nested = !!experience || resultsOpen || savedOnly || !!datePlan;

  return <MobileSheet
    ref={sheetRef}
    className={styles.navigationSheet}
    id="places-mobile-panel"
    ariaLabel="Explore the UAE"
    title={title}
    open={open}
    snap={snap}
    onSnapChange={value => value === "peek" ? onClose() : onSnapChange(value)}
    onClose={onClose}
    initialFocusRef={searchRef}
    scrollContent={false}
    footer={<button type="button" className={styles.showMap} onClick={onMap} disabled={!count} aria-label={`Show ${resultLabel} on map`}><MapIcon size={18} /><span>Show {resultLabel} on map</span><ChevronRight size={17} /></button>}
  >
    <div className={styles.controls}>
      <div className={styles.searchRow}><PlaceSearch inputRef={searchRef} query={searchQuery} onChange={onSearchChange} onFocus={() => onSnapChange("full")} /></div>
      {searching && <p className={styles.searchCount} role="status" aria-live="polite" aria-atomic="true">{resultLabel} found · all UAE places</p>}
      {!searching && <div className={styles.toolbar}>
        {nested && <button type="button" className={styles.back} onClick={onBack} aria-label={resultsOpen && experience && !savedOnly ? "Back to categories" : "All experiences"}><ChevronLeft size={17} /><span>{resultsOpen && experience && !savedOnly ? "Categories" : "Explore"}</span></button>}
        <div className={styles.viewToggle} role="group" aria-label="Browse view">
          <button type="button" aria-pressed={!resultsOpen} onClick={() => { setSettingsOpen(false); if (resultsOpen) onBack(); }}>Categories</button>
          <button type="button" aria-pressed={resultsOpen} onClick={() => { setSettingsOpen(false); onResults(); }}><List size={14} />List</button>
        </div>
      </div>}
      {!searching && experienceId === "whats-on" && <><button type="button" className={styles.filters} aria-expanded={settingsOpen} aria-controls="places-mobile-filter-menu" onClick={() => setSettingsOpen(value => !value)}>
        <SlidersHorizontal size={15} aria-hidden="true" /><span>{WINDOWS[agendaWindow]}</span><ChevronDown size={15} aria-hidden="true" />
      </button>
      <div id="places-mobile-filter-menu" className={styles.filterMenu} hidden={!settingsOpen}>
        {experienceId === "whats-on" && <label><span><CalendarDays size={14} />When</span><select aria-label="Event date window" value={agendaWindow} onChange={event => onAgendaWindow(event.target.value as AgendaWindow)}>{Object.entries(WINDOWS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      </div></>}
    </div>

    {resultsOpen ? <div className={styles.results}>{children}</div> : <div className={styles.menu}>
      {!experience ? <>
        <nav className={`${styles.group} ${styles.experienceGroup}`} aria-label="Experiences">
          {EXPERIENCES.map(item => {
            const Icon = ICONS[item.id];
            const total = groupCounts[item.id] || 0;
            return <button key={item.id} type="button" className={styles.row} disabled={!total} onClick={() => { setSettingsOpen(false); onExperience(item.id); }} style={{ "--category-color": item.color } as CSSProperties}>
              <span className={styles.icon}><Icon size={19} /></span><strong>{item.label}</strong><span className={styles.count}>{total}</span><ChevronRight size={15} aria-hidden="true" />
            </button>;
          })}
        </nav>
        <section className={styles.plans} aria-label="Date ideas">
          <button type="button" className={styles.plansToggle} aria-expanded={plansOpen} aria-controls="places-mobile-date-ideas" onClick={() => setPlansOpen(value => !value)}><Compass size={18} /><span>Date ideas</span><small>{applicablePlans.length}</small><ChevronDown size={16} /></button>
          <div id="places-mobile-date-ideas" className={styles.group} hidden={!plansOpen}>
            {applicablePlans.map(plan => <button key={plan.id} type="button" className={styles.planRow} onClick={() => onDatePlan(plan.id)}><span><strong>{plan.title}</strong><small>{plan.area}</small></span><ChevronRight size={15} /></button>)}
            {!applicablePlans.length && <p className={styles.note}>No curated day plans here yet. Explore a category to make your own.</p>}
          </div>
        </section>
      </> : <>
        <nav className={styles.group} aria-label={`${experience.label} categories`}>
          <button type="button" className={styles.row} aria-pressed={!subcategoryId} onClick={() => onSubcategory(null)}><strong>Explore all</strong><span className={styles.count}>{groupCounts[experience.id] || 0}</span>{!subcategoryId ? <Check size={18} /> : <ChevronRight size={15} />}</button>
          {experience.subcategories.map(item => {
            const total = subcategoryCounts[item.id] || 0;
            return <button key={item.id} type="button" className={styles.row} disabled={!total} aria-pressed={subcategoryId === item.id} onClick={() => onSubcategory(item.id)}><strong>{item.label}</strong><span className={styles.count}>{total}</span>{subcategoryId === item.id ? <Check size={18} /> : <ChevronRight size={15} />}</button>;
          })}
        </nav>
        {experienceId === "whats-on" && <p className={styles.note}>Current and upcoming dates. Confirm details with the organiser.</p>}
      </>}
      {!count && <div className={styles.empty}><p>No matches in this selection.</p><button type="button" onClick={onReset}>Explore all of the UAE</button></div>}
    </div>}
  </MobileSheet>;
}
