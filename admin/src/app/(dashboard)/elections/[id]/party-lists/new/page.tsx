import { Suspense } from "react";
import type { Metadata } from "next";

import { PartyListEditorPage } from "@/components/party-lists/party-list-editor";
import { PageLoading } from "@/components/shared/page-feedback";

export const metadata: Metadata = {
  title: "New party list",
};

/** With Cache Components the id is request-time data, so it's read inside Suspense. */
export default function NewPartyListRoute({ params }: PageProps<"/elections/[id]/party-lists/new">) {
  return (
    <Suspense fallback={<PageLoading label="Loading the party list…" />}>
      {params.then(({ id }) => (
        <PartyListEditorPage electionId={decodeURIComponent(id)} partylistId={null} />
      ))}
    </Suspense>
  );
}
