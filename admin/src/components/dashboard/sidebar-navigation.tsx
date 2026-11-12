import type { NavSection } from "@/config/navigation";
import { cn } from "@/lib/utils";

import { SidebarDropdown } from "./sidebar-dropdown";
import { SidebarNavItem } from "./sidebar-nav-item";

interface SidebarNavigationProps {
  id: string;
  sections: NavSection[];
  activeHref: string | null;
  isGroupOpen: (groupId: string) => boolean;
  onGroupOpenChange: (groupId: string, open: boolean) => void;
  onNavigate?: () => void;
  /** Search text that produced `sections`; shown in the empty state. */
  query: string;
  className?: string;
}

/** Labelled navigation sections (MAIN, PEOPLE, MY ELECTIONS). */
export function SidebarNavigation({
  id,
  sections,
  activeHref,
  isGroupOpen,
  onGroupOpenChange,
  onNavigate,
  query,
  className,
}: SidebarNavigationProps) {
  return (
    <nav id={id} aria-label="Main navigation" className={cn("flex flex-col gap-5", className)}>
      {sections.length === 0 ? (
        <p role="status" className="px-2.5 py-6 text-center text-[0.8125rem] text-brand-muted dark:text-shell-item">
          No pages match “{query.trim()}”.
        </p>
      ) : (
        sections.map((section, index) => (
          <section
            key={section.id}
            aria-labelledby={`${id}-${section.id}`}
            // An attached section (MY ELECTIONS) hangs right under the one before it.
            className={cn(section.attached && index > 0 && "-mt-4")}
          >
            <h2
              id={`${id}-${section.id}`}
              className={cn(
                "px-2.5 font-mono text-[0.625rem] font-medium tracking-[0.16em] text-shell-label uppercase",
                section.attached ? "mb-0 leading-3" : "mb-2",
              )}
            >
              {section.label}
            </h2>
            <ul className="flex flex-col gap-1">
              {section.items.map((item) => (
                <li key={item.id}>
                  {item.type === "link" ? (
                    <SidebarNavItem item={item} active={activeHref === item.href} onNavigate={onNavigate} />
                  ) : (
                    <SidebarDropdown
                      group={item}
                      open={isGroupOpen(item.id)}
                      onOpenChange={(open) => onGroupOpenChange(item.id, open)}
                      activeHref={activeHref}
                      onNavigate={onNavigate}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </nav>
  );
}
