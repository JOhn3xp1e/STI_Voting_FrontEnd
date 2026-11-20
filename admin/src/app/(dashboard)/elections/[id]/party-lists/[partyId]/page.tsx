import { Suspense } from "react";
import type { Metadata } from "next";

import { PartyListEditorPage } from "@/components/party-lists/party-list-editor";
import { PartyListEditorSkeleton } from "@/components/party-lists/party-lists-skeleton";

export const metadata: Metadata = {
  title: "Edit party list",
};  

/** With Cache Components the ids are request-time data, so they're read inside Suspense. */
export default function EditPartyListRoute({ params }: PageProps<"/elections/[id]/party-lists/[partyId]">) {
  return (
    <Suspense fallback={<PartyListEditorSkeleton />}>
      {params.then(({ id, partyId }) => (
        <PartyListEditorPage electionId={decodeURIComponent(id)} partylistId={decodeURIComponent(partyId)} />
      ))}
    </Suspense>
  );
}
