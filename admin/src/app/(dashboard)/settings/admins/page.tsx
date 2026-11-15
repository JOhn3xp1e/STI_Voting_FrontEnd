import type { Metadata } from "next";

import { AdminsSettings } from "@/components/settings/admins-settings";

export const metadata: Metadata = {
  title: "Admins",
};

/** Settings → Admins: super admins and invitations (`/api/admin/accounts`). */
export default function Page() {
  return <AdminsSettings />;
}
