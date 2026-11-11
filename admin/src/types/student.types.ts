/**
 * Student roster types used by the Students page.
 * (Frontend mock for now; will mirror the Web API DTOs once they exist.)
 */

/** College programs and senior high strands offered on campus. */
export type ProgramCode =
  | "BSIT"
  | "BSCS"
  | "BSTM"
  | "BSHM"
  | "STEM"
  | "BSIS"
  | "BSCpE"
  | "BSEMC"
  | "BMMA"
  | "BSBA"
  | "BSA"
  | "BSAIS"
  | "BSRTCS"
  | "BACOMM"
  | "ABM"
  | "HUMSS"
  | "GAS"
  | "ICT-MAWD"
  | "ICT-CP"
  | "ICT-ANIM"
  | "HE-CA"
  | "HE-TO"
  | "HE-HO"
  | "ARTS-DA";

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
  /** On leave of absence: excluded from voting. */
  inactive: boolean;
}

/** Badge shown in the Status column (mutually exclusive). */
export type StudentStatus = "enrolled" | "not-updated" | "loa";

/** Multi-select filters from the Filters popover; empty list = no filter. */
export interface FacetFilters {
  programs: ProgramCode[];
  years: YearLevel[];
  terms: string[];
  statuses: StudentStatus[];
}
