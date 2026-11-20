import { Suspense } from "react";
import type { Metadata } from "next";

import { PageSkeleton } from "@/components/shared/skeleton";
import { ElectionSettingsPage } from "@/components/elections/settings/election-settings-page";

export const metadata: Metadata = {
  title: "Election settings",
};

/** With Cache Components the id is request-time data, so it's read inside Suspense. */
export default function ElectionSettingsRoute({ params }: PageProps<"/elections/[id]/settings">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the election…" />}>
      {params.then(({ id }) => (
        <ElectionSettingsPage electionId={decodeURIComponent(id)} />
      ))}
    </Suspense>
  );
}
