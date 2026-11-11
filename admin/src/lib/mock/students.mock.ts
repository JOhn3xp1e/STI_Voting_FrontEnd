import type { ProgramCode, Student, YearLevel } from "@/types/student.types";

/*
 * FRONTEND MOCK DATA — fictional students for the Students page preview.
 * These are not real student records. Replace with Web API data later.
 */

export const CURRENT_TERM = "TRM-00004";
export const PREVIOUS_TERM = "TRM-00003";
export const OLDER_TERM = "TRM-00002";

export const TERM_LABELS: Record<string, string> = {
  [CURRENT_TERM]: "2025–2026 term 1",
  [PREVIOUS_TERM]: "2024–2025 term 2",
  [OLDER_TERM]: "2024–2025 term 1",
};

export const TERMS = [CURRENT_TERM, PREVIOUS_TERM, OLDER_TERM] as const;

/** Most-used programs first: the Filters popover shows the first five and folds the rest. */
export const PROGRAMS: readonly ProgramCode[] = [
  "BSIT",
  "BSCS",
  "BSTM",
  "BSHM",
  "STEM",
  "BSIS",
  "BSCpE",
  "BSEMC",
  "BMMA",
  "BSBA",
  "BSA",
  "BSAIS",
  "BSRTCS",
  "BACOMM",
  "ABM",
  "HUMSS",
  "GAS",
  "ICT-MAWD",
  "ICT-CP",
  "ICT-ANIM",
  "HE-CA",
  "HE-TO",
  "HE-HO",
  "ARTS-DA",
];

/** Senior high strands only have two year levels (Grade 11 / 12). */
const SHS_PROGRAMS = new Set<ProgramCode>(["STEM", "ABM", "HUMSS", "GAS", "ICT-MAWD", "ICT-CP", "ICT-ANIM", "HE-CA", "HE-TO", "HE-HO", "ARTS-DA"]);

export const YEAR_LEVELS: readonly YearLevel[] = [1, 2, 3, 4];

export const EMAIL_DOMAIN = "legazpi.sti.edu.ph";

/** Students added during the current term before this session (shown as "+42 this term"). */
export const ADDED_THIS_TERM = 42;

/** `acosta.799331@legazpi.sti.edu.ph`: last name (letters only) + last 6 digits of the student no. */
export function buildStudentEmail(lastName: string, studentNo: string): string {
  const name = lastName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return `${name}.${studentNo.slice(-6)}@${EMAIL_DOMAIN}`;
}

/* -------------------------------------------------------------------------- */
/*                                Roster builder                               */
/* -------------------------------------------------------------------------- */

type Row = [studentNo: string, last: string, first: string, middle: string, program: ProgramCode, year: YearLevel, term: string, inactive?: boolean];

/** The rows from the design reference, pinned to the top of the list. */
const PINNED: Row[] = [
  ["02000799331", "Acosta", "Angelina Kate", "Millena", "BSIT", 1, CURRENT_TERM],
  ["02000989359", "Agripa", "Angela", "", "BSIT", 1, CURRENT_TERM],
  ["02000301884", "Alfane", "Jan Clarence", "", "BSIT", 1, PREVIOUS_TERM],
  ["02000645840", "Cruz", "Aeron Aries", "", "BSIT", 4, PREVIOUS_TERM],
  ["02000520117", "Moran", "Joriel", "", "BSIT", 4, PREVIOUS_TERM],
  ["02000441631", "Sta. Ana", "Jubert Mark", "", "BSIT", 2, CURRENT_TERM],
  ["02000233958", "Vargas", "Jecco Seth", "", "BSIT", 4, CURRENT_TERM, true],
];

/** Roster size and status split for the term (pinned rows included). */
const ROSTER = { total: 1284, notUpdated: 25, loa: 12 } as const;

const LAST_NAMES = [
  "Abad", "Abella", "Aguilar", "Alcantara", "Almario", "Amador", "Andrada", "Aquino", "Arevalo", "Austria",
  "Balagtas", "Baltazar", "Barcelona", "Bautista", "Belmonte", "Bernardo", "Buenaventura", "Cabrera", "Calderon", "Camacho",
  "Castillo", "Castro", "Cayabyab", "Concepcion", "Cordero", "Corpuz", "Cuenca", "David", "De Guzman", "De Leon",
  "De Vera", "Del Rosario", "Dela Cruz", "Dela Peña", "Diaz", "Dimaculangan", "Domingo", "Dumalagan", "Enriquez", "Escobar",
  "Esguerra", "Espiritu", "Estrada", "Fernandez", "Flores", "Florendo", "Francisco", "Gallardo", "Garcia", "Gonzales",
  "Guevarra", "Gutierrez", "Hernandez", "Ignacio", "Ilagan", "Jimenez", "Lacson", "Lagman", "Lim", "Lopez",
  "Lozada", "Macaraeg", "Magbanua", "Malonzo", "Manalo", "Manansala", "Marquez", "Medina", "Mendoza", "Mercado",
  "Miranda", "Morales", "Nacpil", "Navarro", "Nepomuceno", "Ocampo", "Olivarez", "Ong", "Pacheco", "Padilla",
  "Panganiban", "Pascual", "Perez", "Quiambao", "Ramirez", "Ramos", "Reyes", "Rivera", "Robles", "Rodriguez",
  "Salazar", "Salvador", "Samonte", "Santiago", "Santos", "Sarmiento", "Serrano", "Soriano", "Tan", "Tolentino",
  "Torres", "Valdez", "Valenzuela", "Vasquez", "Velasco", "Villanueva", "Villareal", "Yap", "Zamora", "Zialcita",
];

