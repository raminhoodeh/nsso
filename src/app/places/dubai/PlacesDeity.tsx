"use client";
/* eslint-disable @next/next/no-img-element -- Reuses the existing Deity brand assets. */

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, ChevronDown, ChevronRight, MapPin, Minus, RotateCcw, Square, X } from "lucide-react";
import type { DubaiPlace } from "@/data/places-dubai";
import type { PlacesChatRecommendation, PlacesChatResponse } from "@/lib/deity/places-types";
import { activeEventsFor } from "@/lib/places-events";
import { placeClosureNotice } from "@/lib/places-business-status";
import { useTahoeModalAccessibility } from "@/components/ui/tahoe-glass";
import styles from "./deity.module.css";

type Message = { role: "user" | "assistant"; content: string; reply?: PlacesChatResponse };
type Props = {
  open: boolean;
  compact: boolean;
  launcherHidden: boolean;
  places: DubaiPlace[];
  selectedPlaceId: string | null;
  filteredPlaceIds: string[];
  savedPlaceIds: string[];
  contextLabel: string;
  onOpenChange: (open: boolean) => void;
  onSelectPlace: (id: string) => void;
};
const PROMPTS = [
  { label: "Plan a relaxed date", detail: "Coffee, art & dinner", message: "Plan a relaxed date from Downtown Dubai with coffee, art and dinner." },
  { label: "Explore what’s on", detail: "Exhibitions & events", message: "Which current exhibitions or events would make a good date?" },
  { label: "Pick from my saved places", detail: "Something a little different", message: "Suggest somewhere unusual from my saved places." },
];

function historyText(message: Message, places: DubaiPlace[]) {
  if (!message.reply) return message.content;
  const picks = [...message.reply.recommendations, ...(message.reply.itinerary?.stops || [])];
  return [message.content, message.reply.itinerary?.title, message.reply.itinerary?.date, ...picks.map(pick =>
    `${places.find(place => place.id === pick.placeId)?.name || pick.placeId}: ${"timeLabel" in pick ? pick.timeLabel : ""} ${pick.reason}`,
  )].filter(Boolean).join("\n").slice(0, 4000);
}

