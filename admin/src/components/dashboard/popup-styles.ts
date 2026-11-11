import { cn } from "@/lib/utils";

/**
 * Shared look for the shell's floating panels (profile menu, notifications).
 * Popups are portalled to `<body>`, so each one carries `data-themed` itself
 * to pick up the dashboard theme.
 */
export const popupClassName = cn(
  "origin-(--transform-origin) rounded-xl border border-border bg-popover text-popover-foreground outline-none",
  "shadow-[0_18px_48px_-16px_rgb(15_23_42/0.35),0_2px_6px_-2px_rgb(15_23_42/0.12)] dark:shadow-[0_18px_48px_-16px_rgb(0_0_0/0.7)]",
  "transition-[opacity,scale,translate] duration-150 ease-out",
  "data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
  "motion-reduce:transition-opacity motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100",
);

export const menuItemClassName = cn(
  "flex h-9 w-full cursor-default items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] text-foreground outline-none select-none",
  "transition-colors duration-150 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground [&_svg]:transition-colors",
  "data-highlighted:bg-brand-blue/8 data-highlighted:text-brand-blue data-highlighted:[&_svg]:text-brand-blue",
  "dark:data-highlighted:bg-white/8 dark:data-highlighted:text-white dark:data-highlighted:[&_svg]:text-white",
);
