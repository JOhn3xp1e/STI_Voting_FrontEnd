"use client";

import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import { formatDay, type ElectionForm } from "@/lib/elections";
import { cn } from "@/lib/utils";

import { cardClassName, ctaButtonClassName, outlineButtonClassName } from "./create-election-ui";

interface SummaryPanelProps {
  form: ElectionForm;
  bannerUrl: string | null;
  eligible: number;
  /** Header badge: "Draft", or "Draft · ELC-00016" when editing. */
  badge: string;
  secondaryLabel: string;
  onSecondary: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  /** Which button is waiting for the API, if any. */
  busy: "secondary" | "primary" | null;
  error: string | null;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-7.25 items-center justify-between gap-4">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-[0.6875rem] text-foreground">{children}</dd>
    </div>
  );
}

/** Right-hand card: live preview of the election plus the step's buttons. */
export function SummaryPanel({
  form,
  bannerUrl,
  eligible,
  badge,
  secondaryLabel,
  onSecondary,
  primaryLabel,
  onPrimary,
  busy,
  error,
}: SummaryPanelProps) {
  return (
    <section aria-labelledby="summary-heading" className={cardClassName}>
      <header className="flex h-13.75 items-center justify-between gap-3 border-b border-[#e2e8f0] px-5 dark:border-border">
        <h2 id="summary-heading" className="font-mono text-[0.6875rem] font-semibold tracking-[0.16em] text-foreground uppercase">
          Summary
        </h2>
        <span className="inline-flex h-5.5 items-center rounded-[0.1875rem] border border-[#d5dbe3] px-2 font-mono text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase dark:border-border">
          {badge}
        </span>
      </header>

      <div className="px-5 pt-4.5 pb-5">
        {/* Banner preview */}
        <div
          className={cn("relative flex h-27.5 flex-col justify-end overflow-hidden rounded-[0.25rem] bg-brand-blue bg-cover bg-center px-3.5 pb-4")}
          style={bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : undefined}
        >
          {bannerUrl ? <span aria-hidden className="absolute inset-0 bg-linear-to-t from-brand-navy/80 via-brand-navy/30 to-transparent" /> : null}
          <p className="relative font-mono text-[0.625rem] tracking-[0.06em] text-brand-gold uppercase">{form.category}</p>
          <p className="relative mt-1 truncate text-[1.125rem] leading-6 font-semibold text-white">{form.title.trim() || "Untitled election"}</p>
        </div>

        <dl className="mt-2">
          <Row label="Term">{form.termId ?? "—"}</Row>
          <Row label="Voting window">
            {form.opensAt && form.closesAt ? (
              <>
                {formatDay(form.opensAt)} <span aria-label="to">→</span> {formatDay(form.closesAt)}
              </>
            ) : (
              "Not set"
            )}
          </Row>
          <Row label="Eligible voters">{form.termId ? eligible.toLocaleString() : "—"}</Row>
          <Row label="Positions">0 — add in step 3</Row>
          <Row label="Admins">0</Row>
        </dl>

        <div className="mt-1.5 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onSecondary} disabled={busy !== null} className={cn(outlineButtonClassName, "justify-start")}>
            {busy === "secondary" ? <LoaderCircle aria-hidden className="mr-2 size-3.5 animate-spin" /> : null}
            {secondaryLabel}
          </button>
          <button type="button" onClick={onPrimary} disabled={busy !== null} className={ctaButtonClassName}>
            {busy === "primary" ? <LoaderCircle aria-hidden className="mr-2 size-3.5 animate-spin" /> : null}
            <span className="truncate">{primaryLabel}</span>
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-[0.25rem] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[0.75rem] leading-4.5 text-destructive">
            {error}
          </p>
        ) : null}

        <p className="mt-4 text-[0.75rem] leading-4 text-muted-foreground">
          Voters, passcodes and OTP emails are generated after the election is created.
        </p>
      </div>
    </section>
  );
}
