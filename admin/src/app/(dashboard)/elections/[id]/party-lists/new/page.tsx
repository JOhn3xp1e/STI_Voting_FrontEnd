import { Suspense } from "react";
import type { Metadata } from "next";

import { PartyListEditorPage } from "@/components/party-lists/party-list-editor";
import { PartyListEditorSkeleton } from "@/components/party-lists/party-lists-skeleton";

export const metadata: Metadata = {
  title: "New party list",
};

/** With Cache Components the id is request-time data, so it's read inside Suspense. */
export default function NewPartyListRoute({ params }: PageProps<"/elections/[id]/party-lists/new">) {
  return (
    <Suspense fallback={<PartyListEditorSkeleton />}>
      {params.then(({ id }) => (
        <PartyListEditorPage electionId={decodeURIComponent(id)} partylistId={null} />
      ))}
    </Suspense>
  );
}
