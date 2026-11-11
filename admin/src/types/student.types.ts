/**
 * Student roster types used by the Students page.
 * (Frontend mock for now; will mirror the Web API DTOs once they exist.)
 */

export type ProgramCode = "BSIT" | "BSCS" | "BSBA" | "BSHM" | "BSTM";

export type YearLevel = 1 | 2 | 3 | 4;

export interface Student {
  /** 11-digit STI student number, e.g. `02000799331`. Unique; used for upserts. */
  studentNo: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  email: string;
  program: ProgramCode;
  year: YearLevel;
  /** Term the student is enrolled in, e.g. `TRM-00004`. */
  term: string;
  /** On leave of absence / inactive: excluded from voting. */
  inactive: boolean;
}

/** Badge shown in the Status column. */
export type StudentStatus = "enrolled" | "not-updated" | "loa";

/** Category tabs above the table. */
export type StudentCategory = "all" | "enrolled" | "not-updated" | "inactive";

export interface StudentFilters {
  query: string;
  program: ProgramCode | null;
  year: YearLevel | null;
  term: string | null;
}