const FIRST_NAMES = [
  "Aaron", "Abigail", "Adrian", "Alyssa", "Andrea", "Angelo", "Anne Margaret", "Bea Patricia", "Bianca", "Carl Joshua",
  "Carlo", "Christian", "Clarisse", "Daniel", "Danica", "Ella Joy", "Emmanuel", "Erica", "Francis", "Gabriel",
  "Hannah", "Ivan", "Jasmine", "Jasper", "Jericho", "Jessa Mae", "John Paul", "Joshua", "Justine", "Kate",
  "Kenneth", "Kevin", "Kim Andrei", "Kristine", "Kyla Marie", "Lance Adrian", "Lea", "Louise", "Mark Anthony", "Marvin",
  "Mary Grace", "Miguel", "Mikaela", "Nathaniel", "Nicole", "Patricia", "Paolo Miguel", "Precious", "Princess", "Rafael",
  "Rhea Mae", "Ricardo", "Ronald", "Samantha", "Sean", "Shaira", "Sophia", "Stephanie", "Trisha Nicole", "Vince",
  "Xyrene", "Ysabel", "Zandro", "Zyrene",
];

const MIDDLE_NAMES = ["Reyes", "Santos", "Llorin", "Millena", "Cruz", "Bautista", "Garcia", "Mendoza", "", "", "", "", "", ""];

/** Program weights (percent-ish); anything not listed shares the remainder. */
const PROGRAM_WEIGHTS: Partial<Record<ProgramCode, number>> = { BSIT: 26, BSCS: 11, BSTM: 8, BSHM: 9, STEM: 9 };

/** Small deterministic PRNG so the roster is identical on the server and client. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRoster(): Student[] {
  const random = mulberry32(20251);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];

  const weighted: ProgramCode[] = [];
  const rest = PROGRAMS.filter((p) => !(p in PROGRAM_WEIGHTS));
  for (const program of PROGRAMS) {
    const weight = PROGRAM_WEIGHTS[program] ?? Math.max(1, Math.round(37 / rest.length));
    for (let i = 0; i < weight; i++) weighted.push(program);
  }

  const used = new Set(PINNED.map((row) => row[0]));
  const count = ROSTER.total - PINNED.length;
  const generated: Row[] = [];
  for (let i = 0; i < count; i++) {
    let studentNo: string;
    do studentNo = `02000${String(100000 + Math.floor(random() * 900000))}`;
    while (used.has(studentNo));
    used.add(studentNo);

    const program = pick(weighted);
    const year = (1 + Math.floor(random() * (SHS_PROGRAMS.has(program) ? 2 : 4))) as YearLevel;
    generated.push([studentNo, pick(LAST_NAMES), pick(FIRST_NAMES), pick(MIDDLE_NAMES), program, year, CURRENT_TERM]);
  }

  // Status split: the pinned rows already hold 3 "not updated" and 1 LOA.
  const pinnedNotUpdated = PINNED.filter((r) => r[6] !== CURRENT_TERM && !r[7]).length;
  const pinnedLoa = PINNED.filter((r) => r[7]).length;
  const order = generated.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const notUpdated = order.slice(0, ROSTER.notUpdated - pinnedNotUpdated);
  const loa = order.slice(notUpdated.length, notUpdated.length + ROSTER.loa - pinnedLoa);
  notUpdated.forEach((index, n) => (generated[index][6] = n % 5 === 4 ? OLDER_TERM : PREVIOUS_TERM));
  loa.forEach((index) => (generated[index][7] = true));

  // Code-point order on normalised names: identical on every engine (no locale data involved).
  const key = (row: Row) => `${row[1]}\u0000${row[2]}`.normalize("NFD").toLowerCase();
  generated.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

  return [...PINNED, ...generated].map(([studentNo, lastName, firstName, middleName, program, year, term, inactive]) => ({
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
}

export const MOCK_STUDENTS: Student[] = buildRoster();
