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

/* -------------------------------------------------------------------------- */
/*                               Breadcrumb tail                              */
/* -------------------------------------------------------------------------- */

/** Last breadcrumb a page names itself, e.g. the party list being edited ("Partyngina" · "PL-00001"). */
export interface PageCrumb {
  label: string;
  /** Small text after the label, e.g. an id. */
  detail?: string;
}

interface CrumbOverride extends PageCrumb {
  pathname: string;
}

interface PageCrumbContextValue {
  crumb: CrumbOverride | null;
  setCrumb: (update: (current: CrumbOverride | null) => CrumbOverride | null) => void;
}

const PageCrumbContext = createContext<PageCrumbContextValue | null>(null);

export function PageCrumbProvider({ children }: { children: ReactNode }) {
  const [crumb, setCrumb] = useState<CrumbOverride | null>(null);
  return <PageCrumbContext.Provider value={{ crumb, setCrumb }}>{children}</PageCrumbContext.Provider>;
}

/** Names the current page's last breadcrumb while mounted (scoped to its pathname, like usePageDescription). */
export function usePageCrumb(crumb: PageCrumb | null) {
  const setCrumb = useContext(PageCrumbContext)?.setCrumb;
  const pathname = usePathname();
  const label = crumb?.label ?? null;
  const detail = crumb?.detail;

  useEffect(() => {
    if (!setCrumb || label === null) return;
    setCrumb(() => ({ pathname, label, detail }));
  }, [setCrumb, pathname, label, detail]);

  useEffect(() => {
    if (!setCrumb) return;
    return () => setCrumb((current) => (current?.pathname === pathname ? null : current));
  }, [setCrumb, pathname]);
}

/** The last breadcrumb a page set for `pathname`, if any. */
export function usePageCrumbOverride(pathname: string): PageCrumb | null {
  const crumb = useContext(PageCrumbContext)?.crumb;
  return crumb && crumb.pathname === pathname ? crumb : null;
}
