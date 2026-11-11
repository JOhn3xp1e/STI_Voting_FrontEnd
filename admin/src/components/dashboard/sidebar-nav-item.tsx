import Link from "next/link";

import type { NavLink } from "@/config/navigation";
import { cn } from "@/lib/utils";

/** Row styling shared by nav links and the election group trigger. */
export const navRowClassName = cn(
  "group/nav relative flex h-9.5 w-full items-center gap-3 rounded-lg px-2.5 text-sm outline-none select-none",
  "transition-[background-color,color,box-shadow] duration-200 ease-out",
  "focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
);

interface SidebarNavItemProps {
  item: NavLink;
  active: boolean;
  onNavigate?: () => void;
  /**
   * The white active card is drawn by a parent's shared, sliding indicator
   * (election submenus) instead of by this row.
   */
  sharedHighlight?: boolean;
  className?: string;
}

/** Navigation link: icon + label, white card when active. */
export function SidebarNavItem({ item, active, onNavigate, sharedHighlight = false, className }: SidebarNavItemProps) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onNavigate={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        navRowClassName,
        sharedHighlight && "transition-[background-color,color,font-weight] duration-300",
        active
          ? cn(
              "font-semibold text-sidebar-foreground",
              !sharedHighlight &&
                "bg-shell-surface shadow-[0_1px_2px_rgb(15_23_42/0.06),0_4px_12px_-6px_rgb(15_23_42/0.12)] dark:shadow-none",
            )
          : "text-shell-item hover:bg-shell-surface/55 hover:text-sidebar-foreground",
        className,
      )}
    >
      <Icon
        aria-hidden
        strokeWidth={1.75}
        className={cn(
          "size-4.5 shrink-0 transition-colors duration-200",
          // Submenu icons also gain a slightly heavier stroke when selected.
          sharedHighlight && "transition-[color,stroke-width] duration-300 motion-reduce:transition-none",
          active ? "text-sidebar-primary" : "text-shell-item group-hover/nav:text-sidebar-foreground",
          sharedHighlight && active && "[stroke-width:2.1]",
        )}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
