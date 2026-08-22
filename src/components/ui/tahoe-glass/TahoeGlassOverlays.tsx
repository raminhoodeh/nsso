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
  "audio[controls]",
  "button:not([disabled])",
  "[contenteditable='true']",
  "input:not([disabled])",
  "select:not([disabled])",
  "summary",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "video[controls]",
].join(",");

interface ModalLayer {
  order: number;
  panelRef: React.RefObject<HTMLElement | null>;
  isolationRoot: HTMLElement | null;
  hideBackground: boolean;
  preventBodyScroll: boolean;
}

interface HiddenBackgroundState {
  count: number;
  ariaHidden: string | null;
  inert: boolean;
}

const modalLayers: ModalLayer[] = [];
const hiddenBackgroundStates = new WeakMap<HTMLElement, HiddenBackgroundState>();
let activeIsolationLayer: ModalLayer | null = null;
let restoreActiveIsolation: (() => void) | null = null;
let restoreManagedBodyScroll: (() => void) | null = null;
let bodyScrollLockCount = 0;
let lockedBody: HTMLElement | null = null;
let lockedBodyOverflow = "";
let lockedBodyOverflowPriority = "";

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
      !element.closest("[inert]") &&
      element.getClientRects().length > 0,
  );
}

function getTopModalLayer(): ModalLayer | undefined {
  return modalLayers[modalLayers.length - 1];
}

function compareModalLayerPosition(first: ModalLayer, second: ModalLayer): number {
  const firstRoot = first.isolationRoot || first.panelRef.current;
  const secondRoot = second.isolationRoot || second.panelRef.current;
  if (firstRoot && secondRoot && firstRoot !== secondRoot) {
    const position = firstRoot.compareDocumentPosition(secondRoot);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  }
  return first.order - second.order;
}

function registerModalLayer(layer: ModalLayer): () => boolean {
  layer.order = modalLayers.reduce(
    (highestOrder, candidate) => Math.max(highestOrder, candidate.order),
    0,
  ) + 1;
  modalLayers.push(layer);
  modalLayers.sort(compareModalLayerPosition);
  return () => {
    const wasTopLayer = getTopModalLayer() === layer;
    const index = modalLayers.lastIndexOf(layer);
    if (index >= 0) modalLayers.splice(index, 1);
    syncModalEnvironment();
    return wasTopLayer;
  };
}

function hideBackgroundElement(element: HTMLElement): void {
  const existing = hiddenBackgroundStates.get(element);
  if (existing) {
    existing.count += 1;
    return;
  }

  hiddenBackgroundStates.set(element, {
    count: 1,
    ariaHidden: element.getAttribute("aria-hidden"),
    inert: element.inert,
  });
  element.setAttribute("aria-hidden", "true");
  element.inert = true;
}

function restoreBackgroundElement(element: HTMLElement): void {
  const state = hiddenBackgroundStates.get(element);
  if (!state) return;
  state.count -= 1;
  if (state.count > 0) return;

  if (state.ariaHidden === null) element.removeAttribute("aria-hidden");
  else element.setAttribute("aria-hidden", state.ariaHidden);
  element.inert = state.inert;
  hiddenBackgroundStates.delete(element);
}

function isolateBackground(root: HTMLElement): () => void {
  const background = new Set<HTMLElement>();
  let current: HTMLElement | null = root;

  while (current?.parentElement) {
    const parentElement: HTMLElement = current.parentElement;
    for (const sibling of parentElement.children) {
      if (sibling !== current && sibling instanceof HTMLElement) {
        background.add(sibling);
      }
    }
    if (parentElement === document.body) break;
    current = parentElement;
  }

  background.forEach(hideBackgroundElement);
  return () => background.forEach(restoreBackgroundElement);
}

