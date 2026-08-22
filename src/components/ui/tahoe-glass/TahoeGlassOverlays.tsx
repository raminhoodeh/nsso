"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  TahoeGlassSurface,
  type TahoeGlassSurfaceProps,
} from "./TahoeGlassSurface";

const FOCUSABLE_SELECTOR = [
  "[autofocus]",
  "[data-autofocus]",
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const subscribeToNothing = () => () => undefined;

function useClientReady(): boolean {
  return React.useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

function assignRef<T>(ref: React.ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
}

interface UseOverlayFocusOptions {
  open: boolean;
  panelRef: React.RefObject<HTMLElement | null>;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  modal: boolean;
  closeOnEscape: boolean;
  restoreFocus: boolean;
  onOpenChange?: (open: boolean) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
}

function useOverlayFocus({
  open,
  panelRef,
  initialFocusRef,
  modal,
  closeOnEscape,
  restoreFocus,
  onOpenChange,
  onEscapeKeyDown,
}: UseOverlayFocusOptions): void {
  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      const initial =
        initialFocusRef?.current ||
        (panel ? getFocusableElements(panel)[0] : null) ||
        panel;
      initial?.focus({ preventScroll: true });
    });

    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscapeKeyDown?.(event);
        if (closeOnEscape && !event.defaultPrevented) {
          event.preventDefault();
          onOpenChange?.(false);
        }
        return;
      }
      if (!modal || event.key !== "Tab" || !panelRef.current) return;

      const focusable = getFocusableElements(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", keyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keyDown);
      if (restoreFocus && previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [
    closeOnEscape,
    initialFocusRef,
    modal,
    onEscapeKeyDown,
    onOpenChange,
    open,
    panelRef,
    restoreFocus,
  ]);
}

interface TahoeGlassPortalProps {
  enabled: boolean;
  container?: Element | DocumentFragment | null;
  children: React.ReactNode;
}

function TahoeGlassPortal({
  enabled,
  container,
  children,
}: TahoeGlassPortalProps) {
  const clientReady = useClientReady();
  if (!enabled) return children;
  if (!clientReady) return null;
  return createPortal(children, container || document.body);
}

export interface TahoeGlassDialogProps
  extends Omit<
    TahoeGlassSurfaceProps,
    "as" | "variant" | "role" | "title"
  > {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  portal?: boolean;
  portalContainer?: Element | DocumentFragment | null;
  modal?: boolean;
  closeOnEscape?: boolean;
  closeOnPointerDownOutside?: boolean;
  restoreFocus?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  overlayClassName?: string;
  backdropClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export const TahoeGlassDialog = React.forwardRef<
  HTMLDivElement,
  TahoeGlassDialogProps
>(function TahoeGlassDialog(
  {
    open,
    onOpenChange,
    title,
    description,
    portal = true,
    portalContainer,
    modal = true,
    closeOnEscape = true,
    closeOnPointerDownOutside = true,
    restoreFocus = true,
    initialFocusRef,
    overlayClassName,
    backdropClassName,
    titleClassName,
    descriptionClassName,
    onEscapeKeyDown,
    onPointerDownOutside,
    className,
    children,
    ...surfaceProps
  },
  forwardedRef,
) {
  const panelRef = React.useRef<HTMLElement | null>(null);
  const generatedId = React.useId();
  const titleId = title != null ? `${generatedId}-title` : undefined;
  const descriptionId =
    description != null ? `${generatedId}-description` : undefined;
  const ariaLabel = surfaceProps["aria-label"];
  const ariaLabelledBy = surfaceProps["aria-labelledby"];
  const ariaDescribedBy = surfaceProps["aria-describedby"];
  const resolvedAriaLabel =
    ariaLabel || ariaLabelledBy || titleId ? ariaLabel : "Dialog";

  const setPanelRef = React.useCallback(
    (element: HTMLElement | null) => {
      panelRef.current = element;
      assignRef(forwardedRef, element as HTMLDivElement | null);
    },
    [forwardedRef],
  );

  useOverlayFocus({
    open,
    panelRef,
    initialFocusRef,
    modal,
    closeOnEscape,
    restoreFocus,
    onOpenChange,
    onEscapeKeyDown,
  });

  if (!open) return null;

  const shell = (
    <div
      className={cn(
        "pointer-events-auto fixed inset-0 z-[1000] flex items-center justify-center p-4",
        overlayClassName,
      )}
      data-tahoe-glass-dialog-overlay="true"
    >
      <div
        aria-hidden="true"
        className={cn("absolute inset-0 bg-transparent", backdropClassName)}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          onPointerDownOutside?.(event);
          if (closeOnPointerDownOutside && !event.defaultPrevented) {
            onOpenChange?.(false);
          }
        }}
      />
      <TahoeGlassSurface
        {...surfaceProps}
        ref={setPanelRef}
        as="div"
        variant="dialog"
        role="dialog"
        aria-modal={modal || undefined}
        aria-label={resolvedAriaLabel}
        aria-labelledby={ariaLabelledBy || (!ariaLabel ? titleId : undefined)}
        aria-describedby={ariaDescribedBy || descriptionId}
        tabIndex={surfaceProps.tabIndex ?? -1}
        className={cn(
          "pointer-events-auto relative z-[1] max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-auto p-6",
          className,
        )}
      >
        {title != null && (
          <h2 id={titleId} className={cn("text-xl font-semibold", titleClassName)}>
            {title}
          </h2>
        )}
        {description != null && (
          <p
            id={descriptionId}
            className={cn("mt-2 text-sm opacity-80", descriptionClassName)}
          >
            {description}
          </p>
        )}
        {children}
      </TahoeGlassSurface>
    </div>
  );

  return (
    <TahoeGlassPortal enabled={portal} container={portalContainer}>
      {shell}
    </TahoeGlassPortal>
  );
});

