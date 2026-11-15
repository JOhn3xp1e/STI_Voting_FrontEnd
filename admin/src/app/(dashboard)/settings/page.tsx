import { redirect } from "next/navigation";

import { SETTINGS_LINKS } from "@/config/navigation";

/** Settings opens on its first tab. */
export default function SettingsPage() {
  redirect(SETTINGS_LINKS.email);
}
