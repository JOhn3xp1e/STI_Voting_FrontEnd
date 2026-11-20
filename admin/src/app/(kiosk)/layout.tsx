import { Suspense, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import { AdminSessionGate } from "@/components/auth/admin-session";

/** Dark loading screen, matching the full-screen pages. */
function KioskFallback({ label }: { label: string }) {
  return (
    <div role="status" className="flex min-h-dvh flex-1 items-center justify-center gap-2.5 bg-login-background text-sm text-brand-white/70">
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
      {label}
    </div>
  );
}

/**
 * Full-screen admin pages without the sidebar and header (the QR viewer on a kiosk or a
 * second screen). Same session check as the dashboard.
 */
export default function KioskLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<KioskFallback label="Loading…" />}>
      <AdminSessionGate bare fallback={<KioskFallback label="Checking your session…" />}>
        {children}
      </AdminSessionGate>
    </Suspense>
  );
}
