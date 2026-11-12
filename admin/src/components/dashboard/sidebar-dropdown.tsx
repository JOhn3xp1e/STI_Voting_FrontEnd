"use client";

import { useId, useState, type CSSProperties } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown } from "lucide-react";

import type { NavGroup } from "@/config/navigation";
import { cn } from "@/lib/utils";

import { SidebarNavItem, navRowClassName } from "./sidebar-nav-item";

interface SidebarDropdownProps {
  group: NavGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeHref: string | null;
  onNavigate?: () => void;
}

const EASE_OUT = "ease-[cubic-bezier(0.22,1,0.36,1)]";

/** Submenu row height (`h-9.5`) and the first row's centre below the stem top (`pt-0.5` + half a row), in rem. */
const ROW_HEIGHT = 2.375;
const ROW_CENTER_OFFSET = 0.125 + ROW_HEIGHT / 2;

/*
 * Open / close choreography. Base UI marks the panel with `data-starting-style`
 * on the first frame of opening and `data-ending-style` while closing; the
 * children below transition out of / into those states:
 *   opening: height grows → stem draws downward → ticks and links fade in, staggered
 *   closing: everything retracts together (no delays) while the height collapses
 */
const panelStart = "group-data-starting-style/panel:opacity-0 group-data-ending-style/panel:opacity-0";
const closeFast = "group-data-ending-style/panel:delay-0 group-data-ending-style/panel:duration-200";

/** Where the shared highlight sits, and whether it is shown. */
interface IndicatorState {
  index: number;
  visible: boolean;
  /** Bumped each time the highlight re-appears, remounting it so it fades in in place instead of sliding from a stale row. */
  generation: number;
}

/**
 * Tracks the shared active highlight from the route-derived `activeIndex`
 * (-1 when no child page is active). Adjusted during render, so the highlight
 * moves in the same render that changes the active row.
 */
function useActiveIndicator(activeIndex: number): IndicatorState {
  const [state, setState] = useState<IndicatorState>({
    index: Math.max(activeIndex, 0),
    visible: activeIndex >= 0,
    generation: 0,
  });

  let next = state;
  if (activeIndex >= 0 && !state.visible) {
    next = { index: activeIndex, visible: true, generation: state.generation + 1 };
  } else if (activeIndex >= 0 && activeIndex !== state.index) {
    next = { ...state, index: activeIndex };
  } else if (activeIndex < 0 && state.visible) {
    // Fade out where it is.
    next = { ...state, visible: false };
  }
  if (next !== state) setState(next);

  return next;
}

/**
 * Expandable election entry. The panel animates its height (via Base UI's
 * `--collapsible-panel-height`); a tree line draws down to the nested links,
 * and one shared white highlight slides between them to follow the active route.
 */
/** Square + pill colours per election status. */
const STATUS_STYLES = {
  live: { label: "LIVE", square: "bg-brand-gold", pill: "bg-brand-gold text-brand-navy" },
  upcoming: {
    label: "UPCOMING",
    square: "bg-brand-blue dark:bg-[#7aa7e6]",
    pill: "bg-[#e2e8f0] text-[#64748b] dark:bg-white/10 dark:text-shell-item",
  },
} as const;

