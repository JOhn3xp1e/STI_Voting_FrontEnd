"use client";

import { UnderlineTabs } from "@/components/shared/underline-tabs";
import type { TermStatus } from "@/types/term.types";

export type TermTab = "all" | TermStatus;

const TABS: { value: TermTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "current", label: "Current" },
  { value: "upcoming", label: "Upcoming" },
  { value: "ended", label: "Ended" },
];

interface TermTabsProps {
  value: TermTab;
  onChange: (tab: TermTab) => void;
  /** Number of terms per tab, read by screen readers. */
  counts: Record<TermTab, number>;
  className?: string;
}

/** All / Current / Upcoming / Ended. */
export function TermTabs({ value, onChange, counts, className }: TermTabsProps) {
  return (
    <UnderlineTabs
      label="Filter terms by status"
      tabs={TABS.map((tab) => ({ ...tab, description: `${counts[tab.value]} ${counts[tab.value] === 1 ? "term" : "terms"}` }))}
      value={value}
      onChange={onChange}
      className={className}
    />
  );
}
