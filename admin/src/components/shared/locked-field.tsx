import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

import { fieldClassName, labelClassName } from "./form-styles";

/** A disabled field with a lock icon: shown for values the backend can't change. */
export function LockedField({ id, label, value, className }: { id: string; label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <div className="relative" title="Can't be changed after it's created">
        <input id={id} value={value} disabled readOnly className={cn(fieldClassName, "pr-8")} />
        <Lock aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
      </div>
    </div>
  );
}
