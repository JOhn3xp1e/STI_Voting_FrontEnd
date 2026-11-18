/** A career (school level) from `/api/admin/careers`, e.g. TER = Tertiary, levels 1–4. */
export interface Career {
  code: string;
  name: string;
  /** Inclusive grade-level range; `null` while the backend doesn't send levels yet. */
  minLevel: number | null;
  maxLevel: number | null;
  /** "#1E40AF", or `null` when the career has no color. */
  color: string | null;
  /** Program codes listed under this career (e.g. TER → BSIT, BSTM); empty when none are listed. */
  programScope: string[];
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
  /** "#FFC200" */
  color: string;
  /** Program codes under this career. */
  programScope: string[];
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