function lockBodyScroll(): () => void {
  const body = document.body;
  if (bodyScrollLockCount === 0) {
    lockedBody = body;
    lockedBodyOverflow = body.style.getPropertyValue("overflow");
    lockedBodyOverflowPriority = body.style.getPropertyPriority("overflow");
    body.style.setProperty("overflow", "hidden");
  }
  bodyScrollLockCount += 1;

  return () => {
    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
    if (bodyScrollLockCount > 0 || !lockedBody) return;
    if (lockedBodyOverflow) {
      lockedBody.style.setProperty(
        "overflow",
        lockedBodyOverflow,
        lockedBodyOverflowPriority,
      );
    } else {
      lockedBody.style.removeProperty("overflow");
    }
    lockedBody = null;
    lockedBodyOverflow = "";
    lockedBodyOverflowPriority = "";
  };
}

function syncModalEnvironment(): void {
  const topLayer = getTopModalLayer();
  const nextIsolationLayer =
    topLayer?.hideBackground && topLayer.isolationRoot ? topLayer : null;

  if (nextIsolationLayer !== activeIsolationLayer) {
    restoreActiveIsolation?.();
    activeIsolationLayer = nextIsolationLayer;
    restoreActiveIsolation = nextIsolationLayer?.isolationRoot
      ? isolateBackground(nextIsolationLayer.isolationRoot)
      : null;
  }

  const shouldPreventBodyScroll = modalLayers.some(
    (layer) => layer.preventBodyScroll,
  );
  if (shouldPreventBodyScroll && !restoreManagedBodyScroll) {
    restoreManagedBodyScroll = lockBodyScroll();
  } else if (!shouldPreventBodyScroll && restoreManagedBodyScroll) {
    restoreManagedBodyScroll();
    restoreManagedBodyScroll = null;
  }
}

function canRestoreFocus(element: HTMLElement): boolean {
  return (
    element.isConnected &&
    !element.closest("[inert]") &&
    !element.closest("[aria-hidden='true']")
  );
}

export interface TahoeModalAccessibilityOptions {
  open: boolean;
  ready?: boolean;
  panelRef: React.RefObject<HTMLElement | null>;
  isolationRoot?: HTMLElement | null;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  modal: boolean;
  autoFocus?: boolean;
  closeOnEscape: boolean;
  restoreFocus: boolean;
  hideBackground?: boolean;
  preventBodyScroll?: boolean;
  onOpenChange?: (open: boolean) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
}

