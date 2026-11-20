import { redirect } from "next/navigation";

import { SETTINGS_LINKS } from "@/config/navigation";

/** Only redirects, so there is no UI to validate for instant navigation. */
export const instant = false;

/** Settings opens on its first tab. */
export default function SettingsPage() {
  redirect(SETTINGS_LINKS.email);
}
