import { Briefcase, Calendar, ChartColumn, Flag, LayoutDashboard, Settings, SquareCheck, Sun, Users, type LucideIcon } from "lucide-react";

import type { Election } from "@/types/election.types";

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

/** The pages every election has, in sidebar order. */
const ELECTION_PAGES = [
  { page: "manage", label: "Manage", title: "Manage", icon: ChartColumn },
  { page: "party-lists", label: "Party lists", title: "Party lists", icon: Flag },
  { page: "ballot", label: "Ballot", title: "Ballot", icon: Users },
  { page: "settings", label: "Settings", title: "Election settings", icon: Sun },
] as const;

export type ElectionPage = (typeof ELECTION_PAGES)[number]["page"];

/** e.g. `/elections/ELC-00007/ballot` */
export const electionPageHref = (electionId: string, page: ElectionPage) => `/elections/${encodeURIComponent(electionId)}/${page}`;

function electionLinks(electionId: string): NavLink[] {
  return ELECTION_PAGES.map(({ page, label, icon }) => ({
    type: "link",
    id: `${electionId}-${page}`,
    label,
    href: electionPageHref(electionId, page),
    icon,
  }));
}

export const DASHBOARD_HOME = "/dashboard";

/** The fixed sections. The elections' groups are added by `buildNavSections`. */
const BASE_SECTIONS: NavSection[] = [
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

/** Ongoing elections first, then upcoming ones; each by when voting opens. */
function electionGroups(elections: readonly Election[]): NavGroup[] {
  const byStart = (a: Election, b: Election) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id);
  const toGroup = (status: NavGroupStatus) => (e: Election): NavGroup => ({
    type: "group",
    id: `election-${e.id}`,
    label: e.title,
    status,
    children: electionLinks(e.id),
  });
  return [
    ...elections.filter((e) => e.status === "Ongoing").sort(byStart).map(toGroup("live")),
    ...elections.filter((e) => e.status === "Upcoming").sort(byStart).map(toGroup("upcoming")),
  ];
}

/**
 * The sidebar's sections: the fixed ones, plus a group per ongoing or upcoming
 * election under MAIN. Drafts and finished elections are reached from the Elections page.
 */
export function buildNavSections(elections: readonly Election[]): NavSection[] {
  const groups = electionGroups(elections);
  if (groups.length === 0) return BASE_SECTIONS;
  const [main, ...rest] = BASE_SECTIONS;
  return [main, { id: "my-elections", label: "My elections", attached: true, items: groups }, ...rest];
}

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

/** An election's own pages, e.g. `/elections/ELC-00007/ballot` (and anything nested under them). */
const ELECTION_PAGE_PATTERN = new RegExp(`^/elections/([^/]+)/(${ELECTION_PAGES.map((p) => p.page).join("|")})(?:/|$)`);

/** Title used when no configured route matches. */
const FALLBACK_TITLE = "Admin Portal";

/**
 * Header content for `pathname`. An exact match uses its own config; a nested
 * route (e.g. `/students/123`) borrows the title of its closest configured
 * ancestor but always gets the `plain` header unless configured itself.
 * An election's pages are titled with the election's name (the page's own name
 * until `elections` has loaded).
 */
export function getPageMeta(pathname: string, firstName: string, elections: readonly Election[] = []): PageMeta {
  const electionPage = ELECTION_PAGE_PATTERN.exec(pathname);
  if (electionPage) {
    const electionId = decodeURIComponent(electionPage[1]);
    const election = elections.find((e) => e.id === electionId);
    const pageTitle = ELECTION_PAGES.find((p) => p.page === electionPage[2])!.title;
    // The party list editor has its own title: `/elections/ELC-00007/party-lists/new` or `.../PL-00001`.
    const partyList = /\/party-lists\/([^/]+)$/.exec(pathname);
    if (partyList) return { title: partyList[1] === "new" ? "New party list" : "Edit party list", headerTheme: "plain", headerDivider: false };
    return { title: election?.title ?? pageTitle, headerTheme: "plain", headerDivider: false };
  }

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
function allLinks(sections: NavSection[]): NavLink[] {
  return sections.flatMap((section) =>
    section.items.flatMap((item) => (item.type === "group" ? item.children : [item])),
  );
}

/**
 * `href` of the nav link matching `pathname`. The longest matching prefix wins,
 * so `/elections/ELC-00007/ballot` activates that election's "Ballot", not "Elections".
 */
export function getActiveHref(pathname: string, sections: NavSection[]): string | null {
  let best: string | null = null;
  for (const { href } of allLinks(sections)) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}

/** Groups shown expanded on first load: the live elections. */
export function defaultOpenGroupIds(sections: NavSection[]): string[] {
  return sections.flatMap((section) => section.items).flatMap((item) =>
    item.type === "group" && item.status === "live" ? [item.id] : [],
  );
}

/** `id` of the group containing the link `href`, if any. */
export function findGroupIdOf(href: string | null, sections: NavSection[]): string | null {
  if (!href) return null;
  for (const section of sections) {
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
