import { MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AdminProfile } from "@/types/auth.types";

import { AdminAvatar } from "./admin-avatar";
import { ProfileMenu } from "./profile-menu";

/** Admin identity pinned to the bottom of the sidebar; opens the account menu. */
export function SidebarProfile({ admin, className }: { admin: AdminProfile; className?: string }) {
  return (
    <ProfileMenu
      admin={admin}
      label={`Account menu for ${admin.fullName}`}
      side="top"
      align="end"
      triggerClassName={cn(
        "group/profile flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left outline-none",
        "transition-colors duration-200 hover:bg-shell-surface/55 data-popup-open:bg-shell-surface/70",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
        className,
      )}
    >
      <AdminAvatar name={admin.fullName} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[0.8125rem] font-semibold text-sidebar-foreground">{admin.fullName}</span>
        <span className="truncate font-mono text-[0.6875rem] text-brand-muted dark:text-shell-item">{admin.email}</span>
      </span>
      <MoreHorizontal
        aria-hidden
        className="size-4 shrink-0 text-brand-muted transition-colors group-hover/profile:text-sidebar-foreground dark:text-shell-item"
      />
    </ProfileMenu>
  );
}
