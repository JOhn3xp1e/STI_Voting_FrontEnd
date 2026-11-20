"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import {
  Bell,
  Briefcase,
  Calendar,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Shield,
  SquareCheck,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useElectionsNav } from "@/components/elections/elections-nav";
import { electionPageHref, SETTINGS_LINKS } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { fetchCareers } from "@/services/programs/programs.service";
import type { Election, ElectionStatus } from "@/types/election.types";

import { OngoingElections } from "./ongoing-elections";
import { menuItemClassName, popupClassName } from "./popup-styles";

/*
 * Dashboard home: app shortcuts and the ongoing elections.
 * Every shortcut opens its page; "Voters & passcodes" and "OTP emails" open an
 * election's settings (asking which election when there are several).
 * "Edit layout" hides or shows shortcuts, remembered in this browser.
 */

/** Where a shortcut goes: a page, or a tab of one election's settings. */
type AppTarget = { kind: "link"; href: string } | { kind: "election"; tab: "voters" | "logins"; statuses: readonly ElectionStatus[] };

interface AppShortcut {
  id: string;
  title: string;
  description: string;
  target: AppTarget;
  icon: LucideIcon;
  /** Shows the gold "+" badge (the shortcut opens a "new …" form). */
  creates?: boolean;
}

interface AppGroup {
  id: string;
  label: string;
  apps: AppShortcut[];
}

/** Each inner array is one row of groups. */
const APP_ROWS: AppGroup[][] = [
  [
    {
      id: "elections",
      label: "Elections",
      apps: [
        {
          id: "create-election",
          title: "Create election",
          description: "Banner, filters, admins",
          target: { kind: "link", href: "/elections/new" },
          icon: SquareCheck,
          creates: true,
        },
        {
          id: "voters",
          title: "Voters & passcodes",
          description: "Generate from students",
          target: { kind: "election", tab: "voters", statuses: ["Ongoing", "Upcoming", "Draft"] },
          icon: Shield,
        },
        {
          id: "otp-emails",
          title: "OTP emails",
          description: "Send login codes",
          target: { kind: "election", tab: "logins", statuses: ["Ongoing", "Upcoming"] },
          icon: Bell,
        },
      ],
    },
    {
      id: "academic-setup",
      label: "Academic setup",
      apps: [
        {
          id: "terms",
          title: "Terms",
          description: "Create school terms",
          target: { kind: "link", href: "/terms#new" },
          icon: Calendar,
          creates: true,
        },
        {
          id: "programs",
          title: "Programs & careers",
          description: "Careers, programs, strands",
          target: { kind: "link", href: "/programs#new-program" },
          icon: Briefcase,
          creates: true,
        },
      ],
    },
  ],
  [
    {
      id: "people",
      label: "People",
      apps: [
        {
          id: "students",
          title: "Manage Students",
          description: "Enroll in current term",
          target: { kind: "link", href: "/students" },
          icon: Users,
        },
        {
          id: "settings",
          title: "Settings",
          description: "Email, security, admins",
          target: { kind: "link", href: SETTINGS_LINKS.email },
          icon: Sun,
        },
      ],
    },
  ],
];

/* -------------------------------------------------------------------------- */
/*                         Hidden shortcuts (this browser)                    */
/* -------------------------------------------------------------------------- */

const HIDDEN_KEY = "slvp:dashboard-hidden-apps";

