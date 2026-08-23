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

const STORAGE_KEY = "nsso-tahoe-v4-mode";
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
 * manifest are authoritative; client overrides are enabled only in preview or
 * development and persist so navigation does not silently change engines.
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
    if (!allowClientOverride) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // Storage can be unavailable in private/embedded browsing. The in-memory
      // switch still works for the current document.
    }
  }, [allowClientOverride]);

  React.useEffect(() => {
    if (!allowClientOverride) return;
    const queryMode = parseRolloutMode(
      new URLSearchParams(window.location.search).get(QUERY_KEY),
    );
    setDebug(
      new URLSearchParams(window.location.search).get("glassDebug") === "1",
    );
    if (queryMode) {
      setMode(queryMode);
      return;
    }

    try {
      const storedMode = parseRolloutMode(
        window.localStorage.getItem(STORAGE_KEY),
      );
      if (storedMode) setModeState(storedMode);
    } catch {
      // Keep the server-provided release mode.
    }
  }, [allowClientOverride, setMode]);

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
