"use client";

import { ChevronUp, Minus, X } from "lucide-react";
import { forwardRef, useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { useTahoeModalAccessibility } from "@/components/ui/tahoe-glass";
import styles from "./mobile-sheet.module.css";

export type MobileSheetSnap = "peek" | "half" | "full";
type Props = {
  open: boolean;
  snap: MobileSheetSnap;
  onSnapChange: (snap: MobileSheetSnap) => void;
  onClose: () => void;
  title: string;
  ariaLabel?: string;
  id?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  scrollContent?: boolean;
};

const MobileSheet = forwardRef<HTMLElement, Props>(function MobileSheet({
  open, snap, onSnapChange, onClose, title, ariaLabel = title,
  id, children, footer, className, scrollContent = true,
}, forwardedRef) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ pointerId: number; y: number } | null>(null);
  const ignoreClickRef = useRef(false);
  const full = snap === "full";

  useTahoeModalAccessibility({
    open: open && full,
    panelRef,
    initialFocusRef: closeRef,
    modal: true,
    closeOnEscape: true,
    restoreFocus: false,
    hideBackground: false,
    onOpenChange: value => { if (!value) onClose(); },
  });

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function changeSnap(next: MobileSheetSnap) {
    onSnapChange(next);
    requestAnimationFrame(() => handleRef.current?.focus({ preventScroll: true }));
  }

  function minimize() {
    if (snap === "full") changeSnap("half");
    else if (snap === "half") changeSnap("peek");
    else onClose();
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const distance = event.clientY - drag.y;
    if (Math.abs(distance) < 42) return;
    ignoreClickRef.current = true;
    if (distance < 0) changeSnap(snap === "peek" ? "half" : "full");
    else minimize();
  }

  if (!open) return null;

  return <section
    ref={node => {
      panelRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    }}
    id={id}
    className={`${styles.sheet}${className ? ` ${className}` : ""}`}
    data-mobile-sheet="true"
    data-snap={snap}
    role="dialog"
    aria-modal={full || undefined}
    aria-label={ariaLabel}
    tabIndex={-1}
    onKeyDown={event => {
      if (!full && event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); onClose();
      }
    }}
  >
    <button ref={handleRef} type="button" className={styles.handle}
      aria-label={`${full ? "Reduce" : "Expand"} ${ariaLabel} sheet`}
      title="Drag to resize, or use the expand and minimize buttons"
      onPointerDown={event => {
        if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
        ignoreClickRef.current = false;
        dragRef.current = { pointerId: event.pointerId, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={finishDrag}
      onPointerCancel={() => { dragRef.current = null; ignoreClickRef.current = false; }}
      onClick={() => {
        if (ignoreClickRef.current) { ignoreClickRef.current = false; return; }
        changeSnap(full ? "half" : "full");
      }}
      onKeyDown={event => {
        if (event.key === "ArrowUp") { event.preventDefault(); changeSnap(snap === "peek" ? "half" : "full"); }
        if (event.key === "ArrowDown") { event.preventDefault(); minimize(); }
      }}
    ><span aria-hidden="true" /></button>
    <header className={styles.header}>
      <h2>{title}</h2>
      <div className={styles.actions}>
        {!full && <button type="button" aria-label={`Expand ${ariaLabel}`} title="Expand" onClick={() => changeSnap("full")}><ChevronUp size={20} /></button>}
        {snap !== "peek" && <button type="button" aria-label={`Minimize ${ariaLabel}`} title="Minimize" onClick={minimize}><Minus size={18} /></button>}
        <button ref={closeRef} type="button" aria-label={`Close ${ariaLabel}`} title="Close and return to map" onClick={onClose}><X size={19} /></button>
      </div>
    </header>
    <div className={`${styles.body}${scrollContent ? ` ${styles.scroll}` : ""}`}>{children}</div>
    {footer && <footer className={styles.footer}>{footer}</footer>}
  </section>;
});

export default MobileSheet;