function readHidden(): Set<string> {
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeHidden(hidden: Set<string>) {
  try {
    if (hidden.size) window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
    else window.localStorage.removeItem(HIDDEN_KEY);
  } catch {
    // Storage blocked: the layout just isn't remembered.
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Live details                               */
/* -------------------------------------------------------------------------- */

/** "TER, JHS and SHS · 3 careers", from the careers list; `null` until it loads (or if it fails). */
function useCareersSummary(): string | null {
  const [summary, setSummary] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchCareers({ signal: controller.signal })
      .then((careers) => {
        if (careers.length === 0) return setSummary("Add your first career");
        const codes = careers.map((c) => c.code);
        const shown = codes.length > 3 ? `${codes.slice(0, 3).join(", ")} +${codes.length - 3}` : codes.length > 1 ? `${codes.slice(0, -1).join(", ")} and ${codes.at(-1)}` : codes[0];
        setSummary(`${shown} · ${careers.length} ${careers.length === 1 ? "career" : "careers"}`);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return summary;
}

const STATUS_ORDER: Record<ElectionStatus, number> = { Ongoing: 0, Upcoming: 1, Draft: 2, Completed: 3, Cancelled: 4 };

function electionChoices(elections: readonly Election[], statuses: readonly ElectionStatus[]): Election[] {
  return elections
    .filter((e) => statuses.includes(e.status))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
}

const electionTabHref = (election: Election, tab: "voters" | "logins") => `${electionPageHref(election.id, "settings")}#${tab}`;

/* -------------------------------------------------------------------------- */
/*                                    Cards                                   */
/* -------------------------------------------------------------------------- */

const labelClassName = "font-mono text-[0.625rem] leading-3.5 font-medium tracking-[0.14em] text-muted-foreground uppercase";

const cardClassName = cn(
  "group/app relative flex size-37 flex-col rounded-[0.375rem] border border-[#e2e8f0] bg-card p-3.5 text-left outline-none dark:border-border",
  "shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-[translate,border-color,box-shadow,opacity] duration-300 ease-out",
  "focus-visible:border-brand-blue/50 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand-blue)_22%,transparent)]",
  "motion-reduce:transition-none",
);

const liveCardClassName = cn(
  cardClassName,
  "cursor-pointer hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-[0_12px_24px_-16px_rgb(15_76_158/0.45)]",
  "active:translate-y-0 data-popup-open:border-brand-blue/40 motion-reduce:hover:translate-y-0",
);

function CardBody({ app, description, badge }: { app: AppShortcut; description: string; badge: ReactNode }) {
  const Icon = app.icon;
  return (
    <>
      <span className="pr-7 text-[0.875rem] leading-4 font-semibold text-brand-navy dark:text-foreground">{app.title}</span>
      <span key={description} className="mt-0.75 pr-1 text-[0.71875rem] leading-3.5 text-muted-foreground animate-in fade-in duration-300">
        {description}
      </span>
      {badge}
      <Icon aria-hidden strokeWidth={1.75} className="mt-auto size-5 text-brand-blue dark:text-[color-mix(in_oklab,var(--color-brand-blue)_45%,white)]" />
    </>
  );
}

function CreateBadge() {
  return (
    <span
      aria-hidden
      className="absolute top-2.75 right-3.25 flex size-4.5 items-center justify-center rounded-[0.25rem] bg-brand-gold text-brand-navy shadow-[0_3px_8px_-5px_rgb(180_130_0/0.9)] transition-transform duration-300 ease-out group-hover/app:scale-110 motion-reduce:transition-none"
    >
      <Plus className="size-3" strokeWidth={2.6} />
    </span>
  );
}

/** Opens an election's Voters or Voter logins tab: straight there with one election, or a picker with several. */
function ElectionAppCard({ app, target, description }: { app: AppShortcut; target: Extract<AppTarget, { kind: "election" }>; description: string }) {
  const { elections, loaded } = useElectionsNav();
  const choices = electionChoices(elections, target.statuses);
  const body = <CardBody app={app} description={description} badge={app.creates ? <CreateBadge /> : null} />;

  // Not loaded, none to pick, or just one: a plain link.
  if (!loaded || choices.length <= 1) {
    const href = choices.length === 1 ? electionTabHref(choices[0], target.tab) : "/elections";
    const title = loaded && choices.length === 0 ? (target.tab === "logins" ? "Schedule an election first" : "Create an election first") : undefined;
    return (
      <Link href={href} title={title} className={liveCardClassName}>
        {body}
      </Link>
    );
  }

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger aria-label={`${app.title}: pick an election`} className={liveCardClassName}>
        {body}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={6} className="z-50 outline-none">
          <Menu.Popup data-themed className={cn(popupClassName, "w-[min(20rem,calc(100vw-2rem))] p-1.5")}>
            <p className="px-2.5 pt-1.5 pb-2 font-mono text-[0.625rem] font-medium tracking-[0.12em] text-muted-foreground uppercase">{app.title} · pick an election</p>
            {choices.map((election) => (
              <Menu.LinkItem key={election.id} closeOnClick className={cn(menuItemClassName, "h-auto min-h-11 gap-3 py-2")} render={<Link href={electionTabHref(election, target.tab)} />}>
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-full", election.status === "Ongoing" ? "bg-brand-gold" : election.status === "Upcoming" ? "bg-brand-blue" : "bg-[#b8c2cf]")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{election.title}</span>
                  <span className="block font-mono text-[0.65625rem] text-muted-foreground">
                    {election.id} · {election.status}
                  </span>
                </span>
                <ChevronRight aria-hidden />
              </Menu.LinkItem>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function AppCard({ app, description, editing, hidden, onToggle }: { app: AppShortcut; description: string; editing: boolean; hidden: boolean; onToggle: () => void }) {
  // Edit layout: the card toggles whether it's shown.
  if (editing) {
    return (
      <button
        type="button"
        aria-pressed={!hidden}
        aria-label={`${hidden ? "Show" : "Hide"} ${app.title}`}
        onClick={onToggle}
        className={cn(
          cardClassName,
          "cursor-pointer hover:border-brand-blue/40",
          hidden ? "border-dashed opacity-45 shadow-none" : "shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand-blue)_12%,transparent)]",
        )}
      >
        <CardBody
          app={app}
          description={description}
          badge={
            <span
              aria-hidden
              className={cn(
                "absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full transition-[background-color,color,scale] duration-200 group-hover/app:scale-110",
                hidden ? "bg-muted text-muted-foreground" : "bg-brand-blue text-white",
              )}
            >
              {hidden ? <EyeOff className="size-3.5" strokeWidth={2} /> : <Eye className="size-3.5" strokeWidth={2} />}
            </span>
          }
        />
      </button>
    );
  }

  if (app.target.kind === "election") return <ElectionAppCard app={app} target={app.target} description={description} />;

  return (
    <Link href={app.target.href} className={liveCardClassName}>
      <CardBody app={app} description={description} badge={app.creates ? <CreateBadge /> : null} />
    </Link>
  );
}

/** Dashboard workspace (below the hero header). */
export function DashboardHome() {
  const [editing, setEditing] = useState(false);
  // The dashboard only renders in the browser (behind the session check), so storage can be read up front.
  const [hidden, setHidden] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : readHidden()));
  const careersSummary = useCareersSummary();

  function toggle(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeHidden(next);
      return next;
    });
  }

  function reset() {
    const next = new Set<string>();
    writeHidden(next);
    setHidden(next);
  }

  const descriptionOf = (app: AppShortcut) => (app.id === "programs" && careersSummary ? careersSummary : app.description);
  const rows = APP_ROWS.map((row) =>
    row
      .map((group) => ({ ...group, apps: editing ? group.apps : group.apps.filter((app) => !hidden.has(app.id)) }))
      .filter((group) => group.apps.length > 0),
  ).filter((row) => row.length > 0);
  const linkClassName =
    "rounded-sm font-mono text-[0.6875rem] leading-3.5 text-brand-blue outline-none transition-colors hover:text-brand-navy hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-blue/40 dark:text-[color-mix(in_oklab,var(--color-brand-blue)_45%,white)] dark:hover:text-brand-white cursor-pointer";

  return (
    <div className="px-4 pt-2 pb-16 sm:px-6 lg:px-8">
      <section aria-labelledby="apps-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="apps-heading" className="font-mono text-[0.6875rem] leading-3.5 font-medium tracking-[0.1em] text-foreground uppercase">
            Apps
          </h2>
          <div className="flex items-center gap-4">
            {editing && hidden.size ? (
              <button type="button" onClick={reset} className={cn(linkClassName, "text-muted-foreground animate-in fade-in duration-200")}>
                Show all
              </button>
            ) : null}
            <button type="button" onClick={() => setEditing((e) => !e)} aria-pressed={editing} className={cn(linkClassName, editing && "font-semibold")}>
              {editing ? "Done" : "Edit layout"}
            </button>
          </div>
        </div>

        {editing ? (
          <p role="status" className="mt-2 text-[0.78125rem] text-muted-foreground animate-in fade-in slide-in-from-top-1 duration-300">
            Click a shortcut to hide or show it. Only you see this layout, in this browser.
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-4">
          {rows.map((row, index) => (
            <div key={index} className="flex flex-wrap gap-x-6 gap-y-4">
              {row.map((group) => {
                const headingId = `apps-${group.id}`;
                return (
                  <section key={group.id} aria-labelledby={headingId}>
                    <h3 id={headingId} className={cn(labelClassName, "mb-2.5")}>
                      {group.label}
                    </h3>
                    <ul className="flex flex-wrap gap-3">
                      {group.apps.map((app) => (
                        <li key={app.id}>
                          <AppCard app={app} description={descriptionOf(app)} editing={editing} hidden={hidden.has(app.id)} onToggle={() => toggle(app.id)} />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ))}
          {rows.length === 0 ? (
            <p className="text-[0.8125rem] text-muted-foreground">
              Every shortcut is hidden.{" "}
              <button type="button" onClick={reset} className={cn(linkClassName, "font-sans text-[0.8125rem]")}>
                Show them again
              </button>
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="ongoing-heading" className="mt-11 sm:px-6">
        <h2 id="ongoing-heading" className="mb-3.5 font-mono text-[0.6875rem] leading-3.5 font-medium tracking-[0.16em] text-foreground uppercase">
          Ongoing elections
        </h2>
        <OngoingElections />
      </section>
    </div>
  );
}
