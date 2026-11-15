"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { fetchElections } from "@/services/elections/elections.service";
import type { Election } from "@/types/election.types";

interface ElectionsNavValue {
  /** Every election, as last loaded. Empty until the first load finishes (or if it fails). */
  elections: readonly Election[];
  /** Loads the list again; call after creating, editing or deleting an election. */
  refresh: () => void;
}

const ElectionsNavContext = createContext<ElectionsNavValue>({ elections: [], refresh: () => {} });

/**
 * The elections shown in the dashboard frame: the sidebar's election groups
 * and the header title on an election's pages. Loaded once for the whole
 * dashboard; if the request fails the sidebar simply has no election groups.
 */
export function ElectionsNavProvider({ children }: { children: ReactNode }) {
  const [elections, setElections] = useState<readonly Election[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchElections({ signal: controller.signal })
      .then(setElections)
      .catch(() => {
        // The Elections page reports load errors; the frame stays usable without the groups.
      });
    return () => controller.abort();
  }, [version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ elections, refresh }), [elections, refresh]);

  return <ElectionsNavContext.Provider value={value}>{children}</ElectionsNavContext.Provider>;
}

export function useElectionsNav(): ElectionsNavValue {
  return useContext(ElectionsNavContext);
}
