"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon } from "lucide-react";

import { getPageMeta } from "@/config/navigation";
import { useElectionsNav } from "@/components/elections/elections-nav";
import { cn } from "@/lib/utils";
import type { AdminProfile } from "@/types/auth.types";

import { AdminAvatar } from "./admin-avatar";
import styles from "./dashboard-header.module.css";
import { headerIconButtonClassName } from "./header-icon-button";
import { NotificationMenu } from "./notification-menu";
import { usePageDescriptionOverride } from "./page-description";
import { ProfileMenu } from "./profile-menu";
import { ThemeToggle } from "./theme-toggle";

interface DashboardHeaderProps {
  admin: AdminProfile;
  /** Opens the navigation drawer (below the `md` breakpoint). */
  onOpenNavigation: () => void;
  navigationOpen: boolean;
  className?: string;
}

/**
 * Page header shared by every admin route. Title, subtitle and theme come from
 * the route (`getPageMeta`): the Dashboard gets the gradient `hero`
 * banner, every other page the white `plain` header. The same elements are
 * kept across routes so height, colours and the banner cross-fade smoothly.
 */
export function DashboardHeader({ admin, onOpenNavigation, navigationOpen, className }: DashboardHeaderProps) {
  const pathname = usePathname();
  const { elections } = useElectionsNav();
  const meta = getPageMeta(pathname, admin.firstName, elections);
  const { title, headerTheme, headerDivider } = meta;
  const description = usePageDescriptionOverride(pathname) ?? meta.description;
  const hero = headerTheme === "hero";

  return (
    <header
      data-header-theme={headerTheme}
      className={cn("group/header relative isolate overflow-hidden bg-brand-white transition-colors duration-500 dark:bg-background", className)}
    >
      {/* Dark gradient banner; faded out (not unmounted) on inner pages. */}
      <div
        aria-hidden
        className={cn(styles.backdrop, "transition-opacity duration-500 ease-out", hero ? "opacity-100" : "opacity-0")}
      >
        {/* Light theme: header artwork. */}
        <div className={styles.artwork}>
          <Image src="/images/headerdesign.png" alt="" fill loading="eager" sizes="140vw" className="object-cover" />
        </div>
        {/* Dark theme: animated navy gradient. */}
        <div className={styles.darkLayers}>
          <div className={styles.gradient} />
          <div className={styles.shade} />
          <div className={styles.glow} />
          <div className={styles.grain} />
        </div>
      </div>

      <div className="relative px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            "flex items-center gap-3 border-b py-3 transition-[min-height,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            hero
              ? "min-h-32 border-transparent sm:min-h-40 lg:min-h-50"
              : cn("min-h-16 sm:min-h-20", headerDivider ? "border-[#e2e8f0] dark:border-border" : "border-transparent"),
          )}
        >
          <button
            type="button"
            onClick={onOpenNavigation}
            aria-label="Open navigation"
            aria-expanded={navigationOpen}
            className={cn(headerIconButtonClassName, "md:hidden")}
          >
            <MenuIcon aria-hidden strokeWidth={1.75} />
          </button>

          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col gap-x-3.5 gap-y-1",
              hero ? "xl:flex-row xl:items-baseline" : "lg:flex-row lg:items-baseline",
            )}
          >
            <h1
              className={cn(
                "truncate text-xl leading-tight font-semibold tracking-tight transition-colors duration-500 sm:text-2xl",
                hero
                  ? "font-display text-brand-navy dark:text-brand-white"
                  : "font-sans text-brand-navy dark:text-brand-white",
              )}
            >
              {title}
            </h1>
            {description ? (
              <p
                className={cn(
                  "line-clamp-2 font-mono text-[0.6875rem] transition-colors duration-500 sm:text-xs",
                  hero ? "text-brand-navy/60 xl:truncate dark:text-brand-white/65" :"text-brand-muted lg:truncate dark:text-shell-item",
                )}
              >
                {description}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2.5 sm:gap-4">
            <NotificationMenu unreadCount={0} />
            <ThemeToggle />
            <ProfileMenu
              admin={admin}
              label={`Account menu for ${admin.fullName}`}
              showIdentity
              triggerClassName={cn(
                "rounded-full outline-none transition-[box-shadow,translate] duration-300 ease-out",
                hero ? "shadow-[0_0_0_2px_rgb(255_255_255/0.3)]" : "shadow-[0_0_0_2px_transparent]",
                "hover:-translate-y-px hover:shadow-[0_0_0_2px_rgb(255_255_255/0.9),0_0_0_5px_color-mix(in_oklab,var(--color-brand-blue)_40%,transparent)]",
                "data-popup-open:shadow-[0_0_0_2px_rgb(255_255_255/0.9),0_0_0_5px_color-mix(in_oklab,var(--color-brand-blue)_40%,transparent)]",
                "focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_5px_var(--color-brand-blue)] motion-reduce:hover:translate-y-0",
              )}
            >
              <AdminAvatar name={admin.fullName} src={admin.avatarUrl} tone="blue" />
            </ProfileMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
