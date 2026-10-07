/* Marks analysis and CGPA maths. VTOP only shows what has been evaluated;
   here each course gets a full picture out of 100 — what is scored, what is
   still to come (exams, assignments on the DA page, components the student
   adds), and what the total can still become. */

import type {
  CourseMarks,
  Grades,
  RegisteredCourse,
  VtopData,
} from "@/app/types/vtop";

/* ── The student's own additions, kept on the device ── */

export const COMPONENT_KINDS = [
  "Quiz",
  "Digital Assignment",
  "Course Project",
  "Assessment",
  "Other",
] as const;

export interface CustomComponent {
  id: string;
  title: string;
  weight: number; // marks out of 100
}

export interface CoursePlan {
  custom: CustomComponent[];
  /** Marks the student expects in a pending component, out of that
   *  component's own maximum (e.g. 38 out of 50 in CAT-II), by item key. */
  expectedMarks?: Record<string, number>;
  /** Auto-filled components the student removed, by item key. */
  hidden: string[];
}

export type MarkPlans = Record<string, CoursePlan>;

export const emptyPlan = (): CoursePlan => ({
  custom: [],
  expectedMarks: {},
  hidden: [],
});

/* ── Course structure ──
   Theory courses: CAT-I 15, CAT-II 15, FAT 30, and 40 of internal
   components that differ from course to course. */

export const THEORY_FIXED = [
  { key: "cati", title: "CAT - I", weight: 15 },
  { key: "catii", title: "CAT - II", weight: 15 },
  { key: "fat", title: "FAT", weight: 30 },
];
export const THEORY_INTERNAL = 40;

/** A stable key for matching the same component across VTOP's pages:
 *  "Continuous Assessment Test - II" and "CAT - II" are both "catii". */
export function itemKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/continuous assessment test/g, "cat")
    .replace(/final assessment test/g, "fat")
    .replace(/[^a-z0-9]/g, "");
}

export interface PlanItem {
  key: string;
  title: string;
  weight: number;
  state: "scored" | "pending";
  source: "vtop" | "exam" | "assignment" | "custom";
  /** What the component is marked out of (50 for a CAT, 100 for the FAT). */
  max: number;
  /** Scored items. */
  scored?: number;
  weighted?: number;
  absent?: boolean;
  remark?: string;
  /** Pending items that come from the DA page. */
  due?: string | null;
  submitted?: boolean;
  /** Pending items: the marks the student expects, out of `max`. */
  expectedMarks?: number;
  customId?: string;
}

export interface CourseAnalysis {
  code: string;
  name: string;
  typeLabel: string;
  isTheory: boolean;
  items: PlanItem[];
  /** Marks out of 100 already evaluated, and how many of them were earned. */
  evaluated: number;
  earned: number;
  lost: number;
  /** Weight of listed components still to be evaluated. */
  pending: number;
  /** Marks out of 100 not yet accounted for by any component. */
  unallocated: number;
  /** For theory: how much of the 40 internal marks has been allocated. */
  internalPlanned: number;
  /** Share of evaluated marks earned, 0–1; null before anything is scored. */
  rate: number | null;
  /** Total if everything left is scored in full. */
  best: number;
  /** Total if everything left goes the way it has gone so far. */
  atRate: number | null;
  /** Total using the student's expectations where given, current rate
   *  elsewhere. Null when no expectation has been entered. */
  expected: number | null;
}

const isTheoryType = (typeLabel: string) => /theory/i.test(typeLabel);

/** A pending component's expected marks, scaled to its weight. */
export function expectedWeighted(i: PlanItem): number | null {
  if (i.expectedMarks === undefined || !i.max) return null;
  return (Math.min(i.expectedMarks, i.max) / i.max) * i.weight;
}

/** Every course that should appear on the marks screen. */
export function marksCourses(
  data: VtopData,
): { code: string; name: string; typeLabel: string }[] {
  const seen = new Map<string, { code: string; name: string; typeLabel: string }>();
  for (const c of data.courses) {
    seen.set(c.code, { code: c.code, name: c.name, typeLabel: c.typeLabel });
  }
  for (const m of data.marks ?? []) {
    if (!seen.has(m.code)) {
      seen.set(m.code, { code: m.code, name: m.name, typeLabel: m.typeLabel });
    }
  }
  return [...seen.values()];
}

