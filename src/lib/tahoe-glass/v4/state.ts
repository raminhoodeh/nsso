/**
 * These names describe renderer mechanics, not visual approval. In particular,
 * `refraction-presented` means a completed, non-empty composite was observed on
 * the target canvas. Perceptual refraction is qualified by visual fixtures.
 */
export type TahoeV4Lifecycle =
  | "material-ready"
  | "source-loading"
  | "source-ready"
  | "refraction-presented"
  | "fallback";

export interface TahoeV4LifecycleSnapshot {
  lifecycle: TahoeV4Lifecycle;
  reason: string | null;
  revision: number;
  changedAt: number;
}

export type TahoeV4LifecycleEvent =
  | { type: "MATERIAL_READY"; now?: number }
  | { type: "SOURCE_LOADING"; now?: number }
  | { type: "SOURCE_READY"; now?: number }
  | { type: "FRAME_PRESENTED"; now?: number }
  | { type: "FALLBACK"; reason: string; now?: number };

function eventTime(event: TahoeV4LifecycleEvent): number {
  return event.now ?? (typeof performance === "undefined" ? Date.now() : performance.now());
}

export function initialTahoeV4Lifecycle(
  now = typeof performance === "undefined" ? Date.now() : performance.now(),
): TahoeV4LifecycleSnapshot {
  return {
    lifecycle: "material-ready",
    reason: null,
    revision: 0,
    changedAt: now,
  };
}

export function reduceTahoeV4Lifecycle(
  current: TahoeV4LifecycleSnapshot,
  event: TahoeV4LifecycleEvent,
): TahoeV4LifecycleSnapshot {
  let lifecycle: TahoeV4Lifecycle;
  let reason: string | null = null;

  switch (event.type) {
    case "MATERIAL_READY":
      lifecycle = "material-ready";
      break;
    case "SOURCE_LOADING":
      lifecycle = "source-loading";
      break;
    case "SOURCE_READY":
      if (current.lifecycle !== "source-loading") {
        throw new Error(`invalid-tahoe-v4-transition-${current.lifecycle}-to-source-ready`);
      }
      lifecycle = "source-ready";
      break;
    case "FRAME_PRESENTED":
      if (
        current.lifecycle !== "source-ready" &&
        current.lifecycle !== "refraction-presented"
      ) {
        throw new Error(
          `invalid-tahoe-v4-transition-${current.lifecycle}-to-refraction-presented`,
        );
      }
      lifecycle = "refraction-presented";
      break;
    case "FALLBACK":
      lifecycle = "fallback";
      reason = event.reason;
      break;
  }

  if (current.lifecycle === lifecycle && current.reason === reason) return current;
  return {
    lifecycle,
    reason,
    revision: current.revision + 1,
    changedAt: eventTime(event),
  };
}

export class TahoeV4LifecycleStore {
  private current: TahoeV4LifecycleSnapshot;
  private readonly listeners = new Set<(state: TahoeV4LifecycleSnapshot) => void>();

  constructor(now?: number) {
    this.current = initialTahoeV4Lifecycle(now);
  }

  getSnapshot = (): TahoeV4LifecycleSnapshot => this.current;

  subscribe = (
    listener: (state: TahoeV4LifecycleSnapshot) => void,
  ): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch(event: TahoeV4LifecycleEvent): TahoeV4LifecycleSnapshot {
    const next = reduceTahoeV4Lifecycle(this.current, event);
    if (next === this.current) return next;
    this.current = next;
    for (const listener of this.listeners) listener(next);
    return next;
  }
}
