import type { Metadata } from "next";

import { StudentsPage } from "@/components/students/students-page";

export const metadata: Metadata = {
  title: "Students",
};

/** Students management (frontend mock with fictional sample data; no backend yet). */
export default function Page() {
  return <StudentsPage />;
}
