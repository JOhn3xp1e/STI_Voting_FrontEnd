import { Suspense, type ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PLACEHOLDER_ADMIN } from "@/config/admin-session";

/**
 * Empty frame (sidebar panel + page background) shown while the shell waits
 * for the URL. Only routes with a dynamic segment (e.g. `/elections/[id]/edit`)
 * ever show it: there the pathname is request-time data under Cache Components,
 * so the shell, which reads it, has to be inside Suspense.
 */
function ShellFallback() {
  return (
    <div data-themed className="flex min-h-dvh flex-1 bg-background">
      <div aria-hidden className="fixed inset-y-0 left-0 hidden w-64 border-r border-sidebar-border bg-sidebar md:block" />
    </div>
  );
}

/** Sidebar + header frame shared by every admin page. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <DashboardShell admin={PLACEHOLDER_ADMIN}>{children}</DashboardShell>
    </Suspense>
  );
}
