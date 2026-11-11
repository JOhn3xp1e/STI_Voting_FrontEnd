import type { Metadata } from "next";

import { TermsPage } from "@/components/terms/terms-page";

export const metadata: Metadata = {
  title: "Terms",
};

/** School terms, backed by the ASP.NET Core Web API (`/api/admin/terms`). */
export default function Page() {
  return <TermsPage />;
}
