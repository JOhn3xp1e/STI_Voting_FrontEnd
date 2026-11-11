import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PLACEHOLDER_ADMIN } from "@/config/admin-session";

/** Sidebar + header frame shared by every admin page. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell admin={PLACEHOLDER_ADMIN}>{children}</DashboardShell>;
}