export function useTahoeModalAccessibility({
  open,
  ready = true,
  panelRef,
  isolationRoot,
  initialFocusRef,
  modal,
  autoFocus = true,
  closeOnEscape,
  restoreFocus,
  hideBackground = modal,
  preventBodyScroll = modal,
  onOpenChange,
  onEscapeKeyDown,
}: TahoeModalAccessibilityOptions): void {
  const layerRef = React.useRef<ModalLayer>({
    order: 0,
    panelRef,
    isolationRoot: null,
    hideBackground: false,
    preventBodyScroll: false,
  });
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);
  const latestOptionsRef = React.useRef({ onOpenChange, onEscapeKeyDown });

  React.useLayoutEffect(() => {
    latestOptionsRef.current = { onOpenChange, onEscapeKeyDown };
    layerRef.current.panelRef = panelRef;
  }, [onEscapeKeyDown, onOpenChange, panelRef]);

  React.useLayoutEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }, [open]);

  React.useLayoutEffect(() => {
    if (!open || !ready) return;
    const layer = layerRef.current;
    layer.isolationRoot = isolationRoot || panelRef.current;
    layer.hideBackground = hideBackground;
    layer.preventBodyScroll = preventBodyScroll;
    const unregisterLayer = modal
      ? registerModalLayer(layer)
      : () => true;

    const isActiveLayer = () => !modal || getTopModalLayer() === layer;
    const focusInside = (preferLast = false) => {
      const panel = panelRef.current;
      if (!panel || !isActiveLayer()) return;
      const focusable = getFocusableElements(panel);
      const requestedInitialFocus = initialFocusRef?.current;
      const initial =
        (!preferLast &&
        requestedInitialFocus &&
        panel.contains(requestedInitialFocus)
          ? requestedInitialFocus
          : null) ||
        focusable[preferLast ? focusable.length - 1 : 0] ||
        panel;
      initial.focus({ preventScroll: true });
    };
    const shouldAutoFocus = autoFocus || modal;
    if (shouldAutoFocus) focusInside();
    if (modal) syncModalEnvironment();
    const frame = shouldAutoFocus
      ? window.requestAnimationFrame(() => {
          const panel = panelRef.current;
          const activeElement = document.activeElement;
          if (
            panel &&
            (!(activeElement instanceof Node) || !panel.contains(activeElement))
          ) {
            focusInside();
          }
        })
      : null;

    const keyDown = (event: KeyboardEvent) => {
      if (!isActiveLayer()) return;
      if (event.key === "Escape") {
        latestOptionsRef.current.onEscapeKeyDown?.(event);
        if (closeOnEscape && !event.defaultPrevented) {
          event.preventDefault();
          latestOptionsRef.current.onOpenChange?.(false);
        }
        return;
      }
      if (!modal || event.key !== "Tab" || !panelRef.current) return;

      const panel = panelRef.current;
      const activeElement = document.activeElement;
      if (!(activeElement instanceof Node) || !panel.contains(activeElement)) {
        event.preventDefault();
        focusInside(event.shiftKey);
        return;
      }

      const focusable = getFocusableElements(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (activeElement === first || activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const focusIn = (event: FocusEvent) => {
      if (!modal || !isActiveLayer() || !panelRef.current) return;
      const target = event.target;
      if (target instanceof Node && panelRef.current.contains(target)) return;
      focusInside();
    };

    document.addEventListener("keydown", keyDown);
    if (modal) document.addEventListener("focusin", focusIn);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keyDown);
      if (modal) document.removeEventListener("focusin", focusIn);
      const wasActiveLayer = unregisterLayer();
      const previouslyFocused = previouslyFocusedRef.current;
      if (restoreFocus && wasActiveLayer) {
        if (previouslyFocused && canRestoreFocus(previouslyFocused)) {
          previouslyFocused.focus({ preventScroll: true });
        } else {
          const nextPanel = getTopModalLayer()?.panelRef.current;
          nextPanel?.focus({ preventScroll: true });
        }
      }
    };
  }, [
    autoFocus,
    closeOnEscape,
    hideBackground,
    initialFocusRef,
    isolationRoot,
    modal,
    open,
    panelRef,
    preventBodyScroll,
    ready,
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
  const [overlayElement, setOverlayElement] =
    React.useState<HTMLDivElement | null>(null);
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

  useTahoeModalAccessibility({
    open,
    ready: overlayElement !== null,
    panelRef,
    isolationRoot: overlayElement,
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
      ref={setOverlayElement}
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
  const [overlayElement, setOverlayElement] =
    React.useState<HTMLDivElement | null>(null);
  const setPanelRef = React.useCallback(
    (element: HTMLElement | null) => {
      panelRef.current = element;
      assignRef(forwardedRef, element as HTMLDivElement | null);
    },
    [forwardedRef],
  );

  useTahoeModalAccessibility({
    open: open && (autoFocus || modal),
    ready: overlayElement !== null,
    panelRef,
    isolationRoot: overlayElement,
    initialFocusRef,
    modal,
    autoFocus: autoFocus || modal,
    closeOnEscape,
    restoreFocus,
    onOpenChange,
    onEscapeKeyDown,
  });

  React.useEffect(() => {
    if (!open || autoFocus || modal) return;
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onEscapeKeyDown?.(event);
      if (closeOnEscape && !event.defaultPrevented) onOpenChange?.(false);
    };
    document.addEventListener("keydown", keyDown);
    return () => document.removeEventListener("keydown", keyDown);
  }, [autoFocus, closeOnEscape, modal, onEscapeKeyDown, onOpenChange, open]);

  if (!open) return null;

  const shell = (
    <div
      ref={setOverlayElement}
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
