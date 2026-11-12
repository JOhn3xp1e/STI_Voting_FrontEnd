import Link from "next/link";
import {
  Bell,
  Briefcase,
  Calendar,
  Plus,
  Shield,
  SquareCheck,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";

import { ACCOUNT_LINKS } from "@/config/navigation";
import { cn } from "@/lib/utils";

/*
 * Dashboard home: app shortcuts and the ongoing elections.
 * Design only for now — every value below is static placeholder content.
 */

interface AppShortcut {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Shows the gold "+" badge (the app creates something). */
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
          href: "/elections",
          icon: SquareCheck,
          creates: true,
        },
        {
          id: "voters",
          title: "Voters & passcodes",
          description: "Generate from students",
          href: "/elections",
          icon: Shield,
        },
        {
          id: "otp-emails",
          title: "OTP emails",
          description: "Send login codes",
          href: "/elections",
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
          href: "/terms",
          icon: Calendar,
          creates: true,
        },
        {
          id: "programs",
          title: "Programs & careers",
          description: "TER and SHS · 2 careers",
          href: "/programs",
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
          href: "/students",
          icon: Users,
        },
        {
          id: "settings",
          title: "Settings",
          description: "Email, branding",
          href: ACCOUNT_LINKS.settings,
          icon: Sun,
        },
      ],
    },
  ],
];

interface OngoingElection {
  id: string;
  title: string;
  termId: string;
  scope: string;
  href: string;
}

const ONGOING_ELECTIONS: OngoingElection[] = [
  {
    id: "ELC-00001",
    title: "CSC Elections 2025–2026",
    termId: "TRM-00004",
    scope: "Council",
    href: "/elections/csc/metrics",
  },
];

const labelClassName = "font-mono text-[0.625rem] leading-3.5 font-medium tracking-[0.14em] text-muted-foreground uppercase";

function AppCard({ app }: { app: AppShortcut }) {
  const Icon = app.icon;

  return (
    <Link
      href={app.href}
      className={cn(
        "group/app relative flex size-37 flex-col rounded-[0.375rem] border border-[#e2e8f0] bg-card p-3.5 outline-none dark:border-border",
        "shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-[translate,border-color,box-shadow] duration-300 ease-out",
        "hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-[0_12px_24px_-16px_rgb(15_76_158/0.45)]",
        "focus-visible:border-brand-blue/50 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand-blue)_22%,transparent)]",
        "active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      )}
    >
      <span className="pr-7 text-[0.875rem] leading-4 font-semibold text-brand-navy dark:text-foreground">
        {app.title}
      </span>
      <span className="mt-0.75 pr-1 text-[0.71875rem] leading-3.5 text-muted-foreground">{app.description}</span>

      {app.creates ? (
        <span
          aria-hidden
          className="absolute top-2.75 right-3.25 flex size-4.5 items-center justify-center rounded-[0.25rem] bg-brand-gold text-brand-navy shadow-[0_3px_8px_-5px_rgb(180_130_0/0.9)] transition-transform duration-300 ease-out group-hover/app:scale-110 motion-reduce:transition-none"
        >
          <Plus className="size-3" strokeWidth={2.6} />
        </span>
      ) : null}

      <Icon
        aria-hidden
        strokeWidth={1.75}
        className="mt-auto size-5 text-brand-blue dark:text-[color-mix(in_oklab,var(--color-brand-blue)_45%,white)]"
      />
    </Link>
  );
}

function AppGroupSection({ group }: { group: AppGroup }) {
  const headingId = `apps-${group.id}`;

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className={cn(labelClassName, "mb-2.5")}>
        {group.label}
      </h3>
      <ul className="flex flex-wrap gap-3">
        {group.apps.map((app) => (
          <li key={app.id}>
            <AppCard app={app} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ElectionCard({ election }: { election: OngoingElection }) {
  return (
    <Link
      href={election.href}
      className={cn(
        "group/election block w-full max-w-[23.625rem] overflow-hidden rounded-[0.375rem] border border-[#e2e8f0] bg-card outline-none dark:border-border",
        "shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-[translate,border-color,box-shadow] duration-300 ease-out",
        "hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-[0_16px_32px_-20px_rgb(15_76_158/0.5)]",
        "focus-visible:border-brand-blue/50 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand-blue)_22%,transparent)]",
        "active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      )}
    >
      {/* Banner image slot — intentionally empty until election banners are wired up. */}
      <div className="relative h-35 bg-[color-mix(in_oklab,var(--color-brand-muted)_14%,white)] dark:bg-white/6">
        <span className="absolute top-3.5 left-3.5 inline-flex h-5 items-center rounded-full bg-brand-gold px-3.5 font-mono text-[0.625rem] font-semibold tracking-[0.1em] text-brand-navy uppercase">
          Ongoing
        </span>
      </div>

      <div className="px-4.5 pt-3.5 pb-4">
        <h3 className="truncate text-base leading-5.5 font-semibold text-brand-navy dark:text-foreground">
          {election.title}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="font-mono text-[0.6875rem] text-muted-foreground">
            {election.id} <span aria-hidden>·</span> {election.termId}
          </p>
          <span className="inline-flex h-5 items-center rounded-[0.1875rem] border border-[#e2e8f0] px-2 font-mono text-[0.625rem] font-semibold tracking-[0.06em] text-brand-navy uppercase dark:border-border dark:text-foreground">
            {election.scope}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Dashboard workspace (below the hero header). */
export function DashboardHome() {
  return (
    <div className="px-4 pt-2 pb-16 sm:px-6 lg:px-8">
      <section aria-labelledby="apps-heading">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="apps-heading"
            className="font-mono text-[0.6875rem] leading-3.5 font-medium tracking-[0.1em] text-foreground uppercase"
          >
            Apps
          </h2>
          <button
            type="button"
            className="rounded-sm font-mono text-[0.6875rem] leading-3.5 text-brand-blue outline-none transition-colors hover:text-brand-navy hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-blue/40 dark:text-[color-mix(in_oklab,var(--color-brand-blue)_45%,white)] dark:hover:text-brand-white"
          >
            Edit layout
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-4">
          {APP_ROWS.map((row, index) => (
            <div key={index} className="flex flex-wrap gap-x-6 gap-y-4">
              {row.map((group) => (
                <AppGroupSection key={group.id} group={group} />
              ))}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="ongoing-heading" className="mt-11 sm:px-6">
        <h2
          id="ongoing-heading"
          className="mb-3.5 font-mono text-[0.6875rem] leading-3.5 font-medium tracking-[0.16em] text-foreground uppercase"
        >
          Ongoing elections
        </h2>
        <ul className="flex flex-wrap gap-4">
          {ONGOING_ELECTIONS.map((election) => (
            <li key={election.id} className="w-full max-w-[23.625rem]">
              <ElectionCard election={election} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
