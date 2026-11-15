import { Briefcase, Calendar, ChartColumn, Flag, LayoutDashboard, Settings, SquareCheck, Users, type LucideIcon } from "lucide-react";

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

/** An election's state in the sidebar: sets the square's colour and the pill. */
export type NavGroupStatus = "live" | "upcoming";

/** Expandable entry (e.g. an election) with nested links. */
export interface NavGroup {
  type: "group";
  id: string;
  label: string;
  /** "live": gold square + gold LIVE pill; "upcoming": blue square + grey UPCOMING pill. */
  status?: NavGroupStatus;
  children: NavLink[];
}

export type NavItem = NavLink | NavGroup;

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  /** Sits tight under the previous section, as its sub-list (MY ELECTIONS under MAIN). */
  attached?: boolean;
}

/** The three pages every election has in the sidebar. */
function electionLinks(slug: string): NavLink[] {
  return [
    { type: "link", id: `${slug}-metrics`, label: "Metrics", href: `/elections/${slug}/metrics`, icon: ChartColumn },
    { type: "link", id: `${slug}-party-lists`, label: "Party lists", href: `/elections/${slug}/party-lists`, icon: Flag },
    { type: "link", id: `${slug}-candidates`, label: "Candidates", href: `/elections/${slug}/candidates`, icon: Users },
  ];
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
    id: "my-elections",
    label: "My elections",
    attached: true,
    items: [
      { type: "group", id: "csc-elections", label: "CSC Elections", status: "live", children: electionLinks("csc") },
    ],
  },
  {
    id: "academic",
    label: "Academic",
    items: [
      { type: "link", id: "terms", label: "Terms", href: "/terms", icon: Calendar },
      { type: "link", id: "programs", label: "Programs & Careers", href: "/programs", icon: Briefcase },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [{ type: "link", id: "students", label: "Students", href: "/students", icon: Users }],
  },
  {
    id: "system",
    label: "System",
    items: [{ type: "link", id: "settings", label: "Settings", href: "/settings", icon: Settings }],
  },
];

/** Portal-wide settings (super admins): one route per tab. */
export const SETTINGS_LINKS = {
  email: "/settings/email",
  security: "/settings/security",
  admins: "/settings/admins",
} as const;

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
  /** `false` hides the hairline under the `plain` header (exact route only). */
  headerDivider?: boolean;
}

/** Resolved header content for the current route. */
export interface PageMeta {
  title: string;
  description?: string;
  headerTheme: HeaderTheme;
  headerDivider: boolean;
}

const PAGE_META: Record<string, PageMetaConfig> = {
  [DASHBOARD_HOME]: {
    title: "Admin Dashboard",
    description: "Welcome back, {firstName}. Here's what's happening this term.",
    headerTheme: "hero",
  },
  "/elections": { title: "Elections", headerDivider: false },
  "/elections/new": { title: "Elections/Create Election", headerDivider: false },
  "/terms": { title: "Terms", description: "School terms" },
  "/programs": { title: "Programs & careers" },
  "/students": { title: "Students" },
  "/elections/csc/metrics": { title: "Election Metrics", description: "CSC Elections" },
  "/elections/csc/party-lists": { title: "Party Lists", description: "CSC Elections" },
  "/elections/csc/candidates": { title: "Candidates", description: "CSC Elections" },
  "/settings": { title: "Settings", headerDivider: false },
  [SETTINGS_LINKS.email]: { title: "Settings", headerDivider: false },
  [SETTINGS_LINKS.security]: { title: "Settings", headerDivider: false },
  [SETTINGS_LINKS.admins]: { title: "Settings", headerDivider: false },
  [ACCOUNT_LINKS.profile]: { title: "Profile", description: "Your admin account" },
  [ACCOUNT_LINKS.settings]: { title: "Account settings", description: "Your admin account" },
};

/** Routes with a dynamic segment, e.g. `/elections/ELC-00016/edit`. */
const PAGE_META_PATTERNS: { pattern: RegExp; config: PageMetaConfig }[] = [
  { pattern: /^\/elections\/[^/]+\/edit$/, config: { title: "Elections/Edit Election", headerDivider: false } },
];

/** Title used when no configured route matches. */
const FALLBACK_TITLE = "Admin Portal";

/**
 * Header content for `pathname`. An exact match uses its own config; a nested
 * route (e.g. `/students/123`) borrows the title of its closest configured
 * ancestor but always gets the `plain` header unless configured itself.
 */
export function getPageMeta(pathname: string, firstName: string): PageMeta {
  const exact = PAGE_META[pathname] ?? PAGE_META_PATTERNS.find((p) => p.pattern.test(pathname))?.config;
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
    headerDivider: exact?.headerDivider ?? true,
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

/** Groups shown expanded on first load: the live elections. */
export function defaultOpenGroupIds(): string[] {
  return NAV_SECTIONS.flatMap((section) => section.items).flatMap((item) =>
    item.type === "group" && item.status === "live" ? [item.id] : [],
  );
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
