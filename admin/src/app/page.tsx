import { redirect } from "next/navigation";

import { DASHBOARD_HOME } from "@/config/navigation";
import { DEV_SKIP_AUTH } from "@/lib/dev-auth";

/**
 * The root opens the sign-in screen, which forwards admins who are already signed in to the dashboard.
 * With the local DEV_SKIP_AUTH shortcut on, it opens the dashboard directly.
 */
export default function Home() {
  redirect(DEV_SKIP_AUTH ? DASHBOARD_HOME : "/login");
}
