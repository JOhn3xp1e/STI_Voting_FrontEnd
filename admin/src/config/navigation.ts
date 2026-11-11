import { BriefcaseBusiness, CalendarDays, Flag, LayoutDashboard, SquareCheck, Users, type LucideIcon } from "lucide-react";

/**
 * Dashboard sidebar navigation.
 *
 * Every `href` points at a route that exists. Routes whose modules have not
 * been built yet render an empty workspace (see `app/(dashboard)`).
 */

export interface NavLink {
  type: "link";
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Expandable entry (e.g. an election) with nested links. */
export interface NavGroup {
  type: "group";
  id: string;
  label: string;
  /** Short status pill shown next to the label, e.g. "LIVE". */
  badge?: string;
  children: NavLink[];
}

export type NavItem = NavLink | NavGroup;

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const DASHBOARD_HOME = "/dashboard";

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "main",
    label: "Main",
    items: [
      { type: "link", id: "dashboard", label: "Dashboard", href: DASHBOARD_HOME, icon: LayoutDashboard },
      { type: "link", id: "elections", label: "Elections", href: "/elections", icon: SquareCheck },
    ],
  },
  {
    id: "academic",
    label: "Academic",
    items: [
      { type: "link", id: "terms", label: "Terms", href: "/terms", icon: CalendarDays },
      { type: "link", id: "programs", label: "Programs & Careers", href: "/programs", icon: BriefcaseBusiness },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [{ type: "link", id: "students", label: "Students", href: "/students", icon: Users }],
  },
  {
    id: "my-elections",
    label: "My elections",
    items: [
      {
        type: "group",
        id: "csc-elections",
        label: "CSC Elections",
        badge: "LIVE",
        children: [
          { type: "link", id: "csc-metrics", label: "Metrics", href: "/elections/csc/metrics", icon: LayoutDashboard },
          { type: "link", id: "csc-party-lists", label: "Party lists", href: "/elections/csc/party-lists", icon: Flag },
          { type: "link", id: "csc-candidates", label: "Candidates", href: "/elections/csc/candidates", icon: Users },
        ],
      },
    ],
  },
];

/** Account pages reached from the profile menus. */
export const ACCOUNT_LINKS = {
  profile: "/account/profile",
  settings: "/account/settings",
} as const;

/**
 * Header appearance: `hero` is the dark navy gradient banner (Dashboard),
 * `plain` the white inner-page header (everything else).
 */
export type HeaderTheme = "hero" | "plain";

interface PageMetaConfig {
  title: string;
  /** Short context shown beside the title. `{firstName}` is replaced with the admin's first name. */
  description?: string;
  /** Applies to this exact route only; nested routes always default to `plain`. */
  headerTheme?: HeaderTheme;
}

/** Resolved header content for the current route. */
export interface PageMeta {
  title: string;
  description?: string;
  headerTheme: HeaderTheme;
}

const PAGE_META: Record<string, PageMetaConfig> = {
  [DASHBOARD_HOME]: {
    title: "Admin Dashboard",
    description: "Welcome back, {firstName}. Here's what's happening this term.",
    headerTheme: "hero",
  },
  "/elections": { title: "Elections", description: "Election schedules and settings" },
  "/terms": { title: "Terms", description: "School years and enrollment terms" },
  "/programs": { title: "Programs & Careers", description: "Academic programs and career tracks" },
  "/students": { title: "Students" },
  "/elections/csc/metrics": { title: "Election Metrics", description: "CSC Elections" },
  "/elections/csc/party-lists": { title: "Party Lists", description: "CSC Elections" },
  "/elections/csc/candidates": { title: "Candidates", description: "CSC Elections" },
  [ACCOUNT_LINKS.profile]: { title: "Profile", description: "Your admin account" },
  [ACCOUNT_LINKS.settings]: { title: "Account settings", description: "Your admin account" },
};

/** Title used when no configured route matches. */
const FALLBACK_TITLE = "Admin Portal";

/**
 * Header content for `pathname`. An exact match uses its own config; a nested
 * route (e.g. `/students/123`) borrows the title of its closest configured
 * ancestor but always gets the `plain` header unless configured itself.
 */
export function getPageMeta(pathname: string, firstName: string): PageMeta {
  const exact = PAGE_META[pathname];
  const config =
    exact ??
    Object.keys(PAGE_META)
      .filter((route) => pathname.startsWith(`${route}/`))
      .sort((a, b) => b.length - a.length)
      .map((route) => PAGE_META[route])[0];

  return {
    title: config?.title ?? FALLBACK_TITLE,
    description: config?.description?.replace("{firstName}", firstName),
    headerTheme: exact?.headerTheme ?? "plain",
  };
}

/** All links, flattened (group children included). */
function allLinks(): NavLink[] {
  return NAV_SECTIONS.flatMap((section) =>
    section.items.flatMap((item) => (item.type === "group" ? item.children : [item])),
  );
}

/**
 * `href` of the nav link matching `pathname`. The longest matching prefix wins,
 * so `/elections/csc/metrics` activates "Metrics", not "Elections".
 */
export function getActiveHref(pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of allLinks()) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}

/** `id` of the group containing the link `href`, if any. */
export function findGroupIdOf(href: string | null): string | null {
  if (!href) return null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.type === "group" && item.children.some((child) => child.href === href)) return item.id;
    }
  }
  return null;
}

/** Sections containing only the items whose label matches `query` (case-insensitive). */
export function filterNavSections(sections: NavSection[], query: string): NavSection[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return sections;

  const matches = (label: string) => label.toLowerCase().includes(needle);

  return sections
    .map((section) => ({
      ...section,
      items: section.items.flatMap<NavItem>((item) => {
        if (item.type === "link") return matches(item.label) ? [item] : [];
        // A matching group keeps all its links; otherwise keep only matching links.
        if (matches(item.label)) return [item];
        const children = item.children.filter((child) => matches(child.label));
        return children.length ? [{ ...item, children }] : [];
      }),
    }))
    .filter((section) => section.items.length > 0);
}

/** First navigable link in `sections` (used by Enter in the sidebar search). */
export function firstLink(sections: NavSection[]): NavLink | null {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.type === "link") return item;
      if (item.children[0]) return item.children[0];
    }
  }
  return null;
}
