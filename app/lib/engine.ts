/* Everything the UI shows is derived here from two inputs: what VTOP has
   recorded, and the marks the user makes locally ahead of VTOP. */

import type {
  Assignment,
  CalendarDay,
  ClassRecord,
  Course,
  LocalMarks,
  Status,
  VtopData,
} from "@/app/types/vtop";

/* ── Dates (always local time - never toISOString, which is UTC) ── */

export function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const todayISO = () => toISO(new Date());
export const parseISO = (iso: string) => new Date(iso + "T00:00:00");

/** 1 = Monday … 7 = Sunday. */
export function weekdayOf(iso: string): number {
  const d = parseISO(iso).getDay();
  return d === 0 ? 7 : d;
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000,
  );
}

export function formatDate(
  iso: string,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
): string {
  return parseISO(iso).toLocaleDateString("en-IN", opts);
}

/** "today", "tomorrow", "in 5 days", "3 days ago". */
export function relativeDay(iso: string, today = todayISO()): string {
  const n = daysBetween(today, iso);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/* ── The 75% rule ──
   VTOP rounds the percentage UP (23/31 = 74.2% is shown, and treated, as
   75%), so a course is safe when ceil(pct) >= 75. */

export const REQUIRED = 75;

export const rawPct = (attended: number, total: number) =>
  total === 0 ? 100 : (attended / total) * 100;
export const shownPct = (attended: number, total: number) =>
  Math.ceil(rawPct(attended, total));
export const isSafe = (attended: number, total: number) =>
  shownPct(attended, total) >= REQUIRED;

/* ── Lookups ── */

export interface Lookup {
  data: VtopData;
  days: Map<string, CalendarDay>;
  courses: Map<string, Course>;
  /** date -> course code -> VTOP records for that day. */
  recorded: Map<string, Map<string, ClassRecord[]>>;
}

export function buildLookup(data: VtopData): Lookup {
  const recorded: Lookup["recorded"] = new Map();
  for (const [code, list] of Object.entries(data.records)) {
    for (const r of list) {
      if (!recorded.has(r.date)) recorded.set(r.date, new Map());
      const byCode = recorded.get(r.date)!;
      byCode.set(code, [...(byCode.get(code) ?? []), r]);
    }
  }
  return {
    data,
    days: new Map(data.calendar.map((d) => [d.date, d])),
    courses: new Map(data.courses.map((c) => [c.code, c])),
    recorded,
  };
}

/* ── Classes on a day ── */

/** A course's sitting on one day; a two-slot lab is one block of count 2. */
export interface ClassBlock {
  code: string;
  course: Course | undefined;
  slots: string[];
  start: string;
  end: string;
  venue: string;
  kind: "theory" | "lab";
  /** Periods VTOP counts this sitting as (2 for a lab). Used only for the
   *  percentage; everywhere else a sitting is one class. */
  count: number;
}

export function blocksForWeekday(
  data: VtopData,
  weekday: number,
): ClassBlock[] {
  const byCode = new Map<string, ClassBlock>();
  const courses = new Map(data.courses.map((c) => [c.code, c]));
  for (const e of data.timetable) {
    if (e.day !== weekday) continue;
    const b = byCode.get(e.code);
    if (b) {
      b.slots.push(e.slot);
      b.count += 1;
      if (e.start < b.start) b.start = e.start;
      if (e.end > b.end) b.end = e.end;
    } else {
      byCode.set(e.code, {
        code: e.code,
        course: courses.get(e.code),
        slots: [e.slot],
        start: e.start,
        end: e.end,
        venue: e.venue,
        kind: e.kind,
        count: 1,
      });
    }
  }
  return [...byCode.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/** The weekday whose timetable runs on a date, or null when no classes run
 *  (holiday, exam, weekend, or a date outside the published calendar). */
export function dayOrderOn(look: Lookup, date: string): number | null {
  const day = look.days.get(date);
  if (!day || day.type !== "instructional") return null;
  return day.dayOrder ?? weekdayOf(date);
}

export function blocksOn(look: Lookup, date: string): ClassBlock[] {
  const order = dayOrderOn(look, date);
  return order ? blocksForWeekday(look.data, order) : [];
}

/* ── Status of one class on one day ── */

export interface ClassState {
  /** What counts right now: the user's mark if there is one, else VTOP's. */
  status: Status | null;
  source: "vtop" | "local" | null;
  /** What VTOP recorded, if it has recorded this class. */
  vtop: Status | null;
  /** The user's mark disagrees with VTOP - a what-if. */
  overridden: boolean;
  /** VTOP recorded a mix across a multi-period block. */
  mixed: boolean;
}

/** A day's records for one course, reduced to a single status. */
function recordedStatus(recs: ClassRecord[]): Status {
  return recs.some((r) => r.status === "absent") ? "absent" : recs[0].status;
}

export function classState(
  look: Lookup,
  marks: LocalMarks,
  date: string,
  code: string,
): ClassState {
  const recs = look.recorded.get(date)?.get(code);
  const local = marks[date]?.[code] ?? null;
  if (recs?.length) {
    const vtop = recordedStatus(recs);
    const absent = recs.filter((r) => r.status === "absent").length;
    const overridden = local !== null && local !== vtop;
    return {
      status: overridden ? local : vtop,
      source: overridden ? "local" : "vtop",
      vtop,
      overridden,
      mixed: !overridden && absent > 0 && absent < recs.length,
    };
  }
  return {
    status: local,
    source: local ? "local" : null,
    vtop: null,
    overridden: false,
    mixed: false,
  };
}

/** How one day counts for a course: VTOP's records (with any what-if on
 *  top), or the user's own mark when VTOP has nothing. Null = not counted. */
function dayTally(
  look: Lookup,
  marks: LocalMarks,
  code: string,
  date: string,
  scheduled: number,
): {
  total: number;
  attended: number;
  vtopAttended: number;
  recorded: boolean;
} | null {
  const recs = look.recorded.get(date)?.get(code);
  const mark = marks[date]?.[code];
  if (recs?.length) {
    const vtopAttended = recs.filter((r) => r.status !== "absent").length;
    const attended = mark
      ? mark === "absent"
        ? 0
        : recs.length
      : vtopAttended;
    return { total: recs.length, attended, vtopAttended, recorded: true };
  }
  if (mark && scheduled > 0) {
    return {
      total: scheduled,
      attended: mark === "absent" ? 0 : scheduled,
      vtopAttended: 0,
      recorded: false,
    };
  }
  return null;
}

/* ── Exams ── */

export interface ExamWindow {
  label: string;
  start: string;
  end: string;
}

/** Consecutive exam days with the same label form one exam window. */
export function examWindows(calendar: CalendarDay[]): ExamWindow[] {
  const out: ExamWindow[] = [];
  for (const d of calendar) {
    if (d.type !== "exam") continue;
    const last = out[out.length - 1];
    if (last && last.label === d.label && daysBetween(last.end, d.date) <= 3) {
      last.end = d.date;
    } else {
      out.push({ label: d.label, start: d.date, end: d.date });
    }
  }
  return out;
}

export const nextExam = (calendar: CalendarDay[], today: string) =>
  examWindows(calendar).find((e) => e.start > today) ?? null;

/** Exams that gate a course. An exam labelled for labs only applies to lab
 *  courses, and one labelled for theory only to the rest. */
export function examsFor(
  calendar: CalendarDay[],
  course: Course,
): ExamWindow[] {
  return examWindows(calendar).filter((e) => {
    const label = e.label.toLowerCase();
    if (/\blab/.test(label)) return course.kind === "lab";
    if (/theory/.test(label)) return course.kind !== "lab";
    return true;
  });
}

/* ── Per-course stats ── */

export interface CourseStats {
  course: Course;
  /** VTOP's numbers plus local marks VTOP hasn't caught up with. */
  attended: number;
  total: number;
  pct: number; // rounded up, like VTOP
  /** On track: at 75% or above when the horizon arrives, provided the
   *  classes still to come are attended. This is what VTOP checks - being
   *  under 75% on some day in between does not matter. */
  safe: boolean;
  /** Under 75% today, whatever the outlook. */
  belowNow: boolean;
  /** Classes counted from the user's own marks, not yet on VTOP. */
  localTotal: number;
  localAbsent: number;
  /** Until the horizon: classes still to come and not yet decided. */
  upcoming: number;
  /** Classes the user has already planned to miss before the horizon. */
  plannedAbsent: number;
  /** More classes that can be missed before the horizon and stay safe. */
  canMiss: number;
  /** How many of the upcoming classes must be attended to be at 75% at the
   *  horizon; null if even attending all of them is not enough. */
  needed: number | null;
  /** Percentage at the horizon if every undecided class is attended. */
  bestPct: number;
  horizon: string;
  horizonLabel: string;
}

export interface Horizon {
  date: string; // classes strictly before this date count
  label: string;
  /** Not in VTOP's calendar - assumed to follow the last day of classes. */
  inferred?: boolean;
}

const dayAfter = (iso: string) =>
  toISO(new Date(parseISO(iso).getTime() + 86_400_000));

/** Every checkpoint a course's attendance is judged at, in date order: the
 *  exams in VTOP's calendar, plus the FAT. VTOP's calendar does not always
 *  mark the FAT, so when nothing follows the last day of classes we add one
 *  that starts the day after it. */
export function horizonsFor(data: VtopData, course?: Course): Horizon[] {
  const exams = course
    ? examsFor(data.calendar, course)
    : examWindows(data.calendar);
  const list: Horizon[] = exams.map((e) => ({ date: e.start, label: e.label }));
  const lastClass = [...data.calendar]
    .reverse()
    .find((d) => d.type === "instructional")?.date;
  if (lastClass && !list.some((h) => h.date > lastClass)) {
    list.push({ date: dayAfter(lastClass), label: "FAT", inferred: true });
  }
  return list;
}

/** By default we project up to the course's next exam - VTOP checks the 75%
 *  rule before each one. */
export function defaultHorizon(
  data: VtopData,
  today: string,
  course?: Course,
): Horizon {
  const all = horizonsFor(data, course);
  return (
    all.find((h) => h.date > today) ??
    all[all.length - 1] ?? { date: dayAfter(today), label: "semester end" }
  );
}

export function courseStats(
  look: Lookup,
  marks: LocalMarks,
  course: Course,
  today: string,
  horizon: Horizon = defaultHorizon(look.data, today, course),
): CourseStats {
  // The percentage is worked out in class periods, exactly as VTOP does (a
  // lab sitting is two periods). Everything shown as "classes" - left, can
  // miss, must attend - is in sittings, so a lab day is one class.
  let attended = course.attended;
  let total = course.total;
  let localTotal = 0;
  let localAbsent = 0;
  let plannedAbsent = 0;
  let futureMarkedTotal = 0;
  let futureMarkedAttended = 0;
  /** Periods in each undecided sitting still to come, in date order. */
  const open: number[] = [];

  // What-ifs on classes VTOP has already recorded shift the attended count.
  for (const [date, byCode] of Object.entries(marks)) {
    if (!byCode[course.code]) continue;
    const t = dayTally(look, marks, course.code, date, 0);
    if (t?.recorded) attended += t.attended - t.vtopAttended;
  }

  for (const day of look.data.calendar) {
    if (day.date >= horizon.date && day.date > today) break;
    const block = blocksOn(look, day.date).find((b) => b.code === course.code);
    if (!block) continue;
    if (look.recorded.get(day.date)?.has(course.code)) continue; // VTOP has it

    const mark = marks[day.date]?.[course.code];
    if (day.date <= today) {
      // Already happened (or today): count only what the user has marked.
      if (mark) {
        localTotal += 1;
        total += block.count;
        if (mark === "absent") localAbsent += 1;
        else attended += block.count;
      } else if (day.date === today && day.date < horizon.date) {
        open.push(block.count);
      }
    } else if (mark) {
      futureMarkedTotal += block.count;
      if (mark === "absent") plannedAbsent += 1;
      else futureMarkedAttended += block.count;
    } else {
      open.push(block.count);
    }
  }

  const openPeriods = open.reduce((n, c) => n + c, 0);
  const endTotal = total + futureMarkedTotal + openPeriods;
  const endAttended = attended + futureMarkedAttended + openPeriods;

  // Miss the longest sittings first, so the answer holds whichever are missed.
  const longestFirst = [...open].sort((x, y) => y - x);
  let canMiss = 0;
  let missed = 0;
  for (const periods of longestFirst) {
    missed += periods;
    if (!isSafe(endAttended - missed, endTotal)) break;
    canMiss += 1;
  }

  const safe = isSafe(endAttended, endTotal);
  if (!safe) canMiss = 0;

  return {
    course,
    attended,
    total,
    pct: shownPct(attended, total),
    safe,
    belowNow: !isSafe(attended, total),
    localTotal,
    localAbsent,
    upcoming: open.length,
    plannedAbsent,
    canMiss,
    needed: safe ? open.length - canMiss : null,
    bestPct: shownPct(endAttended, endTotal),
    horizon: horizon.date,
    horizonLabel: horizon.label,
  };
}

/** The same stats if one more class were marked a given way - for showing
 *  "if you miss this…" before the user commits to it. */
export function statsIf(
  look: Lookup,
  marks: LocalMarks,
  course: Course,
  today: string,
  date: string,
  status: Status,
): CourseStats {
  const hypothetical = {
    ...marks,
    [date]: { ...marks[date], [course.code]: status },
  };
  return courseStats(look, hypothetical, course, today);
}

/** The next class of a course that is neither recorded nor marked yet. */
export function nextOpenClass(
  look: Lookup,
  marks: LocalMarks,
  course: Course,
  today: string,
  before: string,
): string | null {
  for (const day of look.data.calendar) {
    if (day.date < today) continue;
    if (day.date >= before) break;
    if (marks[day.date]?.[course.code]) continue;
    if (look.recorded.get(day.date)?.has(course.code)) continue;
    if (blocksOn(look, day.date).some((b) => b.code === course.code))
      return day.date;
  }
  return null;
}

/* ── Exam by exam ── */

export interface ExamOutlook {
  label: string;
  start: string;
  inferred: boolean;
  /** The exam has started or passed; the numbers are where you stood. */
  past: boolean;
  /** VTOP has debarred the course from this exam. */
  debarred: boolean;
  attended: number;
  total: number;
  pct: number;
  safe: boolean;
  /** Future exams only. */
  upcoming: number;
  canMiss: number;
  needed: number | null;
}

/** Where a course stood going into each past exam, and how many classes it
 *  can still miss before each exam to come. */
export function examOutlook(
  look: Lookup,
  marks: LocalMarks,
  course: Course,
  today: string,
): ExamOutlook[] {
  const exams = horizonsFor(look.data, course);

  return exams.map((exam) => {
    // VTOP writes "CAT - II : Debarred"; compare the exam name exactly so
    // that it doesn't also match "CAT - I".
    const debarred =
      course.debar?.split(":")[0].trim().toLowerCase() ===
      exam.label.toLowerCase();
    if (exam.date > today) {
      const s = courseStats(look, marks, course, today, exam);
      return {
        label: exam.label,
        start: exam.date,
        inferred: Boolean(exam.inferred),
        past: false,
        debarred,
        attended: s.attended,
        total: s.total,
        pct: s.pct,
        safe: s.safe,
        upcoming: s.upcoming,
        canMiss: s.canMiss,
        needed: s.needed,
      };
    }
    // Replay every counted class before the exam began.
    const dates = new Set<string>();
    for (const r of look.data.records[course.code] ?? []) dates.add(r.date);
    for (const [date, byCode] of Object.entries(marks))
      if (byCode[course.code]) dates.add(date);
    let attended = 0;
    let total = 0;
    for (const date of dates) {
      if (date >= exam.date) continue;
      const scheduled =
        blocksOn(look, date).find((b) => b.code === course.code)?.count ?? 0;
      const t = dayTally(look, marks, course.code, date, scheduled);
      if (!t) continue;
      attended += t.attended;
      total += t.total;
    }
    return {
      label: exam.label,
      start: exam.date,
      inferred: Boolean(exam.inferred),
      past: true,
      debarred,
      attended,
      total,
      pct: shownPct(attended, total),
      safe: isSafe(attended, total),
      upcoming: 0,
      canMiss: 0,
      needed: 0,
    };
  });
}

export type Risk = "debarred" | "danger" | "warning" | "safe";

export function riskOf(s: CourseStats): Risk {
  if (s.course.debar) return "debarred";
  if (!s.safe) return "danger";
  if (s.canMiss <= 1) return "warning";
  return "safe";
}

const RISK_ORDER: Record<Risk, number> = {
  debarred: 0,
  danger: 1,
  warning: 2,
  safe: 3,
};

export function allStats(
  look: Lookup,
  marks: LocalMarks,
  today: string,
): CourseStats[] {
  return look.data.courses
    .map((c) => courseStats(look, marks, c, today))
    .sort(
      (a, b) => RISK_ORDER[riskOf(a)] - RISK_ORDER[riskOf(b)] || a.pct - b.pct,
    );
}

/* ── Wording ── */

const classes = (n: number) => `${n} class${n === 1 ? "" : "es"}`;

/** When a checkpoint falls: "12 Nov", or "after 11 Nov" for the assumed FAT. */
export function whenLabel(h: {
  date?: string;
  start?: string;
  inferred?: boolean;
}): string {
  const date = (h.date ?? h.start)!;
  if (!h.inferred) return formatDate(date);
  return `after ${formatDate(toISO(new Date(parseISO(date).getTime() - 86_400_000)))}`;
}

/** What the projection allows, ignoring any debar VTOP has already applied. */
export function projection(s: CourseStats): string {
  if (!s.safe) {
    return s.upcoming === 0
      ? `Below 75% with no classes left before ${s.horizonLabel}`
      : `Can't reach 75% before ${s.horizonLabel}`;
  }
  if (s.upcoming === 0) return `No classes left before ${s.horizonLabel}`;
  return s.canMiss === 0
    ? `Can't miss any before ${s.horizonLabel}`
    : `Can miss ${s.canMiss} more before ${s.horizonLabel}`;
}

/** The full sentence: how many classes are left and how many can be missed. */
export function outlookSentence(s: CourseStats): string {
  const left = `${classes(s.upcoming)} left before ${s.horizonLabel}`;
  if (s.upcoming === 0) {
    return s.safe
      ? `No classes left before ${s.horizonLabel} - you finish at ${s.pct}%, which is safe.`
      : `No classes left before ${s.horizonLabel} - you finish at ${s.pct}%, below 75%.`;
  }
  if (!s.safe) {
    return `${left}. Even attending all of them only gets you to ${s.bestPct}%, short of 75%.`;
  }
  if (s.canMiss === 0) {
    return `${left}. You need all of them to be at 75% when ${s.horizonLabel} starts.`;
  }
  return `${left}. You can miss ${s.canMiss} of them and still be at 75% or above when ${s.horizonLabel} starts.`;
}

/** Colour for a current percentage: red only when the exam is out of reach,
 *  amber when merely under 75% today. */
export const pctTone = (s: CourseStats) => (!s.safe ? "bad" : s.belowNow ? "warn" : "");

/** One line that says what the numbers mean for the student. */
export const verdict = (s: CourseStats) => s.course.debar ?? projection(s);

/* ── Local marks housekeeping ── */

/** After a sync, VTOP is the source of truth again, with one exception.
 *  - A mark on a class VTOP has now recorded is dropped: if you marked
 *    yourself absent but VTOP says present, present it is.
 *  - An on-duty mark over a VTOP absence is kept. VTOP only posts ODs just
 *    before exams, so being able to count them early is the point; the mark
 *    goes away by itself once VTOP stops showing the class as absent.
 *  - Marks on classes VTOP has not recorded yet (today, future plans) stay. */
export function pruneMarks(after: Lookup, marks: LocalMarks): LocalMarks {
  const out: LocalMarks = {};
  for (const [date, byCode] of Object.entries(marks)) {
    for (const [code, status] of Object.entries(byCode)) {
      if (!after.courses.has(code)) continue;
      if (status === "present") continue; // present is the default; nothing to keep
      const recs = after.recorded.get(date)?.get(code);
      if (recs?.length && !(status === "od" && recordedStatus(recs) === "absent")) {
        continue;
      }
      (out[date] ??= {})[code] = status;
    }
  }
  return out;
}

/** How many on-duty marks are still waiting for VTOP to catch up. */
export function pendingOD(look: Lookup, marks: LocalMarks): number {
  let n = 0;
  for (const [date, byCode] of Object.entries(marks)) {
    for (const [code, status] of Object.entries(byCode)) {
      const recs = look.recorded.get(date)?.get(code);
      if (status === "od" && recs?.length && recordedStatus(recs) === "absent") n += 1;
    }
  }
  return n;
}

/* ── Assignments ── */

export function sortedAssignments(list: Assignment[]): Assignment[] {
  return [...list].sort((a, b) =>
    (a.due ?? "9999").localeCompare(b.due ?? "9999"),
  );
}

export const isOpen = (a: Assignment, today: string) =>
  !a.submitted && (a.due === null || a.due >= today);
