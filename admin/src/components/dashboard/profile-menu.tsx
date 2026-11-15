"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { LogOut, Shield, Sun, UsersRound } from "lucide-react";

import { useProfileDialog } from "@/components/account/profile-dialog";
import { useAdminSession } from "@/components/auth/admin-session";
import { SETTINGS_LINKS } from "@/config/navigation";
import { cn } from "@/lib/utils";
import type { AdminProfile } from "@/types/auth.types";

import { AdminAvatar } from "./admin-avatar";
import { menuItemClassName, popupClassName } from "./popup-styles";

interface ProfileMenuProps {
  admin: AdminProfile;
  /** Accessible name of the trigger button. */
  label: string;
  /** Trigger contents (avatar, name, …). */
  children: ReactNode;
  triggerClassName?: string;
  side?: "top" | "bottom";
  align?: "start" | "end";
  /** Show the admin's photo, name, email and role at the top of the menu. */
  showIdentity?: boolean;
}

/** Bigger rows than the shared menu item: 15px text, 20px icons. */
const itemClassName = cn(menuItemClassName, "h-11 gap-3.5 px-3 text-[0.9375rem] [&_svg]:size-5");

/** Account menu: My profile, Change password, Settings (super admins), Log out. */
export function ProfileMenu({ admin, label, children, triggerClassName, side = "bottom", align = "end", showIdentity = false }: ProfileMenuProps) {
  const { signOut } = useAdminSession();
  const { openProfile } = useProfileDialog();
  const isSuperAdmin = admin.role.toLowerCase() === "super admin";

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger aria-label={label} className={triggerClassName}>
        {children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side={side} align={align} sideOffset={8} className="z-50 outline-none">
          <Menu.Popup data-themed className={cn(popupClassName, "w-[min(22rem,calc(100vw-2rem))] p-2")}>
            {showIdentity ? (
              <div className="px-3 pt-2.5 pb-3">
                <div className="flex items-center gap-3">
                  <AdminAvatar name={admin.fullName} src={admin.avatarUrl} className="size-10 text-[0.75rem]" />
                  <div className="min-w-0">
                    <p className="truncate text-[1rem] leading-5 font-semibold text-foreground">{admin.fullName}</p>
                    <p className="truncate font-mono text-[0.75rem] text-muted-foreground">{admin.email}</p>
                  </div>
                </div>
                <span className="mt-2.5 inline-flex rounded-[0.1875rem] bg-brand-gold px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium tracking-[0.04em] text-brand-navy uppercase">
                  {admin.role}
                </span>
              </div>
            ) : null}
            <Menu.Item onClick={() => openProfile("profile")} className={itemClassName}>
              <UsersRound aria-hidden strokeWidth={1.75} />
              My profile
            </Menu.Item>
            <Menu.Item onClick={() => openProfile("password")} className={itemClassName}>
              <Shield aria-hidden strokeWidth={1.75} />
              Change password
            </Menu.Item>
            {isSuperAdmin ? (
              <Menu.LinkItem closeOnClick className={itemClassName} render={<Link href={SETTINGS_LINKS.email} />}>
                <Sun aria-hidden strokeWidth={1.75} />
                Settings
                <span className="ml-auto font-mono text-[0.6875rem] text-muted-foreground">email · admins</span>
              </Menu.LinkItem>
            ) : null}
            <Menu.Separator className="mx-1 my-1.5 h-px bg-border" />
            <Menu.Item onClick={() => void signOut()} className={itemClassName}>
              <LogOut aria-hidden strokeWidth={1.75} />
              Log out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
