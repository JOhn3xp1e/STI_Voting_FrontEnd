import type { ProgramCode, Student, YearLevel } from "@/types/student.types";

/*
 * FRONTEND MOCK DATA — fictional students for the Students page preview.
 * These are not real student records. Replace with Web API data later.
 */

export const CURRENT_TERM = "TRM-00004";
export const PREVIOUS_TERM = "TRM-00003";

export const TERM_LABELS: Record<string, string> = {
  [CURRENT_TERM]: "2025–2026 term 1",
  [PREVIOUS_TERM]: "2024–2025 term 2",
};

export const TERMS = [CURRENT_TERM, PREVIOUS_TERM] as const;
export const PROGRAMS: readonly ProgramCode[] = ["BSIT", "BSCS", "BSBA", "BSHM", "BSTM"];
export const YEAR_LEVELS: readonly YearLevel[] = [1, 2, 3, 4];

export const EMAIL_DOMAIN = "legazpi.sti.edu.ph";

/**
 * Term-wide totals shown in the stats and tab badges. The table only holds a
 * small sample of the roster, so counts = these totals adjusted by changes
 * made to the sample during the session (see `useStudentCounts`).
 */
export const ROSTER_TOTALS = {
  all: 1284,
  enrolled: 1247,
  notUpdated: 37,
  inactive: 12,
  addedThisTerm: 42,
} as const;

type Row = [studentNo: string, last: string, first: string, middle: string, program: ProgramCode, year: YearLevel, term: string, inactive?: boolean];

const ROWS: Row[] = [
  ["02000799331", "Acosta", "Angelina Kate", "Millena", "BSIT", 1, CURRENT_TERM],
  ["02000989359", "Agripa", "Angela", "", "BSIT", 1, CURRENT_TERM],
  ["02000301884", "Alfane", "Jan Clarence", "", "BSIT", 1, PREVIOUS_TERM],
  ["02000645840", "Cruz", "Aeron Aries", "", "BSIT", 4, PREVIOUS_TERM],
  ["02000520117", "Moran", "Joriel", "", "BSIT", 4, PREVIOUS_TERM],
  ["02000441631", "Sta. Ana", "Jubert Mark", "", "BSIT", 2, CURRENT_TERM],
  ["02000233958", "Vargas", "Jecco Seth", "", "BSIT", 4, CURRENT_TERM, true],
  ["02000718246", "Bautista", "Rhea Mae", "Llorin", "BSCS", 2, CURRENT_TERM],
  ["02000655093", "Dela Peña", "Carl Joshua", "", "BSCS", 3, CURRENT_TERM],
  ["02000590412", "Esguerra", "Trisha Nicole", "", "BSBA", 1, CURRENT_TERM],
  ["02000476188", "Florendo", "Mark Anthony", "", "BSHM", 3, PREVIOUS_TERM],
  ["02000812370", "Gonzales", "Kyla Marie", "", "BSTM", 2, CURRENT_TERM],
  ["02000367725", "Lim", "Jasper", "", "BSCS", 4, CURRENT_TERM],
  ["02000934561", "Nepomuceno", "Ella Joy", "", "BSBA", 3, CURRENT_TERM, true],
  ["02000249903", "Ramirez", "Paolo Miguel", "", "BSIT", 3, CURRENT_TERM],
  ["02000681354", "Villareal", "Bea Patricia", "", "BSHM", 2, CURRENT_TERM],
];

/** `acosta.799331@legazpi.sti.edu.ph`: last name (letters only) + last 6 digits of the student no. */
export function buildStudentEmail(lastName: string, studentNo: string): string {
  const name = lastName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return `${name}.${studentNo.slice(-6)}@${EMAIL_DOMAIN}`;
}

export const MOCK_STUDENTS: Student[] = ROWS.map(([studentNo, lastName, firstName, middleName, program, year, term, inactive]) => ({
  studentNo,
  lastName,
  firstName,
  middleName: middleName || undefined,
  email: buildStudentEmail(lastName, studentNo),
  program,
  year,
  term,
  inactive: inactive ?? false,
}));
