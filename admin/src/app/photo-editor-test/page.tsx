import type { Metadata } from "next";

import { PhotoEditor } from "@/components/photo-editor/photo-editor";

export const metadata: Metadata = {
  title: "Photo editor · AI test",
};

/** Standalone test page for AI photo editing (background removal on Cloudflare Images). */
export default function PhotoEditorTestPage() {
  return <PhotoEditor />;
}
