import type { Metadata } from "next";

import { StudentsPage } from "@/components/students/students-page";

export const metadata: Metadata = {
  title: "Students",
};

/** Students management, backed by the ASP.NET Core Web API (`/api/admin/students`). */
export default function Page() {
  return <StudentsPage />;
}
