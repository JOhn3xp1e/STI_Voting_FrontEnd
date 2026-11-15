import { Suspense } from "react";
import type { Metadata } from "next";

import { BallotPage } from "@/components/ballot/ballot-page";
import { PageLoading } from "@/components/shared/page-feedback";

export const metadata: Metadata = {
  title: "Ballot",
};

/** With Cache Components the id is request-time data, so it's read inside Suspense. */
export default function ElectionBallotRoute({ params }: PageProps<"/elections/[id]/ballot">) {
  return (
    <Suspense fallback={<PageLoading label="Loading the ballot…" />}>
      {params.then(({ id }) => (
        <BallotPage electionId={decodeURIComponent(id)} />
      ))}
    </Suspense>
  );
}
