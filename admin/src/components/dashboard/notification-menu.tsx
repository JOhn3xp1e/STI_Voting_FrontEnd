"use client";

import { Popover } from "@base-ui/react/popover";
import { Bell, BellOff } from "lucide-react";

import { cn } from "@/lib/utils";

import { headerIconButtonClassName } from "./header-icon-button";
import { popupClassName } from "./popup-styles";

interface NotificationMenuProps {
  /**
   * Unread notifications. The gold indicator only shows when this is above zero.
   * Notifications are not wired to the API yet, so the shell passes 0.
   */
  unreadCount?: number;
  className?: string;
}

/** Bell button with an unread indicator; opens the notifications panel. */
export function NotificationMenu({ unreadCount = 0, className }: NotificationMenuProps) {
  const hasUnread = unreadCount > 0;

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className={cn(headerIconButtonClassName, "group/bell", className)}
      >
        <Bell
          aria-hidden
          strokeWidth={1.75}
          className="origin-top transition-transform duration-300 ease-out group-hover/bell:-rotate-12 motion-reduce:transition-none"
        />
        {hasUnread ? (
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-brand-gold ring-2 ring-brand-white dark:ring-brand-navy"
          />
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={10} className="z-50 outline-none">
          <Popover.Popup data-themed className={cn(popupClassName, "w-[min(20rem,calc(100vw-2rem))]")}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <Popover.Title className="text-sm font-semibold text-foreground">Notifications</Popover.Title>
              {hasUnread ? (
                <span className="font-mono text-[0.6875rem] text-muted-foreground">{unreadCount} unread</span>
              ) : null}
            </div>
            <div className="flex flex-col items-center px-6 py-9 text-center">
              <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-brand-blue/8 text-brand-blue dark:bg-white/8 dark:text-brand-white">
                <BellOff className="size-4.5" aria-hidden strokeWidth={1.75} />
              </span>
              <p className="text-[0.8125rem] font-semibold text-foreground">No new notifications</p>
              <Popover.Description className="mt-1 text-xs text-muted-foreground">
                You&apos;re all caught up.
              </Popover.Description>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
