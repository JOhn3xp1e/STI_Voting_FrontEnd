import { Suspense } from "react";
import type { Metadata } from "next";

import { PartyListsPage } from "@/components/party-lists/party-lists-page";
import { PageLoading } from "@/components/shared/page-feedback";

export const metadata: Metadata = {
  title: "Party lists",
};

/** With Cache Components the id is request-time data, so it's read inside Suspense. */
export default function ElectionPartyListsRoute({ params }: PageProps<"/elections/[id]/party-lists">) {
  return (
    <Suspense fallback={<PageLoading label="Loading party lists…" />}>
      {params.then(({ id }) => (
        <PartyListsPage electionId={decodeURIComponent(id)} />
      ))}
    </Suspense>
  );
}
