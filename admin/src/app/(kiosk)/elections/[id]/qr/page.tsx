import { Suspense } from "react";
import type { Metadata } from "next";

import { QrViewer } from "@/components/elections/qr/qr-viewer";

export const metadata: Metadata = {
  title: "QR viewer",
};

/** With Cache Components the id is request-time data, so it's read inside Suspense. */
export default function QrViewerRoute({ params }: PageProps<"/elections/[id]/qr">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-login-background" />}>
      {params.then(({ id }) => (
        <QrViewer electionId={decodeURIComponent(id)} />
      ))}
    </Suspense>
  );
}
