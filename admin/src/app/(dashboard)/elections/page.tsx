import type { Metadata } from "next";

import { ElectionsPage as ElectionsWorkspace } from "@/components/elections/elections-page";

export const metadata: Metadata = {
  title: "Elections",
};

export default function ElectionsPage() {
  return <ElectionsWorkspace />;
}
