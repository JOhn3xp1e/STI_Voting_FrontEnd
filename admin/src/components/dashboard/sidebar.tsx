"use client";

import { useId, useState, type ReactNode, type Ref } from "react";
import { useRouter } from "next/navigation";

import { NAV_SECTIONS, filterNavSections, firstLink } from "@/config/navigation";
import { cn } from "@/lib/utils";
import type { AdminProfile } from "@/types/auth.types";

import { SidebarBrand } from "./sidebar-brand";
import { SidebarNavigation } from "./sidebar-navigation";
import { SidebarProfile } from "./sidebar-profile";
import { SidebarSearch } from "./sidebar-search";

export interface SidebarProps {
  admin: AdminProfile;
  activeHref: string | null;
  /** Expanded state of the election groups, owned by the shell so desktop and drawer agree. */
  openGroups: Readonly<Record<string, boolean>>;
  onGroupOpenChange: (groupId: string, open: boolean) => void;
  searchRef?: Ref<HTMLInputElement>;
  /** Called after any in-sidebar navigation (closes the mobile drawer). */
  onNavigate?: () => void;
  /** Extra control next to the brand card (the drawer's close button). */
  brandAction?: ReactNode;
  className?: string;
}

/** Sidebar contents: brand, search, navigation and the pinned admin profile. */
export function Sidebar({
  admin,
  activeHref,
  openGroups,
  onGroupOpenChange,
  searchRef,
  onNavigate,
  brandAction,
  className,
}: SidebarProps) {
  const router = useRouter();
  const navId = useId();
  const [query, setQuery] = useState("");

  const searching = query.trim().length > 0;
  const sections = filterNavSections(NAV_SECTIONS, query);

  function openFirstMatch() {
    const link = firstLink(sections);
    if (!searching || !link) return;
    setQuery("");
    router.push(link.href);
    onNavigate?.();
  }

  return (
    <div className={cn("flex h-full flex-col bg-sidebar text-sidebar-foreground", className)}>
      <div className="flex flex-col gap-4.5 px-4 pt-5.5">
        <div className="flex items-center gap-2">
          <SidebarBrand role={admin.role} onNavigate={onNavigate} className="min-w-0 flex-1" />
          {brandAction}
        </div>
        <SidebarSearch
          value={query}
          onValueChange={setQuery}
          onSubmit={openFirstMatch}
          inputRef={searchRef}
          controlsId={navId}
        />
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 [scrollbar-width:thin]">
        <SidebarNavigation
          id={navId}
          sections={sections}
          query={query}
          activeHref={activeHref}
          // Matches inside a group stay visible while searching.
          isGroupOpen={(groupId) => searching || (openGroups[groupId] ?? false)}
          onGroupOpenChange={(groupId, open) => {
            if (!searching) onGroupOpenChange(groupId, open);
          }}
          onNavigate={() => {
            setQuery("");
            onNavigate?.();
          }}
        />
      </div>

      <div className="px-4 pt-2 pb-4">
        <SidebarProfile admin={admin} />
      </div>
    </div>
  );
}
