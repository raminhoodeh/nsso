"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

export type TahoeV4RolloutMode = "off" | "on" | "material-only";

interface TahoeV4RolloutContextValue {
  mode: TahoeV4RolloutMode;
  enabled: boolean;
  forceMaterialOnly: boolean;
  debug: boolean;
  setMode: (mode: TahoeV4RolloutMode) => void;
}

const TahoeV4RolloutContext = React.createContext<TahoeV4RolloutContextValue>({
  mode: "off",
  enabled: false,
  forceMaterialOnly: false,
  debug: false,
  setMode: () => undefined,
});

const QUERY_KEY = "tahoeV4";

function parseRolloutMode(value: string | null): TahoeV4RolloutMode | null {
  if (value === "1" || value === "on") return "on";
  if (value === "material" || value === "material-only") {
    return "material-only";
  }
  if (value === "0" || value === "off") return "off";
  return null;
}

export interface TahoeV4RolloutGateProps {
  children: React.ReactNode;
  initialMode?: TahoeV4RolloutMode;
  /** Exact routes or `/prefix/*`; `*` enables the whole preview. */
  routes?: readonly string[];
  /** Preview/dev convenience. Production must opt in explicitly. */
  allowClientOverride?: boolean;
}

function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function routeMatches(pathname: string, routes: readonly string[]): boolean {
  const normalized = normalizePathname(pathname);
  return routes.some((route) => {
    const candidate = normalizePathname(route.trim());
    if (candidate === "*") return true;
    if (candidate.endsWith("/*")) {
      const prefix = candidate.slice(0, -2);
      return normalized === prefix || normalized.startsWith(`${prefix}/`);
    }
    return normalized === candidate;
  });
}

/**
 * Route-scoped V4 release and kill switch. The server-provided mode and route
 * manifest are authoritative. Preview/development overrides are explicit URL
 * state for the current document; stale browser storage must never silently
 * change the engine selected by the deployed artifact.
 */
export function TahoeV4RolloutGate({
  children,
  initialMode = "off",
  routes = ["*"],
  allowClientOverride = false,
}: TahoeV4RolloutGateProps) {
  const pathname = usePathname();
  const [mode, setModeState] = React.useState<TahoeV4RolloutMode>(initialMode);
  const [debug, setDebug] = React.useState(false);

  const setMode = React.useCallback((nextMode: TahoeV4RolloutMode) => {
    setModeState(nextMode);
  }, []);

  React.useEffect(() => {
    if (!allowClientOverride) {
      setModeState(initialMode);
      setDebug(false);
      return;
    }

    const search = new URLSearchParams(window.location.search);
    const queryMode = parseRolloutMode(search.get(QUERY_KEY));
    // The deployed environment becomes authoritative again as soon as the
    // explicit URL override is absent. This prevents a Preview navigation from
    // carrying an old validation mode into a different route.
    setModeState(queryMode ?? initialMode);
    setDebug(search.get("glassDebug") === "1");
  }, [allowClientOverride, initialMode, pathname]);

  React.useEffect(() => {
    document.documentElement.dataset.tahoeV4 = mode;
    return () => {
      delete document.documentElement.dataset.tahoeV4;
    };
  }, [mode]);

  const value = React.useMemo<TahoeV4RolloutContextValue>(
    () => ({
      mode,
      enabled: mode !== "off" && routeMatches(pathname, routes),
      forceMaterialOnly:
        mode === "material-only" && routeMatches(pathname, routes),
      debug,
      setMode,
    }),
    [debug, mode, pathname, routes, setMode],
  );

  return (
    <TahoeV4RolloutContext.Provider value={value}>
      {children}
    </TahoeV4RolloutContext.Provider>
  );
}

export function useTahoeV4Rollout(): TahoeV4RolloutContextValue {
  return React.useContext(TahoeV4RolloutContext);
}
