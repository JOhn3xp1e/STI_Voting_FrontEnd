import { Suspense, type ReactNode } from "react";

import { AdminSessionGate } from "@/components/auth/admin-session";
import { PageLoading } from "@/components/shared/page-loader";

/**
 * Frame (sidebar panel + page background + loader) shown while the admin's
 * session is checked, and while the shell waits for the URL on routes with a
 * dynamic segment (e.g. `/elections/[id]/edit`: there the pathname is
 * request-time data under Cache Components, so the shell, which reads it, has
 * to be inside Suspense).
 */
function ShellFallback({ label = "Loading the page…" }: { label?: string }) {
  return (
    <div data-themed className="flex min-h-dvh flex-1 bg-background">
      <div aria-hidden className="fixed inset-y-0 left-0 hidden w-64 border-r border-sidebar-border bg-sidebar md:block" />
      <div className="flex min-w-0 flex-1 items-center md:pl-64">
        <PageLoading label={label} className="w-full" />
      </div>
    </div>
  );
}

/**
 * Sidebar + header frame shared by every admin page. Only signed-in, active
 * admins get past the gate (see AdminSessionGate).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AdminSessionGate fallback={<ShellFallback label="Checking your session…" />}>{children}</AdminSessionGate>
    </Suspense>
  );
}
