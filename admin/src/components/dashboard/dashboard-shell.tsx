"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { buildNavSections, defaultOpenGroupIds, findGroupIdOf, getActiveHref } from "@/config/navigation";
import { endDashboardEntrance } from "@/lib/dashboard-entrance";
import { cn } from "@/lib/utils";
import type { AdminProfile } from "@/types/auth.types";
import { ProfileDialogProvider } from "@/components/account/profile-dialog";
import { ChatWidget } from "@/components/chat/chat-widget";
import { ElectionsNavProvider, useElectionsNav } from "@/components/elections/elections-nav";

import entrance from "./dashboard-entrance.module.css";
import { DashboardHeader } from "./dashboard-header";
import { PageCrumbProvider, PageDescriptionProvider } from "./page-description";
import { Sidebar } from "./sidebar";

/** Matches Tailwind's `md` breakpoint: persistent sidebar from here up, drawer below. */
const DESKTOP_QUERY = "(min-width: 48rem)";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

interface DashboardShellProps {
  admin: AdminProfile;
  children: ReactNode;
}

/**
 * Admin dashboard frame: fixed sidebar (a drawer on small screens), gradient
 * header, and the page workspace below it.
 */
export function DashboardShell(props: DashboardShellProps) {
  return (
    <ElectionsNavProvider>
      <Shell {...props} />
    </ElectionsNavProvider>
  );
}

function Shell({ admin, children }: DashboardShellProps) {
  const pathname = usePathname();
  const { elections } = useElectionsNav();
  const navSections = useMemo(() => buildNavSections(elections), [elections]);
  const activeHref = getActiveHref(pathname, navSections);

  const [drawerOpen, setDrawerOpen] = useState(false);
  /**
   * Only one election group is expanded at a time (opening one closes the other).
   * `undefined` until the admin (or the route) picks one: then the first live election starts expanded.
   */
  const [groupChoice, setGroupChoice] = useState<string | null | undefined>(undefined);
  const openGroupId = groupChoice === undefined ? (defaultOpenGroupIds(navSections)[0] ?? null) : groupChoice;
  const openGroups = useMemo<Record<string, boolean>>(() => (openGroupId ? { [openGroupId]: true } : {}), [openGroupId]);

  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const drawerSearchRef = useRef<HTMLInputElement>(null);
  const drawerPopupRef = useRef<HTMLDivElement>(null);
  /** Set when the drawer is opened by the `/` shortcut, so it focuses the search. */
  const focusSearchOnOpen = useRef(false);

  // Navigating into an election's page expands that election (route-driven, so
  // it also holds after a refresh or browser back/forward, once the elections have loaded).
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  if (activeHref !== expandedFor) {
    setExpandedFor(activeHref);
    const groupId = findGroupIdOf(activeHref, navSections);
    if (groupId && groupId !== openGroupId) setGroupChoice(groupId);
  }

  function setGroupOpen(groupId: string, open: boolean) {
    if (open) setGroupChoice(groupId);
    else if (groupId === openGroupId) setGroupChoice(null);
  }

  // `/` focuses the sidebar search (opening the drawer first on small screens).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.defaultPrevented || isEditableTarget(event.target)) return;

      event.preventDefault();
      if (window.matchMedia(DESKTOP_QUERY).matches) {
        desktopSearchRef.current?.focus();
      } else if (drawerOpen) {
        drawerSearchRef.current?.focus();
      } else {
        focusSearchOnOpen.current = true;
        setDrawerOpen(true);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  // The drawer is only for small screens; close it if the viewport grows past `md`.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => {
      if (query.matches) setDrawerOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const sidebarProps = {
    admin,
    navSections,
    activeHref,
    openGroups,
    onGroupOpenChange: setGroupOpen,
  };

  return (
    <ProfileDialogProvider>
    <PageDescriptionProvider>
    <PageCrumbProvider>
    <div data-themed className="flex min-h-dvh flex-1 bg-background text-foreground transition-colors duration-500">
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-60 -translate-y-20 rounded-md bg-brand-navy px-3 py-2 text-sm font-medium text-brand-white transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>

      {/* Persistent sidebar (md and up). */}
      <aside
        aria-label="Sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border transition-colors duration-500 md:block",
          entrance.sidebar,
        )}
      >
        <Sidebar {...sidebarProps} searchRef={desktopSearchRef} />
      </aside>

      {/* Drawer (below md). Base UI handles Escape, outside clicks and focus trapping. */}
      <Dialog.Root
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) focusSearchOnOpen.current = false;
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop
            data-themed
            className={cn(
              "fixed inset-0 z-40 bg-brand-background/55 backdrop-blur-[2px] md:hidden",
              "transition-opacity duration-300 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0",
            )}
          />
          <Dialog.Popup
            ref={drawerPopupRef}
            data-themed
            initialFocus={() => {
              const focusSearch = focusSearchOnOpen.current;
              focusSearchOnOpen.current = false;
              return focusSearch ? drawerSearchRef.current : drawerPopupRef.current;
            }}
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-[min(18rem,86vw)] shadow-2xl shadow-brand-background/40 outline-none md:hidden",
              "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              "data-starting-style:-translate-x-full data-ending-style:-translate-x-full motion-reduce:transition-none",
            )}
          >
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Sidebar
              {...sidebarProps}
              searchRef={drawerSearchRef}
              onNavigate={() => setDrawerOpen(false)}
              brandAction={
                <Dialog.Close
                  aria-label="Close navigation"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-shell-item transition-colors hover:bg-shell-surface/60 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
                >
                  <X className="size-4.5" aria-hidden />
                </Dialog.Close>
              }
            />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        <DashboardHeader
          admin={admin}
          navigationOpen={drawerOpen}
          onOpenNavigation={() => setDrawerOpen(true)}
          className={entrance.header}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className={cn("flex-1 bg-background outline-none transition-colors duration-500", entrance.workspace)}
        >
          {children}
        </main>
      </div>

      <ChatWidget key={admin.id} adminId={admin.id} />

      {/* Entrance after signing in: lifts away from the sign-in screen's navy (CSS only; hidden otherwise). */}
      <div aria-hidden className={entrance.curtain} onAnimationEnd={endDashboardEntrance} />
    </div>
    </PageCrumbProvider>
    </PageDescriptionProvider>
    </ProfileDialogProvider>
  );
}
