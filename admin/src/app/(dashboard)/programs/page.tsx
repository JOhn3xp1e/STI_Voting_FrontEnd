import type { Metadata } from "next";

import { ProgramsPage } from "@/components/programs/programs-page";

export const metadata: Metadata = {
  title: "Programs & Careers",
};

/** Programs & careers, backed by the ASP.NET Core Web API (`/api/admin/programs`, `/careers`). */
export default function Page() {
  return <ProgramsPage />;
}
