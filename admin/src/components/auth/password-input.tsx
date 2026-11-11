"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type">;

const iconBase =
  "absolute inset-0 size-4 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-opacity";
const iconShown = "scale-100 rotate-0 opacity-100";
const iconHidden = "scale-50 -rotate-45 opacity-0 motion-reduce:scale-100 motion-reduce:rotate-0";

/** Password input with a button that toggles the value's visibility. */
export function PasswordInput({ className, disabled, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 z-2 flex w-10 items-center justify-center rounded-r-md text-brand-muted transition-[color,transform] duration-200 outline-none hover:text-brand-blue focus-visible:text-brand-blue focus-visible:ring-3 focus-visible:ring-brand-blue/20 active:scale-90 disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100"
      >
        <span className="relative size-4" aria-hidden>
          <Eye className={cn(iconBase, visible ? iconHidden : iconShown)} />
          <EyeOff className={cn(iconBase, visible ? iconShown : iconHidden)} />
        </span>
      </button>
    </div>
  );
}
