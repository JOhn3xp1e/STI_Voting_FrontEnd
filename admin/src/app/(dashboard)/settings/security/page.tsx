import type { Metadata } from "next";

import { SecuritySettings } from "@/components/settings/security-settings";

export const metadata: Metadata = {
  title: "Security settings",
};

/** Settings → Security (UI only for now: nothing is saved). */
export default function Page() {
  return <SecuritySettings />;
}
