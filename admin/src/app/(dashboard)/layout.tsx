import { Suspense, type ReactNode } from "react";

import { AdminSessionGate } from "@/components/auth/admin-session";
import { ShellSkeleton } from "@/components/dashboard/shell-skeleton";

/*
 * The shell skeleton (sidebar + header + page placeholder) is shown while the
 * admin's session is checked, and while the shell waits for the URL on routes
 * with a dynamic segment (e.g. `/elections/[id]/edit`: there the pathname is
 * request-time data under Cache Components, so the shell, which reads it, has
 * to be inside Suspense).
 */

/**
 * Sidebar + header frame shared by every admin page. Only signed-in, active
 * admins get past the gate (see AdminSessionGate).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AdminSessionGate fallback={<ShellSkeleton label="Checking your session…" />}>{children}</AdminSessionGate>
    </Suspense>
  );
}
