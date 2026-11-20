import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Bordered white card (election wizard, profile dialog). */
export const cardClassName = "rounded-[0.375rem] border border-[#e2e8f0] bg-card dark:border-border";

interface SectionCardProps {
  title: string;
  /** Right side of the header: a mono hint (string) or an action. */
  aside?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
  style?: CSSProperties;
}

/** Card with a mono uppercase title bar ("PROFILE", "DETAILS") and an optional hint or action on the right. */
export function SectionCard({ title, aside, children, bodyClassName, className, style }: SectionCardProps) {
  return (
    <section className={cn(cardClassName, className)} style={style}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-[#e2e8f0] px-5 py-2 dark:border-border">
        <h2 className="font-mono text-[0.6875rem] font-semibold tracking-[0.16em] text-foreground uppercase">{title}</h2>
        {typeof aside === "string" ? (
          <span className="truncate font-mono text-[0.65625rem] text-muted-foreground">{aside}</span>
        ) : (
          aside
        )}
      </header>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
