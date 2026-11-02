/* Degree progress: which credits are finished, which are running this
   semester, and which the student has pencilled into the semesters ahead. */

import type {
  CurriculumCategory,
  CurriculumCourse,
  GradedCourse,
  VtopData,
} from "@/app/types/vtop";

export const DEGREE_SEMESTERS = 8;

/** Registration limit for one semester; an NPTEL course (CFOC) raises it. */
export const NORMAL_LIMIT = 27.5;
export const NPTEL_LIMIT = 28.5;

export const isNptel = (code: string) => /^CFOC/i.test(code);

export interface PlannedCourse {
  code: string;
  name: string;
  credits: number;
  category: string;
  /** Typed in by the student rather than picked from the curriculum. */
  custom?: boolean;
}

/** Semester number -> courses pencilled in. */
export type DegreePlan = Record<string, PlannedCourse[]>;

export type CourseStatus =
  | { kind: "done"; grade: string }
  | { kind: "current"; semester: number }
  | { kind: "planned"; semester: number }
  | { kind: "open" };

export interface SemesterBucket {
  number: number;
  label: string;
  isCurrent: boolean;
  /** On this semester's registration; cannot be removed here. */
  registered: PlannedCourse[];
  planned: PlannedCourse[];
  credits: number;
  limit: number;
}

export interface CategoryProgress extends CurriculumCategory {
  /** Part of a shared elective pool. */
  pooled: boolean;
  done: number;
  current: number;
  planned: number;
  /** Credits this category still needs, counting everything planned. */
  toGo: number;
}

export interface PoolProgress {
  label: string;
  ids: string[];
  min: number;
  max: number;
  done: number;
  current: number;
  planned: number;
}

export interface DegreeProgress {
  total: number;
  /** Capped the way the degree counts them, so spare credits add nothing. */
  done: number;
  current: number;
  planned: number;
  left: number;
  categories: CategoryProgress[];
  pools: PoolProgress[];
  semesters: SemesterBucket[];
  /** Finished courses that fit no bucket. */
  unmatched: GradedCourse[];
  status: Map<string, CourseStatus>;
  catalogue: (CurriculumCourse & { category: string })[];
}

const FAILED = /^(F|N\d?|W|U|RA|AB|X)$/i;
export const isPassed = (grade: string) => !FAILED.test(grade.trim());

function monthsAhead(current: string, steps: number): string {
  const m = current.match(/(Fall|Winter)\D*(\d{4})/i);
  if (!m) return "";
  let fall = /fall/i.test(m[1]);
  let year = Number(m[2]);
  for (let i = 0; i < steps; i++) {
    if (!fall) year++;
    fall = !fall;
  }
  return `${fall ? "Fall" : "Winter"} ${String(year).slice(2)}-${String(year + 1).slice(2)}`;
}

/** Old syncs, or a curriculum page we could not fully read, leave required
 *  credits at zero; the grade history lists them too. */
function withRequirements(data: VtopData): CurriculumCategory[] {
  const rows = data.grades?.curriculum ?? [];
  return (data.curriculum?.categories ?? []).map((c) => {
    if (c.required > 0 || c.max > 0) return c;
    const name = c.name.toLowerCase();
    const row = rows.find((r) => {
      const type = r.type.toLowerCase();
      return type.includes(name) || type.includes(`(${c.id.toLowerCase()})`);
    });
    return row ? { ...c, required: row.required, max: row.required } : c;
  });
}

