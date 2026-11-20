import { Suspense } from "react";
import type { Metadata } from "next";

import { EditElectionPage } from "@/components/elections/create/create-election-page";
import { ElectionFormSkeleton } from "@/components/elections/create/election-form-skeleton";

export const metadata: Metadata = {
  title: "Edit election",
};

/** With Cache Components the id is request-time data, so it's read inside Suspense. */
export default function EditElectionRoute({ params }: PageProps<"/elections/[id]/edit">) {
  return (
    <Suspense fallback={<ElectionFormSkeleton label="Loading the election…" />}>
      {params.then(({ id }) => (
        <EditElectionPage electionId={decodeURIComponent(id)} />
      ))}
    </Suspense>
  );
}
