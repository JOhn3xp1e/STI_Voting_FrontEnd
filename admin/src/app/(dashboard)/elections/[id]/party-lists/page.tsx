import { Suspense } from "react";
import type { Metadata } from "next";

import { PartyListsPage } from "@/components/party-lists/party-lists-page";
import { PartyListsSkeleton } from "@/components/party-lists/party-lists-skeleton";

export const metadata: Metadata = {
  title: "Party lists",
};

/** With Cache Components the id is request-time data, so it's read inside Suspense. */
export default function ElectionPartyListsRoute({ params }: PageProps<"/elections/[id]/party-lists">) {
  return (
    <Suspense fallback={<PartyListsSkeleton />}>
      {params.then(({ id }) => (
        <PartyListsPage electionId={decodeURIComponent(id)} />
      ))}
    </Suspense>
  );
}
