"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { fetchElections } from "@/services/elections/elections.service";
import type { Election } from "@/types/election.types";

interface ElectionsNavValue {
  /** Every election this admin may see (an election admin's own only), as last loaded. Empty until the first load finishes (or if it fails). */
  elections: readonly Election[];
  /** The first load has finished (successfully or not). */
  loaded: boolean;
  /** Loads the list again; call after creating, editing or deleting an election. */
  refresh: () => void;
}

const ElectionsNavContext = createContext<ElectionsNavValue>({ elections: [], loaded: false, refresh: () => {} });

/**
 * The elections shown in the dashboard frame: the sidebar's election groups
 * and the header title on an election's pages. Loaded once for the whole
 * dashboard; if the request fails the sidebar simply has no election groups.
 */
export function ElectionsNavProvider({ children, onlyIds }: { children: ReactNode; onlyIds?: readonly string[] }) {
  const [elections, setElections] = useState<readonly Election[]>([]);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchElections({ signal: controller.signal })
      .then((list) => {
        // The backend already sends an election admin only theirs; this keeps the interface right regardless.
        setElections(onlyIds ? list.filter((e) => onlyIds.includes(e.id)) : list);
        setLoaded(true);
      })
      .catch(() => {
        // The Elections page reports load errors; the frame stays usable without the groups.
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [version, onlyIds]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ elections, loaded, refresh }), [elections, loaded, refresh]);

  return <ElectionsNavContext.Provider value={value}>{children}</ElectionsNavContext.Provider>;
}

export function useElectionsNav(): ElectionsNavValue {
  return useContext(ElectionsNavContext);
}