export default function PlacesDeity(props: Props) {
  const { open, compact, onOpenChange } = props;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const transcriptScrollRef = useRef(0);
  const transcriptUpdateRef = useRef("");
  const controllerRef = useRef<AbortController | null>(null);

  useTahoeModalAccessibility({
    open: compact && open, panelRef, initialFocusRef: closeRef, modal: true,
    closeOnEscape: true, restoreFocus: false, hideBackground: false,
    onOpenChange: value => { if (!value) dismiss(true); },
  });

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!open || !transcript) return;
    const update = `${messages.length}:${busy}:${error || ""}`;
    if (transcriptUpdateRef.current === update) {
      transcript.scrollTop = transcriptScrollRef.current;
    } else if (!messages.length) {
      transcript.scrollTop = 0;
    } else if (!busy && !error && messages[messages.length - 1]?.role === "assistant") {
      // Start at the answer, not the last itinerary stop. Keep focus in the composer.
      const answer = transcript.querySelector<HTMLElement>('[data-latest-answer="true"]');
      if (answer) transcript.scrollTop += answer.getBoundingClientRect().top - transcript.getBoundingClientRect().top - 24;
    } else {
      transcript.scrollTop = transcript.scrollHeight;
    }
    transcriptUpdateRef.current = update;
    transcriptScrollRef.current = transcript.scrollTop;
  }, [messages, busy, error, open]);
  useEffect(() => {
    const textarea = draftRef.current;
    if (!open || !textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(120, Math.max(44, textarea.scrollHeight))}px`;
  }, [draft, open, compact]);
  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    if (!open || !compact || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const panel = panelRef.current;
    const syncKeyboardViewport = () => {
      panel?.style.setProperty("--deity-viewport-height", `${viewport.height}px`);
      panel?.style.setProperty("--deity-viewport-top", `${viewport.offsetTop}px`);
    };
    syncKeyboardViewport();
    viewport.addEventListener("resize", syncKeyboardViewport);
    viewport.addEventListener("scroll", syncKeyboardViewport);
    return () => {
      viewport.removeEventListener("resize", syncKeyboardViewport);
      viewport.removeEventListener("scroll", syncKeyboardViewport);
      panel?.style.removeProperty("--deity-viewport-height");
      panel?.style.removeProperty("--deity-viewport-top");
    };
  }, [open, compact]);

  function dismiss(minimize: boolean) {
    setMinimized(minimize);
    onOpenChange(false);
    window.requestAnimationFrame(() => {
      const trigger = compact ? document.getElementById("places-mobile-deity-trigger") : launcherRef.current;
      trigger?.focus({ preventScroll: true });
    });
  }

  async function send(text: string, retry = false) {
    const content = text.trim();
    if (!content || content.length > 2000 || controllerRef.current) return;
    const history = (retry ? messages.slice(0, -1) : messages).slice(-12)
      .map(message => ({ role: message.role, content: historyText(message, props.places) }));
    // Leave room for map context even with multi-byte text and long itineraries.
    while (history.length && new TextEncoder().encode(JSON.stringify(history)).length > 36_000) history.shift();
    if (!retry) setMessages(current => [...current, { role: "user", content }]);
    setDraft(""); setError(null); setRetryMessage(null); setBusy(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 40_000);
    try {
      const response = await fetch("/api/deity/places", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ message: content, history, context: {
          selectedPlaceId: props.selectedPlaceId,
          filteredPlaceIds: props.filteredPlaceIds,
          savedPlaceIds: props.savedPlaceIds,
        } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Deity is unavailable right now. Please try again.");
      if (typeof result.message !== "string" || !Array.isArray(result.recommendations) || !Array.isArray(result.warnings)) {
        throw new Error("Deity couldn’t finish this response. Please try again.");
      }
      setMessages(current => [...current, { role: "assistant", content: result.message, reply: result as PlacesChatResponse }]);
    } catch (failure) {
      setError(controller.signal.aborted
        ? timedOut ? "This is taking too long. Please try again." : "Response stopped. You can retry or ask something else."
        : failure instanceof Error ? failure.message : "Unable to connect. Please try again.");
      setRetryMessage(content);
    } finally {
      window.clearTimeout(timer); controllerRef.current = null; setBusy(false);
    }
  }

  function placeCard(pick: PlacesChatRecommendation, index: number, timeLabel?: string) {
    const place = props.places.find(item => item.id === pick.placeId);
    if (!place || placeClosureNotice(place)) return null;
    const event = pick.eventId ? activeEventsFor(place, Date.now()).find(item => item.id === pick.eventId && item.status === "scheduled") : null;
    if (pick.eventId && !event) return null;
    if (compact && timeLabel) return <div key={`${pick.placeId}-${index}`} className={styles.compactStop}>
      <button type="button" className={styles.stopMapButton}
        onClick={() => props.onSelectPlace(place.id)} aria-label={`Show ${place.name} on map`}>
        <span className={styles.pin}>{index + 1}</span>
        <span className={styles.stopTitle}>
          <span className={styles.time}>Suggested · {timeLabel}</span>
          <strong>{place.name}</strong>
          <small>{place.emirate}</small>
          <span className={styles.mapLink}>Show on map <ChevronRight size={13} /></span>
        </span>
      </button>
      {event && <span className={styles.stopEvent}>{event.title} · {event.dateLabel}</span>}
      <details className={styles.stopDetails}>
        <summary>Why this stop &amp; details <ChevronDown size={15} /></summary>
        <p>{pick.reason}</p>
        <p className={styles.stopAddress}>{place.address}</p>
      </details>
    </div>;
    return <button key={`${pick.placeId}-${index}`} type="button" className={styles.place}
      onClick={() => props.onSelectPlace(place.id)} aria-label={`Show ${place.name} on map`}>
      <span className={styles.pin}>{timeLabel ? index + 1 : <MapPin size={17} />}</span>
      <span>
        {timeLabel && <span className={styles.time}>Suggested · {timeLabel}</span>}
        <strong>{place.name}</strong>
        <small>{place.emirate} · {place.address}</small>
        <span className={styles.reason}>{pick.reason}</span>
        {event && <span className={styles.event}>{event.title} · {event.dateLabel}</span>}
        <span className={styles.mapLink}>Show on map <ChevronRight size={13} /></span>
      </span>
    </button>;
  }

  return <>
    {!open && !compact && !props.launcherHidden && <button ref={launcherRef} type="button" className={styles.launcher}
      onClick={() => { setMinimized(false); onOpenChange(true); }} aria-label="Open Deity places assistant"
      aria-expanded={false} aria-controls="places-deity-panel" aria-haspopup="dialog">
      <img src="/nsso-agent-avatar.png" alt="" />
      <span><b>{minimized ? "Resume Deity" : "Ask Deity"}</b><small>{busy ? "Planning your day…" : minimized ? "Your conversation is kept" : "Find a place. Make a day."}</small></span>
    </button>}
    {open && <section id="places-deity-panel" ref={panelRef} className={styles.panel} role="dialog"
      aria-modal={compact || undefined} aria-label="Deity places assistant" tabIndex={-1}
      onKeyDown={event => { if (!compact && event.key === "Escape") { event.stopPropagation(); dismiss(true); } }}>
      <header className={styles.header}>
        {compact && <button ref={closeRef} type="button" className={styles.backToMap}
          onClick={() => dismiss(true)} aria-label="Back to map" title="Back to map, keep conversation">
          <ArrowLeft size={18} /><span>Map</span>
        </button>}
        <img className={styles.avatar} src="/nsso-agent-avatar.png" alt="" />
        <div className={styles.brand}><img src="/deity logo white.png" alt="Deity" /><span>Your UAE day planner</span></div>
        {!compact && <>
          <button type="button" onClick={() => dismiss(true)} aria-label="Minimize Deity" title="Minimize, keep conversation"><Minus size={19} /></button>
          <button ref={closeRef} type="button" onClick={() => dismiss(false)} aria-label="Close Deity" title="Close"><X size={19} /></button>
        </>}
      </header>
      <details className={styles.context}>
        <summary><span><span className={styles.dot} />Connected to this map</span><span>{props.savedPlaceIds.length} saved <ChevronDown size={15} /></span></summary>
        <div><p>{props.contextLabel} · {props.savedPlaceIds.length} saved</p><p>AI suggestions, not live availability. Check opening hours and bookings before you go. Chat stays in this tab.</p></div>
      </details>
      <div ref={transcriptRef} className={styles.transcript} role="log" aria-label="Conversation with Deity" aria-live="polite" aria-relevant="additions"
        onScroll={event => { transcriptScrollRef.current = event.currentTarget.scrollTop; }}>
        {messages.length === 0 && <div className={styles.welcome}>
          <span className={styles.eyebrow}>A little inspiration</span>
          <h2>What kind of day are you imagining?</h2>
          <p>Tell me your mood, starting area, budget and when you’re going. I’ll connect places and current events from this map into a plan for you.</p>
          <div className={styles.prompts}>{PROMPTS.map(prompt => <button key={prompt.label} type="button" onClick={() => void send(prompt.message)}><span><strong>{prompt.label}</strong><small>{prompt.detail}</small></span><ChevronRight size={18} /></button>)}</div>
        </div>}
        {messages.map((message, index) => <article key={index} className={message.role === "user" ? styles.userMessage : styles.answer}
          data-latest-answer={message.role === "assistant" && index === messages.length - 1 || undefined}>
          <span className={styles.speaker}>{message.role === "user" ? "You" : "Deity"}</span>
          <p className={styles.message}>{message.content}</p>
          {message.reply?.recommendations.map((pick, pickIndex) => placeCard(pick, pickIndex))}
          {message.reply?.itinerary && <div className={styles.itinerary}>
            <span className={styles.eyebrow}>Your suggested itinerary</span>
            <h3>{message.reply.itinerary.title}</h3><p>{message.reply.itinerary.summary}</p>
            {message.reply.itinerary.date && <p>Suggested date · {message.reply.itinerary.date}</p>}
            {message.reply.itinerary.stops.map((pick, pickIndex) => placeCard(pick, pickIndex, pick.timeLabel || `Stop ${pickIndex + 1}`))}
          </div>}
          {!!message.reply?.warnings.length && <ul className={styles.warnings}>{message.reply.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
        </article>)}
        {busy && <p className={styles.loading} role="status"><span /> Finding a good fit in the map’s collection…</p>}
        {error && <div className={styles.error} role="alert"><p>{error}</p>{retryMessage && <button type="button" onClick={() => void send(retryMessage, true)}><RotateCcw size={14} /> Try again</button>}</div>}
      </div>
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send(draft); }}>
        <label htmlFor="places-deity-message" className={styles.srOnly}>Ask Deity about places or plan an itinerary</label>
        <div className={styles.inputRow}><textarea ref={draftRef} id="places-deity-message" value={draft} maxLength={2000} rows={1}
          placeholder="Plan your next date…" onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (!compact && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); } }} />
          {busy ? <button type="button" aria-label="Stop response" onClick={() => controllerRef.current?.abort()}><Square size={16} /></button>
            : <button type="submit" disabled={!draft.trim()} aria-label="Send message"><ArrowUp size={20} /></button>}
        </div>
        <p>AI suggestions · Check hours &amp; availability.</p>
      </form>
    </section>}
  </>;
}
