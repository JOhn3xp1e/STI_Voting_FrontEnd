import Image from "next/image";
import Link from "next/link";

import { DASHBOARD_HOME } from "@/config/navigation";
import { cn } from "@/lib/utils";

/** Same asset as the sign-in screen's brand mark. */
const LOGO_SRC = "/images/slvp logo.png";

interface SidebarBrandProps {
  role: string;
  onNavigate?: () => void;
  className?: string;
}

/** White card with the STI logo, "SLVP" and the admin's role. */
export function SidebarBrand({ role, onNavigate, className }: SidebarBrandProps) {
  return (
    <Link
      href={DASHBOARD_HOME}
      onNavigate={onNavigate}
      aria-label="SLVP Admin Portal — go to dashboard"
      className={cn(
        "group/brand flex h-11.5 items-center gap-3 rounded-lg bg-shell-surface px-2.5 outline-none",
        "shadow-[0_1px_2px_rgb(15_23_42/0.06)] ring-1 ring-sidebar-border/60",
        "transition-[box-shadow,background-color] duration-200 ease-out",
        "hover:shadow-[0_6px_16px_-8px_rgb(15_76_158/0.35)] focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
        className,
      )}
    >
      <Image
        src={LOGO_SRC}
        alt=""
        width={32}
        height={31}
        className="h-7.5 w-auto shrink-0 transition-transform duration-300 ease-out group-hover/brand:-rotate-3 motion-reduce:transition-none"
      />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-sm font-semibold text-sidebar-foreground">SLVP</span>
        <span className="truncate font-mono text-[0.6875rem] text-brand-muted dark:text-shell-item">{role}</span>
      </span>
    </Link>
  );
}