TahoeGlassDialog.displayName = "TahoeGlassDialog";

export interface TahoeGlassPopoverProps
  extends Omit<TahoeGlassSurfaceProps, "as" | "variant"> {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  portal?: boolean;
  portalContainer?: Element | DocumentFragment | null;
  modal?: boolean;
  closeOnEscape?: boolean;
  closeOnPointerDownOutside?: boolean;
  restoreFocus?: boolean;
  autoFocus?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  overlayClassName?: string;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export const TahoeGlassPopover = React.forwardRef<
  HTMLDivElement,
  TahoeGlassPopoverProps
>(function TahoeGlassPopover(
  {
    open,
    onOpenChange,
    portal = true,
    portalContainer,
    modal = false,
    closeOnEscape = true,
    closeOnPointerDownOutside = true,
    restoreFocus = true,
    autoFocus = false,
    initialFocusRef,
    overlayClassName,
    onEscapeKeyDown,
    onPointerDownOutside,
    className,
    children,
    role = "dialog",
    ...surfaceProps
  },
  forwardedRef,
) {
  const panelRef = React.useRef<HTMLElement | null>(null);
  const setPanelRef = React.useCallback(
    (element: HTMLElement | null) => {
      panelRef.current = element;
      assignRef(forwardedRef, element as HTMLDivElement | null);
    },
    [forwardedRef],
  );

  useOverlayFocus({
    open: open && (autoFocus || modal),
    panelRef,
    initialFocusRef,
    modal,
    closeOnEscape,
    restoreFocus,
    onOpenChange,
    onEscapeKeyDown,
  });

  React.useEffect(() => {
    if (!open || autoFocus) return;
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onEscapeKeyDown?.(event);
      if (closeOnEscape && !event.defaultPrevented) onOpenChange?.(false);
    };
    document.addEventListener("keydown", keyDown);
    return () => document.removeEventListener("keydown", keyDown);
  }, [autoFocus, closeOnEscape, onEscapeKeyDown, onOpenChange, open]);

  if (!open) return null;

  const shell = (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-[1000]",
        overlayClassName,
      )}
      data-tahoe-glass-popover-overlay="true"
    >
      {closeOnPointerDownOutside && (
        <div
          aria-hidden="true"
          className="pointer-events-auto absolute inset-0 bg-transparent"
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            onPointerDownOutside?.(event);
            if (!event.defaultPrevented) onOpenChange?.(false);
          }}
        />
      )}
      <TahoeGlassSurface
        {...surfaceProps}
        ref={setPanelRef}
        as="div"
        variant="popover"
        role={role}
        aria-label={
          surfaceProps["aria-label"] ||
          (!surfaceProps["aria-labelledby"] && role === "dialog"
            ? "Popover"
            : undefined)
        }
        tabIndex={surfaceProps.tabIndex ?? -1}
        className={cn(
          "pointer-events-auto absolute max-h-[calc(100dvh-1rem)] overflow-auto p-3",
          className,
        )}
      >
        {children}
      </TahoeGlassSurface>
    </div>
  );

  return (
    <TahoeGlassPortal enabled={portal} container={portalContainer}>
      {shell}
    </TahoeGlassPortal>
  );
});

TahoeGlassPopover.displayName = "TahoeGlassPopover";

export const TahoeGlassDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function TahoeGlassDialogTitle({ className, ...props }, forwardedRef) {
  return (
    <h2
      ref={forwardedRef}
      className={cn("text-xl font-semibold", className)}
      {...props}
    />
  );
});

TahoeGlassDialogTitle.displayName = "TahoeGlassDialogTitle";

export const TahoeGlassDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function TahoeGlassDialogDescription(
  { className, ...props },
  forwardedRef,
) {
  return (
    <p
      ref={forwardedRef}
      className={cn("text-sm opacity-80", className)}
      {...props}
    />
  );
});

TahoeGlassDialogDescription.displayName = "TahoeGlassDialogDescription";
