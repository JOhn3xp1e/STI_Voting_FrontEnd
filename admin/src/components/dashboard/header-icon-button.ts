import { cn } from "@/lib/utils";

/**
 * Square control used in the dashboard header (bell, theme, menu).
 *
 * The look follows the header theme via `data-header-theme` on the
 * `group/header` element: white raised buttons on the dark `hero` banner,
 * outlined buttons on the white `plain` header.
 */
export const headerIconButtonClassName = cn(
  "relative inline-flex size-8.5 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent outline-none",
  "bg-brand-white text-brand-navy shadow-[0_1px_2px_rgb(15_23_42/0.12),0_6px_16px_-10px_rgb(15_23_42/0.45)]",
  "transition-[box-shadow,translate,background-color,border-color,color] duration-300 ease-out [&_svg]:size-4.5",
  // Soft blue highlight on hover / while the popup is open.
  "hover:-translate-y-px hover:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand-blue)_28%,transparent),0_10px_22px_-12px_var(--color-brand-blue)]",
  "data-popup-open:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand-blue)_28%,transparent)]",
  "focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand-blue)_55%,transparent)]",
  "active:translate-y-0 motion-reduce:hover:translate-y-0",
  "dark:bg-white/10 dark:text-brand-white dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)] dark:backdrop-blur-sm dark:hover:bg-white/16",
  // Plain (white) header: outlined, flat.
  "group-data-[header-theme=plain]/header:border-[#e2e8f0] group-data-[header-theme=plain]/header:shadow-none",
  "group-data-[header-theme=plain]/header:hover:border-brand-blue/30 group-data-[header-theme=plain]/header:hover:bg-[#f8fafc]",
  "group-data-[header-theme=plain]/header:hover:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand-blue)_12%,transparent)]",
  "group-data-[header-theme=plain]/header:data-popup-open:border-brand-blue/30 group-data-[header-theme=plain]/header:data-popup-open:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand-blue)_12%,transparent)]",
  "dark:group-data-[header-theme=plain]/header:border-white/10 dark:group-data-[header-theme=plain]/header:bg-white/5 dark:group-data-[header-theme=plain]/header:hover:bg-white/10",
);
