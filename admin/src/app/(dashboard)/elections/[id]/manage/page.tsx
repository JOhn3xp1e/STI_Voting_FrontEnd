import { Suspense } from "react";
import type { Metadata } from "next";

import { ManagePage } from "@/components/elections/manage/manage-page";
import { PageSkeleton } from "@/components/shared/skeleton";

export const metadata: Metadata = {
  title: "Manage",
};

/** With Cache Components the id is request-time data, so it's read inside Suspense. */
export default function ManageElectionRoute({ params }: PageProps<"/elections/[id]/manage">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the election…" />}>
      {params.then(({ id }) => (
        <ManagePage electionId={decodeURIComponent(id)} />
      ))}
    </Suspense>
  );
}
