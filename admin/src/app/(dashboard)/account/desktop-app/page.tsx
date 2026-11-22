import type { Metadata } from "next";

import { DesktopApp } from "@/components/desktop/desktop-app";

export const metadata: Metadata = {
  title: "Desktop app",
};

/** Account → Desktop app: download the Windows app (`/api/desktop/*`). Open to every admin. */
export default function Page() {
  return <DesktopApp />;
}
