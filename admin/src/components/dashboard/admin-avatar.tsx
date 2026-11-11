import { getInitials } from "@/config/admin-session";
import { cn } from "@/lib/utils";

interface AdminAvatarProps {
  name: string;
  /** `navy` (gold initials) in the sidebar, `blue` (white initials) in the header. */
  tone?: "navy" | "blue";
  className?: string;
}

/** Circular avatar with the admin's initials. */
export function AdminAvatar({ name, tone = "navy", className }: AdminAvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-[0.6875rem] font-semibold tracking-wide select-none",
        tone === "navy"
          ? "bg-brand-navy text-brand-gold dark:bg-brand-gold dark:text-brand-navy"
          : "bg-brand-blue text-brand-white",
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
