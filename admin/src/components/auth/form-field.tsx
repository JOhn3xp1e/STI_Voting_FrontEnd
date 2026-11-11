import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import styles from "./login-effects.module.css";

/**
 * Shared styling for text inputs on the auth screens. The focus outline and glow
 * are drawn by the surrounding `FormField` frame, so the input only softens its border.
 */
export const authInputClassName = cn(
  "h-10 rounded-md bg-brand-white px-3 text-sm text-brand-navy md:text-sm",
  "placeholder:text-brand-muted placeholder:transition-opacity placeholder:duration-300 focus-visible:placeholder:opacity-70",
  "transition-[border-color,box-shadow,border-radius] duration-300 ease-out",
  "focus-visible:border-brand-blue/25 focus-visible:ring-0 aria-invalid:focus-visible:ring-0",
  // Alternate composition: flat white fields straight on the navy page.
  "login-alt:rounded-[0.3125rem] login-alt:border-transparent",
);

/** `id` of the element holding a field's validation message. */
export function fieldErrorId(fieldId: string): string {
  return `${fieldId}-error`;
}

interface FormFieldProps {
  /** `id` of the control rendered in `children`; used to link label and error. */
  id: string;
  label: string;
  /** Validation message. When set, render the control with `aria-invalid` and `aria-describedby`. */
  error?: string;
  children: ReactNode;
  className?: string;   
}

/** Label, control (inside the animated focus frame) and validation message. */
export function FormField({ id, label, error, children, className }: FormFieldProps) {
  return (
    <div className={cn("group/field flex flex-col gap-1.5", className)}>
      <Label
        htmlFor={id}
        className="text-xs font-semibold text-brand-navy transition-colors duration-300 login-alt:text-brand-white group-has-[input:focus-visible]/field:text-brand-blue login-alt:group-has-[input:focus-visible]/field:text-brand-gold"
      >
        {label}
      </Label>
      <div className={styles.field}>
        {children}
        <span aria-hidden className={styles.fieldRing}>
          <span className={styles.fieldComet} />
          <span className={styles.fieldComet} />
        </span>
      </div>
      {error ? (
        <p id={fieldErrorId(id)} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
