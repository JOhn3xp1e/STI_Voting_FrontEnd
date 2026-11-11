"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { LogOut, Settings, UserRound } from "lucide-react";

import { ACCOUNT_LINKS } from "@/config/navigation";
import { cn } from "@/lib/utils";
import type { AdminProfile } from "@/types/auth.types";

import { menuItemClassName, popupClassName } from "./popup-styles";

/** Where "Sign out" leads until the auth service exposes a real sign-out. */
const SIGN_IN_ROUTE = "/login";

interface ProfileMenuProps {
  admin: AdminProfile;
  /** Accessible name of the trigger button. */
  label: string;
  /** Trigger contents (avatar, name, …). */
  children: ReactNode;
  triggerClassName?: string;
  side?: "top" | "bottom";
  align?: "start" | "end";
  /** Show the admin's name and email at the top of the menu. */
  showIdentity?: boolean;
}

/** Account menu: Profile, Account settings, Sign out. */
export function ProfileMenu({
  admin,
  label,
  children,
  triggerClassName,
  side = "bottom",
  align = "end",
  showIdentity = false,
}: ProfileMenuProps) {
  const router = useRouter();

  // Placeholder: no session exists yet, so signing out only returns to the sign-in screen.
  function signOut() {
    router.push(SIGN_IN_ROUTE);
  }

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger aria-label={label} className={triggerClassName}>
        {children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side={side} align={align} sideOffset={8} className="z-50 outline-none">
          <Menu.Popup data-themed className={cn(popupClassName, "w-56 p-1.5")}>
            {showIdentity ? (
              <>
                <div className="px-2.5 pt-1.5 pb-2">
                  <p className="truncate text-[0.8125rem] font-semibold text-foreground">{admin.fullName}</p>
                  <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">{admin.email}</p>
                </div>
                <Menu.Separator className="mx-1 my-1 h-px bg-border" />
              </>
            ) : null}
            <Menu.LinkItem closeOnClick className={menuItemClassName} render={<Link href={ACCOUNT_LINKS.profile} />}>
              <UserRound aria-hidden />
              Profile
            </Menu.LinkItem>
            <Menu.LinkItem closeOnClick className={menuItemClassName} render={<Link href={ACCOUNT_LINKS.settings} />}>
              <Settings aria-hidden />
              Account settings
            </Menu.LinkItem>
            <Menu.Separator className="mx-1 my-1 h-px bg-border" />
            <Menu.Item onClick={signOut} className={menuItemClassName}>
              <LogOut aria-hidden />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