export function analyseCourse(
  data: VtopData,
  plans: MarkPlans,
  course: { code: string; name: string; typeLabel: string },
): CourseAnalysis {
  const plan = plans[course.code] ?? emptyPlan();
  const vtop: CourseMarks | undefined = data.marks?.find((m) => m.code === course.code);
  const isTheory = isTheoryType(course.typeLabel);
  const hidden = new Set(plan.hidden);
  const items: PlanItem[] = [];
  const have = new Set<string>();

  for (const m of vtop?.items ?? []) {
    const key = itemKey(m.title);
    have.add(key);
    items.push({
      key,
      title: m.title,
      weight: m.weight,
      state: "scored",
      source: "vtop",
      max: m.max,
      scored: m.scored,
      weighted: m.weighted,
      absent: /absent/i.test(m.status),
      remark: m.remark,
    });
  }

  const pend = (item: Omit<PlanItem, "state" | "expectedMarks">) => {
    if (have.has(item.key) || hidden.has(item.key)) return;
    have.add(item.key);
    items.push({
      ...item,
      state: "pending",
      expectedMarks: plan.expectedMarks?.[item.key],
    });
  };

  // Assignments listed on the DA page that have no mark yet.
  for (const a of data.assignments) {
    if (a.code !== course.code) continue;
    const weight = Number(a.weightage) || 0;
    if (!weight) continue;
    pend({
      key: itemKey(a.title),
      title: a.title,
      weight,
      max: Number(a.maxMark) || weight,
      source: "assignment",
      due: a.due,
      submitted: a.submitted,
    });
  }

  // The exams every theory course has.
  if (isTheory) {
    // Both CATs are marked out of the same total; the FAT is out of 100.
    const catMax =
      items.find((i) => i.key === "cati" || i.key === "catii")?.max ?? 50;
    for (const f of THEORY_FIXED) {
      pend({ ...f, max: f.key === "fat" ? 100 : catMax, source: "exam" });
    }
  }

  for (const c of plan.custom) {
    pend({
      key: `custom:${c.id}`,
      title: c.title,
      weight: c.weight,
      max: c.weight,
      source: "custom",
      customId: c.id,
    });
  }

  const scored = items.filter((i) => i.state === "scored");
  const waiting = items.filter((i) => i.state === "pending");
  const evaluated = scored.reduce((n, i) => n + i.weight, 0);
  const earned = scored.reduce((n, i) => n + (i.weighted ?? 0), 0);
  const pending = waiting.reduce((n, i) => n + i.weight, 0);
  const unallocated = Math.max(0, 100 - evaluated - pending);
  const rate = evaluated > 0 ? earned / evaluated : null;

  const fixedKeys = new Set(THEORY_FIXED.map((f) => f.key));
  const internalPlanned = items
    .filter((i) => !fixedKeys.has(i.key))
    .reduce((n, i) => n + i.weight, 0);

  const anyExpectation = waiting.some((i) => i.expectedMarks !== undefined);
  const fallback = rate ?? 1;
  const expected = anyExpectation
    ? earned +
      waiting.reduce((n, i) => n + (expectedWeighted(i) ?? i.weight * fallback), 0) +
      unallocated * fallback
    : null;

  return {
    ...course,
    isTheory,
    items,
    evaluated,
    earned,
    lost: evaluated - earned,
    pending,
    unallocated,
    internalPlanned,
    rate,
    best: earned + (100 - evaluated),
    atRate: rate === null ? null : earned + (100 - evaluated) * rate,
    expected,
  };
}

/** What share of the marks still open is needed to finish on `target`.
 *  0 means already secured; null means out of reach. */
export function neededFor(a: CourseAnalysis, target: number): number | null {
  const open = 100 - a.evaluated;
  const gap = target - a.earned;
  if (gap <= 0) return 0;
  if (open <= 0 || gap > open) return null;
  return gap / open;
}

