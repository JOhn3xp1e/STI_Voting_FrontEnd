"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { StudentCatalog } from "@/types/student.types";

const StudentCatalogContext = createContext<StudentCatalog | null>(null);

/** Shares the terms, programs and careers loaded from the Web API with the Students page components. */
export function StudentCatalogProvider({ value, children }: { value: StudentCatalog; children: ReactNode }) {
  return <StudentCatalogContext.Provider value={value}>{children}</StudentCatalogContext.Provider>;
}

export function useStudentCatalog(): StudentCatalog {
  const catalog = useContext(StudentCatalogContext);
  if (!catalog) throw new Error("useStudentCatalog must be used inside <StudentCatalogProvider>.");
  return catalog;
}
