/** A career (school level) from `/api/admin/careers`, e.g. TER = Tertiary, levels 1–4. */
export interface Career {
  code: string;
  name: string;
  /** Inclusive grade-level range; `null` while the backend doesn't send levels yet. */
  minLevel: number | null;
  maxLevel: number | null;
  createdAt: string;
}

/** An academic program from `/api/admin/programs`, e.g. BSIT. */
export interface Program {
  code: string;
  name: string;
  createdAt: string;
}

export interface CareerInput {
  code: string;
  name: string;
  minLevel: number;
  maxLevel: number;
}

export interface ProgramInput {
  code: string;
  name: string;
}

/** Which careers / programs an election's voter filter uses. */
export interface ElectionScope {
  title: string;
  careerScope: string[];
  programScope: string[];
}