export const TARGETS = [90, 80, 70, 60, 50];

/** Absolute grading, used for labs and skill courses: the lowest total that
 *  earns each grade. Theory courses are graded relative to the class, so no
 *  letter can be promised for them. */
export const ABSOLUTE_BANDS: [string, number][] = [
  ["S", 90],
  ["A", 80],
  ["B", 70],
  ["C", 60],
  ["D", 55],
  ["E", 50],
  ["F", 0],
];

export const ABSOLUTE_GRADE: Record<number, string> = {
  90: "S",
  80: "A",
  70: "B",
  60: "C",
  50: "E",
};

/** Grades an absolutely-graded course can still finish on, given what is
 *  already scored and what is left. Null for relative grading. */
export function reachableGrades(a: CourseAnalysis): Set<string> | null {
  if (a.isTheory) return null;
  const ok = new Set<string>();
  ABSOLUTE_BANDS.forEach(([grade, floor], i) => {
    const ceiling = i === 0 ? Infinity : ABSOLUTE_BANDS[i - 1][1];
    // Reachable if the best case clears the floor and the marks already
    // banked have not carried the total past the band.
    if (a.best >= floor && a.earned < ceiling) ok.add(grade);
  });
  return ok;
}

export const fmt = (n: number) =>
  (Math.round(n * 100) / 100).toString();

/* ── Grades and CGPA ── */

export const GRADE_POINTS: Record<string, number> = {
  S: 10,
  A: 9,
  B: 8,
  C: 7,
  D: 6,
  E: 5,
  F: 0,
  N: 0,
};

export const GRADE_LETTERS = ["S", "A", "B", "C", "D", "E", "F"];

/** Pass/fail and non-graded courses carry no grade points. */
export const countsForGpa = (grade: string) => grade in GRADE_POINTS;

export function gpaOf(courses: { credits: number; grade: string }[]): {
  gpa: number | null;
  credits: number;
  points: number;
} {
  let credits = 0;
  let points = 0;
  for (const c of courses) {
    if (!countsForGpa(c.grade)) continue;
    credits += c.credits;
    points += c.credits * GRADE_POINTS[c.grade];
  }
  return { gpa: credits ? points / credits : null, credits, points };
}

/** Courses this semester that will count towards the CGPA. */
export function gradedThisSemester(data: VtopData): RegisteredCourse[] {
  return (data.registered ?? []).filter(
    (c) => c.credits > 0 && !/non-graded/i.test(c.category),
  );
}

export type GradePicks = Record<string, string>; // course code -> letter

export interface CgpaProjection {
  semesterGpa: number | null;
  semesterCredits: number;
  cgpaNow: number | null;
  cgpaAfter: number | null;
  creditsNow: number;
  creditsAfter: number;
}

/** Credits from outside the timetable - NPTEL courses, projects,
 *  internships - that the student wants counted. */
export interface ExtraCredit {
  id: string;
  title: string;
  credits: number;
  grade: string;
}

export function projectCgpa(
  grades: Grades,
  courses: RegisteredCourse[],
  picks: GradePicks,
  extras: ExtraCredit[] = [],
): CgpaProjection {
  const past = gpaOf(grades.history);
  const sem = gpaOf([
    ...courses
      .filter((c) => picks[c.code])
      .map((c) => ({ credits: c.credits, grade: picks[c.code] })),
    ...extras,
  ]);
  const credits = past.credits + sem.credits;
  return {
    semesterGpa: sem.gpa,
    semesterCredits: sem.credits,
    cgpaNow: past.gpa,
    cgpaAfter: credits ? (past.points + sem.points) / credits : null,
    creditsNow: past.credits,
    creditsAfter: credits,
  };
}

/** "BECE303L" and "BECE303P" are the theory and lab of one subject. */
export const subjectOf = (code: string) => code.replace(/[A-Z]$/, "");

/** The GPA needed this semester, over `credits`, to finish on `target`. */
export function gpaNeeded(grades: Grades, credits: number, target: number): number | null {
  if (credits <= 0) return null;
  const past = gpaOf(grades.history);
  return (target * (past.credits + credits) - past.points) / credits;
}
