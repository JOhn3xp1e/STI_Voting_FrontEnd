"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Lets a page replace its header subtitle with live data (e.g. the Terms page
 * shows the current term). Scoped to the pathname that set it, so it never
 * leaks onto the next page.
 */

interface Override {
  pathname: string;
  text: string;
}

interface PageDescriptionContextValue {
  override: Override | null;
  setOverride: (update: (current: Override | null) => Override | null) => void;
}

const PageDescriptionContext = createContext<PageDescriptionContextValue | null>(null);

export function PageDescriptionProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<Override | null>(null);
  return <PageDescriptionContext.Provider value={{ override, setOverride }}>{children}</PageDescriptionContext.Provider>;
}

/** Sets the header subtitle for the current page while mounted; `null` keeps the default. */
export function usePageDescription(text: string | null) {
  const context = useContext(PageDescriptionContext);
  const pathname = usePathname();
  const setOverride = context?.setOverride;

  useEffect(() => {
    if (!setOverride || text === null) return;
    setOverride(() => ({ pathname, text }));
    return () => setOverride((current) => (current?.pathname === pathname ? null : current));
  }, [setOverride, pathname, text]);
}

/** The subtitle a page set for `pathname`, if any. */
export function usePageDescriptionOverride(pathname: string): string | null {
  const override = useContext(PageDescriptionContext)?.override;
  return override && override.pathname === pathname ? override.text : null;
}