export function degreeProgress(
  data: VtopData,
  plan: DegreePlan,
  /** Credits the student typed in per bucket, for use without VTOP. */
  manualDone: Record<string, number> = {},
): DegreeProgress {
  // Credits VTOP has already stated elsewhere beat the curriculum list.
  const known = new Map<string, number>();
  for (const c of data.grades?.history ?? []) if (c.credits > 0) known.set(c.code, c.credits);
  for (const c of data.registered ?? []) if (c.credits > 0) known.set(c.code, c.credits);
  const creditsOf = (code: string, listed: number) => (listed > 0 ? listed : (known.get(code) ?? 0));

  const categories = withRequirements(data).map((c) => ({
    ...c,
    courses: c.courses.map((course) => ({
      ...course,
      credits: creditsOf(course.code, course.credits),
    })),
  }));
  const catalogue = categories.flatMap((c) =>
    c.courses.map((course) => ({ ...course, category: c.id })),
  );
  const listed = new Map(catalogue.map((c) => [c.code, c.credits]));
  const home = new Map(catalogue.map((c) => [c.code, c.category]));
  const ids = new Set(categories.map((c) => c.id));
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const place = (code: string, hint = ""): string => {
    const label = hint.trim();
    if (ids.has(label.toUpperCase())) return label.toUpperCase();
    return home.get(code) ?? byName.get(label.toLowerCase()) ?? "";
  };

  const status = new Map<string, CourseStatus>();
  const done = new Map<string, number>();
  const current = new Map<string, number>();
  const planned = new Map<string, number>();
  const add = (map: Map<string, number>, id: string, credits: number) =>
    map.set(id, (map.get(id) ?? 0) + credits);

  for (const [id, credits] of Object.entries(manualDone)) if (credits > 0) add(done, id, credits);

  const unmatched: GradedCourse[] = [];
  for (const c of data.grades?.history ?? []) {
    if (!isPassed(c.grade)) continue;
    status.set(c.code, { kind: "done", grade: c.grade });
    const id = place(c.code, c.distribution);
    if (id) add(done, id, c.credits);
    else unmatched.push(c);
  }

  const finished = (data.grades?.semesters ?? []).filter(
    (s) => /fall|winter/i.test(s.semester.name) && s.semester.id !== data.semester.id,
  ).length;
  const currentNumber = finished + 1;
  const last = Math.max(currentNumber, DEGREE_SEMESTERS);

  const semesters: SemesterBucket[] = [];
  for (let number = currentNumber; number <= last; number++) {
    const isCurrent = number === currentNumber;
    const registered: PlannedCourse[] = isCurrent
      ? (data.registered ?? [])
          .filter((c) => status.get(c.code)?.kind !== "done")
          .map((c) => ({
            code: c.code,
            name: c.name,
            credits: c.credits,
            category: place(c.code, c.category),
          }))
      : [];
    const taken = new Set(registered.map((c) => c.code));
    for (const c of registered) {
      status.set(c.code, { kind: "current", semester: number });
      if (c.category) add(current, c.category, c.credits);
    }
    const mine = (plan[number] ?? [])
      .filter((c) => status.get(c.code)?.kind !== "done" && !taken.has(c.code))
      .map((c) => ({ ...c, credits: c.credits || (listed.get(c.code) ?? 0) }));
    for (const c of mine) {
      status.set(c.code, { kind: "planned", semester: number });
      if (c.category) add(isCurrent ? current : planned, c.category, c.credits);
    }
    const all = [...registered, ...mine];
    semesters.push({
      number,
      label:
        (isCurrent
          ? data.semester.name.replace(" Semester", "").replace(/20(\d\d)-/, "$1-")
          : monthsAhead(data.semester.name, number - currentNumber)) || `Semester ${number}`,
      isCurrent,
      registered,
      planned: mine,
      credits: all.reduce((n, c) => n + c.credits, 0),
      limit: all.some((c) => isNptel(c.code)) ? NPTEL_LIMIT : NORMAL_LIMIT,
    });
  }

  const combos = data.curriculum?.combined ?? [];
  const pooledIds = new Set(combos.flatMap((p) => p.ids));
  const cap = (id: string, credits: number) => {
    const c = categories.find((x) => x.id === id);
    return c ? Math.min(credits, Math.max(c.required, c.max)) : 0;
  };

  /** Credits that count towards the degree across the given stages. */
  const counted = (stages: Map<string, number>[]) => {
    const got = (id: string) => cap(id, stages.reduce((n, m) => n + (m.get(id) ?? 0), 0));
    const single = categories
      .filter((c) => !pooledIds.has(c.id))
      .reduce((n, c) => n + got(c.id), 0);
    const pooled = combos.reduce(
      (n, p) =>
        n +
        Math.min(
          p.ids.reduce((sum, id) => sum + got(id), 0),
          p.max,
        ),
      0,
    );
    return single + pooled;
  };

  const countedDone = counted([done]);
  const countedCurrent = counted([done, current]) - countedDone;
  const countedPlanned = counted([done, current, planned]) - countedDone - countedCurrent;
  const total = data.curriculum?.total || data.grades?.creditsRequired || 0;

  return {
    total,
    done: countedDone,
    current: countedCurrent,
    planned: countedPlanned,
    left: Math.max(0, total - countedDone - countedCurrent - countedPlanned),
    categories: categories.map((c) => {
      const d = done.get(c.id) ?? 0;
      const k = current.get(c.id) ?? 0;
      const p = planned.get(c.id) ?? 0;
      return {
        ...c,
        pooled: pooledIds.has(c.id),
        done: d,
        current: k,
        planned: p,
        toGo: Math.max(0, c.required - d - k - p),
      };
    }),
    pools: combos.map((p) => {
      const sum = (map: Map<string, number>) =>
        p.ids.reduce((n, id) => n + (map.get(id) ?? 0), 0);
      return {
        label: p.ids.join(" + "),
        ids: p.ids,
        min: p.min,
        max: p.max,
        done: sum(done),
        current: sum(current),
        planned: sum(planned),
      };
    }),
    semesters,
    unmatched,
    status,
    catalogue,
  };
}

export function searchCourses<T extends { code: string; name: string }>(
  list: T[],
  query: string,
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((c) => {
    const text = `${c.code} ${c.name}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
