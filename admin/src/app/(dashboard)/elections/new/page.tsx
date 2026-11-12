import type { Metadata } from "next";

import { CreateElectionPage } from "@/components/elections/create/create-election-page";

export const metadata: Metadata = {
  title: "Create election",
};

export default function NewElectionPage() {
  return <CreateElectionPage />;
}
