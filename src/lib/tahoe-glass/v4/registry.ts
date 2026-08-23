import type {
  TahoeV4Rect,
  TahoeV4SurfaceOptions,
  TahoeV4SurfaceSnapshot,
} from "./types";

interface RegistryEntry extends TahoeV4SurfaceOptions {
  insertionOrder: number;
}

interface RegistryPaintEntry {
  entry: RegistryEntry;
  stackingChain: Array<{ element: HTMLElement; zIndex: number }>;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function intersectRects(a: TahoeV4Rect, b: TahoeV4Rect): TahoeV4Rect | null {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function clipsAxis(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === "hidden" || normalized === "clip" || normalized === "scroll") {
    return true;
  }
  if (normalized === "auto") return true;
  if (normalized === "visible") return false;
  return normalized.includes("hidden") || normalized.includes("clip");
}

function createsStackingContext(
  element: HTMLElement,
  computed: CSSStyleDeclaration,
): boolean {
  const positionedWithZ =
    computed.zIndex !== "auto" &&
    ["absolute", "fixed", "relative", "sticky"].includes(computed.position);
  return (
    element === document.documentElement ||
    computed.position === "fixed" ||
    computed.position === "sticky" ||
    positionedWithZ ||
    Number.parseFloat(computed.opacity) < 1 ||
    computed.transform !== "none" ||
    computed.filter !== "none" ||
    computed.perspective !== "none" ||
    computed.mixBlendMode !== "normal" ||
    computed.isolation === "isolate" ||
    computed.contain.includes("paint") ||
    computed.willChange.split(",").some((property) =>
      ["filter", "opacity", "transform"].includes(property.trim()),
    )
  );
}

function stackingChain(
  element: HTMLElement,
): RegistryPaintEntry["stackingChain"] {
  const chain: RegistryPaintEntry["stackingChain"] = [];
  let current: HTMLElement | null = element;
  while (current) {
    const computed = getComputedStyle(current);
    if (createsStackingContext(current, computed)) {
      const parsed = Number.parseInt(computed.zIndex, 10);
      chain.push({
        element: current,
        zIndex: Number.isFinite(parsed) ? parsed : 0,
      });
    }
    current = current.parentElement;
  }
  return chain.reverse();
}

function documentPaintOrder(
  firstPaint: RegistryPaintEntry,
  secondPaint: RegistryPaintEntry,
): number {
  const a = firstPaint.entry;
  const b = secondPaint.entry;
  if (a.element === b.element) return 0;
  if (a.element.contains(b.element)) return -1;
  if (b.element.contains(a.element)) return 1;

  const priorityDifference = finiteOr(a.priority, 0) - finiteOr(b.priority, 0);
  if (priorityDifference !== 0) return priorityDifference;

  const sharedLength = Math.min(
    firstPaint.stackingChain.length,
    secondPaint.stackingChain.length,
  );
  for (let index = 0; index < sharedLength; index += 1) {
    const first = firstPaint.stackingChain[index];
    const second = secondPaint.stackingChain[index];
    if (first.element === second.element) continue;
    if (first.zIndex !== second.zIndex) return first.zIndex - second.zIndex;
    const contextRelation = first.element.compareDocumentPosition(second.element);
    if (contextRelation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (contextRelation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  }
  if (firstPaint.stackingChain.length !== secondPaint.stackingChain.length) {
    const firstZ = firstPaint.stackingChain[sharedLength]?.zIndex ?? 0;
    const secondZ = secondPaint.stackingChain[sharedLength]?.zIndex ?? 0;
    if (firstZ !== secondZ) return firstZ - secondZ;
  }

  const relation = a.element.compareDocumentPosition(b.element);
  if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return a.insertionOrder - b.insertionOrder;
}

/**
 * DOM measurement is isolated here so the renderer consumes deterministic,
 * viewport-relative snapshots and never reaches into React or the document.
 */
export class TahoeV4SurfaceRegistry {
  private readonly entries = new Map<string, RegistryEntry>();
  private readonly listeners = new Set<() => void>();
  private insertionOrder = 0;
  private revision = 0;

  get size(): number {
    return this.entries.size;
  }

  get currentRevision(): number {
    return this.revision;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  register(options: TahoeV4SurfaceOptions): () => void {
    if (!options.id) throw new Error("tahoe-v4-surface-id-required");
    const existing = this.entries.get(options.id);
    this.entries.set(options.id, {
      ...options,
      insertionOrder: existing?.insertionOrder ?? this.insertionOrder++,
    });
    this.changed();
    return () => this.unregister(options.id);
  }

  update(
    id: string,
    options: Partial<Omit<TahoeV4SurfaceOptions, "id" | "element">>,
  ): void {
    const current = this.entries.get(id);
    if (!current) return;
    this.entries.set(id, { ...current, ...options });
    this.changed();
  }

  unregister(id: string): void {
    if (!this.entries.delete(id)) return;
    this.changed();
  }

  clear(): void {
    if (this.entries.size === 0) return;
    this.entries.clear();
    this.changed();
  }

  markDirty(): void {
    this.changed();
  }

  snapshot(viewportElement: HTMLElement): TahoeV4SurfaceSnapshot[] {
    const viewport = viewportElement.getBoundingClientRect();
    const viewportRect: TahoeV4Rect = {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    };

    return [...this.entries.values()]
      .map((entry) => ({ entry, stackingChain: stackingChain(entry.element) }))
      .sort(documentPaintOrder)
      .map(({ entry }) => entry)
      .map((entry) => {
        const rect = entry.element.getBoundingClientRect();
        const relativeRect: TahoeV4Rect = {
          x: rect.left - viewport.left,
          y: rect.top - viewport.top,
          width: rect.width,
          height: rect.height,
        };
        let clipRect = intersectRects(relativeRect, viewportRect);
        let opacity = 1;
        let current: HTMLElement | null = entry.element;

        while (current) {
          const style = getComputedStyle(current);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            style.contentVisibility === "hidden"
          ) {
            opacity = 0;
            clipRect = null;
            break;
          }
          const ownOpacity = Number.parseFloat(style.opacity);
          if (Number.isFinite(ownOpacity)) {
            opacity *= Math.max(0, Math.min(1, ownOpacity));
          }
          if (current !== entry.element && clipRect) {
            const clipsPaint = style.contain.includes("paint");
            const clipsX = clipsAxis(style.overflowX) || clipsPaint;
            const clipsY = clipsAxis(style.overflowY) || clipsPaint;
            if (clipsX || clipsY) {
              const parent = current.getBoundingClientRect();
              const contentLeft = parent.left - viewport.left + current.clientLeft;
              const contentTop = parent.top - viewport.top + current.clientTop;
              const parentRect: TahoeV4Rect = {
                x: clipsX ? contentLeft : clipRect.x,
                y: clipsY ? contentTop : clipRect.y,
                width: clipsX ? current.clientWidth : clipRect.width,
                height: clipsY ? current.clientHeight : clipRect.height,
              };
              clipRect = intersectRects(clipRect, parentRect);
            }
          }
          if (current === viewportElement) break;
          current = current.parentElement;
        }

        const visible = Boolean(
          clipRect &&
            opacity > 0.01 &&
            relativeRect.width > 0 &&
            relativeRect.height > 0,
        );
        return {
          id: entry.id,
          profile: entry.profile,
          rect: relativeRect,
          clipRect,
          cornerRadiiPx: {
            topLeft: Math.max(0, finiteOr(entry.cornerRadiiPx.topLeft, 0)),
            topRight: Math.max(0, finiteOr(entry.cornerRadiiPx.topRight, 0)),
            bottomRight: Math.max(
              0,
              finiteOr(entry.cornerRadiiPx.bottomRight, 0),
            ),
            bottomLeft: Math.max(
              0,
              finiteOr(entry.cornerRadiiPx.bottomLeft, 0),
            ),
          },
          priority: finiteOr(entry.priority, 0),
          continuous: entry.continuous ?? false,
          visible,
          opacity,
          edgeBandPx: entry.edgeBandPx,
        };
      });
  }

  private changed(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }
}