export function SidebarDropdown({ group, open, onOpenChange, activeHref, onNavigate }: SidebarDropdownProps) {
  const labelId = useId();
  const isLive = group.status === "live";
  const status = group.status ? STATUS_STYLES[group.status] : null;

  const activeIndex = group.children.findIndex((child) => child.href === activeHref);
  const indicator = useActiveIndicator(activeIndex);

  // Dark trail along the stem, from the top down to the middle of the active row.
  // Rows are a fixed 2.375rem tall, so the trail length is a simple ratio of the stem.
  const rowCenter = (index: number) => ROW_CENTER_OFFSET + index * ROW_HEIGHT;
  const trailScale = indicator.visible ? rowCenter(indicator.index) / rowCenter(group.children.length - 1) : 0;

  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger
        className={cn(
          navRowClassName,
          "cursor-pointer gap-1 pr-1 text-left font-semibold text-sidebar-foreground hover:bg-shell-surface/55",
        )}
      >
        {/* Status square: gold (live, with a soft ping) or blue (upcoming). */}
        <span aria-hidden className="relative flex size-3.5 shrink-0 items-center justify-center">
          {isLive ? (
            <span className="absolute size-2 animate-ping rounded-[2px] bg-brand-gold/60 [animation-duration:2.4s] motion-reduce:hidden" />
          ) : null}
          <span className={cn("relative size-2 rounded-[2px]", status?.square ?? "bg-brand-gold")} />
        </span>
        <span id={labelId} className="ml-1 min-w-0 flex-1 truncate">
          {group.label}
        </span>
        {status ? (
          <span
            className={cn(
              "shrink-0 rounded-[0.25rem] py-px font-mono leading-4",
              isLive ? "px-1.5 text-[0.625rem] font-semibold tracking-wider" : "px-1 text-[0.5625rem] font-medium tracking-normal",
              status.pill,
            )}
          >
            {status.label}
          </span>
        ) : null}
        <ChevronDown
          aria-hidden
          className={cn(
            "ml-0.5 size-4 shrink-0 -rotate-90 text-shell-item transition-[rotate,color] duration-350",
            EASE_OUT,
            "group-hover/nav:text-sidebar-foreground group-data-panel-open/nav:rotate-0 motion-reduce:transition-none",
          )}
        />
      </Collapsible.Trigger>

      <Collapsible.Panel
        className={cn(
          "group/panel h-(--collapsible-panel-height) overflow-hidden",
          "transition-[height,opacity] duration-350",
          EASE_OUT,
          "data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0",
          "data-ending-style:duration-250 motion-reduce:transition-none",
        )}
      >
        <ul aria-labelledby={labelId} className="relative flex flex-col pt-0.5">
          {/* Vertical stem from the parent row to the middle of the last link; draws downward on open. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 bottom-[1.1875rem] left-4.75 w-px origin-top bg-shell-label/45",
              "transition-transform duration-450 delay-50",
              EASE_OUT,
              "group-data-starting-style/panel:scale-y-0 group-data-ending-style/panel:scale-y-0",
              closeFast,
              "motion-reduce:transition-none",
            )}
          />

          {/* Active trail: the stem turns dark down to the selected link, gliding up/down as the selection moves. */}
          <span
            aria-hidden
            style={{ transform: `scaleY(${trailScale})` }}
            className={cn(
              "pointer-events-none absolute top-0 bottom-[1.1875rem] left-4.75 w-px origin-top bg-sidebar-foreground",
              "transition-[transform,scale] duration-450 delay-50",
              EASE_OUT,
              "group-data-starting-style/panel:scale-y-0 group-data-ending-style/panel:scale-y-0",
              closeFast,
              "motion-reduce:transition-none",
            )}
          />

          {/* Shared active highlight: one white card that slides to the active link. */}
          <span
            key={indicator.generation}
            aria-hidden
            style={{ transform: `translate3d(0, ${indicator.index * 100}%, 0)` }}
            className={cn(
              "pointer-events-none absolute top-0.5 right-0 left-7.5 h-9.5 rounded-lg bg-shell-surface",
              "shadow-[0_1px_2px_rgb(15_23_42/0.06),0_4px_12px_-6px_rgb(15_23_42/0.12)] dark:shadow-none",
              "transition-[transform,opacity] duration-450 starting:opacity-0",
              EASE_OUT,
              indicator.visible ? "opacity-100" : "opacity-0 duration-200",
              panelStart,
              "group-data-ending-style/panel:duration-200 motion-reduce:transition-none",
            )}
          />

          {group.children.map((child, index) => (
            <li key={child.id} style={{ "--i": index } as CSSProperties} className="relative pl-7.5">
              {/* Horizontal tick off the stem; extends once the stem has reached it. */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-1/2 left-4.75 h-px w-2.5 origin-left bg-shell-label/45",
                  "transition-[scale,opacity] duration-300 delay-[calc(160ms_+_var(--i)*70ms)]",
                  EASE_OUT,
                  "group-data-starting-style/panel:scale-x-0 group-data-ending-style/panel:scale-x-0",
                  panelStart,
                  closeFast,
                  "motion-reduce:transition-none",
                )}
              />
              {/* Active tick: drawn outward in dark once the trail reaches this row. */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-1/2 left-4.75 h-px w-2.5 origin-left bg-sidebar-foreground",
                  "transition-[scale] starting:scale-x-0",
                  EASE_OUT,
                  index === activeIndex ? "scale-x-100 delay-200 duration-300" : "scale-x-0 duration-150",
                  "group-data-starting-style/panel:scale-x-0 group-data-ending-style/panel:scale-x-0",
                  closeFast,
                  "motion-reduce:transition-none",
                )}
              />
              <div
                className={cn(
                  "transition-[opacity,translate] duration-350 delay-[calc(90ms_+_var(--i)*60ms)]",
                  EASE_OUT,
                  panelStart,
                  "group-data-starting-style/panel:-translate-y-1 group-data-ending-style/panel:-translate-y-1",
                  closeFast,
                  "motion-reduce:transition-none",
                )}
              >
                <SidebarNavItem item={child} active={index === activeIndex} onNavigate={onNavigate} sharedHighlight />
              </div>
            </li>
          ))}
        </ul>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
