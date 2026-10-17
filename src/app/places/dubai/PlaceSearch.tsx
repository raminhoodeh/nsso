"use client";

import { Search, X } from "lucide-react";
import { useRef, type RefObject } from "react";
import styles from "./search.module.css";

type Props = {
  query: string;
  onChange: (query: string) => void;
  onFocus?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
};

export default function PlaceSearch({ query, onChange, onFocus, inputRef }: Props) {
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef || localRef;
  return <div className={styles.search} role="search" aria-label="Find a place">
    <Search size={18} aria-hidden="true" />
    <input
      ref={ref} type="search" aria-label="Search places" placeholder="Search places, areas or things to do"
      value={query} autoComplete="off" spellCheck={false} enterKeyHint="search"
      aria-controls={query.trim() ? "places-search-results" : undefined}
      onChange={event => onChange(event.target.value)} onFocus={onFocus}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape" && query) {
          event.preventDefault(); event.stopPropagation(); onChange("");
        }
        if ((event.key === "ArrowDown" || event.key === "Enter") && query.trim()) {
          const first = document.querySelector<HTMLButtonElement>("#places-search-results article button");
          if (first) {
            event.preventDefault();
            if (event.key === "Enter") { ref.current?.blur(); first.click(); }
            else first.focus();
          }
        }
      }}
    />
    {query && <button type="button" aria-label="Clear search" onClick={() => { onChange(""); ref.current?.focus(); }}><X size={17} aria-hidden="true" /></button>}
  </div>;
}
