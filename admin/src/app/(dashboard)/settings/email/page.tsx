import type { Metadata } from "next";

import { EmailSettings } from "@/components/settings/email-settings";

export const metadata: Metadata = {
  title: "Email settings",
};

/** Settings → Email (UI only for now: nothing is saved). */
export default function Page() {
  return <EmailSettings />;
}
