"use client";

import { useState } from "react";

import { getInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";

interface AdminAvatarProps {
  name: string;
  /** Public photo URL (`avatarUrl`); initials are shown when it's missing or fails to load. */
  src?: string | null;
  /** `navy` (gold initials) in the sidebar, `blue` (white initials) in the header. */
  tone?: "navy" | "blue";
  className?: string;
}

/** Circular avatar: the admin's photo, or their initials. */
export function AdminAvatar({ name, src, tone = "navy", className }: AdminAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = Boolean(src) && failedSrc !== src;

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full font-mono text-[0.6875rem] font-semibold tracking-wide select-none",
        tone === "navy"
          ? "bg-brand-navy text-brand-gold dark:bg-brand-gold dark:text-brand-navy"
          : "bg-brand-blue text-brand-white",
        className,
      )}
    >
      {showPhoto ? (
        // Plain <img>: the photo comes from the backend's storage, a different host for every environment.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt="" className="size-full object-cover" onError={() => setFailedSrc(src ?? null)} />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}
