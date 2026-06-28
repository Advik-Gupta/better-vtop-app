import {
  Subject,
  AttendanceRecord,
  DailyCalendarEntry,
  AttendanceStatus,
} from "@/app/types/attendance";
import type { ExamCutoff } from "@/app/lib/calendarConfig";

export const isInstructional = (day: DailyCalendarEntry) =>
  day.type === "instructional";

export const getSubjectClassWeight = (subject: Subject) =>
  subject.type === "lab" ? 1 : 1;

export function getEffectiveWeekday(day: DailyCalendarEntry): number {
  // The generated calendar stores the effective weekday directly.
  if (day.dayOrder) return day.dayOrder;

  const jsDay = new Date(day.date + "T00:00:00").getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/* ──────────────────────────────────────────────────────────────────────────
   75% RULE — VIT rounds the attendance percentage UP. A subject is eligible
   when Math.ceil(pct) >= 75, i.e. anything strictly above 74.0% passes.
   ────────────────────────────────────────────────────────────────────────── */

export const REQUIRED = 75;

/** Does this raw percentage satisfy the 75% rule (with round-up)? */
export function meetsThreshold(pct: number): boolean {
  return Math.ceil(pct) >= REQUIRED;
}

/** The percentage to display (rounded up, matching VIT's rule). */
export function displayPct(pct: number): number {
  return Math.ceil(pct);
}

/**
 * Largest number of absences A (out of `total` classes) that still keeps the
 * subject eligible — i.e. ceil(((total-A)/total)*100) >= 75. A short, exact
 * loop avoids edge-case rounding bugs.
 */
export function maxAllowedAbsences(total: number): number {
  if (total <= 0) return 0;
  let allowed = 0;
  for (let a = 0; a <= total; a++) {
    const pct = ((total - a) / total) * 100;
    if (meetsThreshold(pct)) allowed = a;
    else break;
  }
  return allowed;
}

export function calculateSubjectStats(
  subject: Subject,
  calendar: DailyCalendarEntry[],
  attendance: AttendanceRecord,
  timetable: Record<number, string[]>,
  untilDate?: string,
) {
  let total = 0;
  let present = 0;
  let absent = 0;
  let od = 0;
  let cancelled = 0;

  calendar.forEach((day) => {
    if (day.type !== "instructional") return;
    if (untilDate && day.date > untilDate) return;

    const effectiveWeekday = getEffectiveWeekday(day);
    const subjectIds = timetable[effectiveWeekday] || [];

    if (!subjectIds.includes(subject.id)) return;

    const weight = 1;
    const status = attendance[day.date]?.[subject.id] ?? "present";

    if (status === "cancelled") {
      cancelled += weight;
      return;
    }

    total += weight;

    if (status === "present") present += weight;
    if (status === "absent") absent += weight;
    if (status === "od") {
      present += weight;
      od += weight;
    }
  });

  const percentage = total === 0 ? 100 : (present / total) * 100;

  return {
    total,
    present,
    absent,
    od,
    cancelled,
    percentage: Number(percentage.toFixed(2)),
  };
}

/**
 * How many more classes the subject can miss before a given cutoff date while
 * still satisfying the 75% rule. Cumulative from semester start — matches VIT
 * checking cumulative attendance before each exam.
 */
export function canMissUntil(
  subject: Subject,
  calendar: DailyCalendarEntry[],
  attendance: AttendanceRecord,
  timetable: Record<number, string[]>,
  cutoffDate: string,
): number {
  const stats = calculateSubjectStats(
    subject,
    calendar,
    attendance,
    timetable,
    cutoffDate,
  );
  return Math.max(maxAllowedAbsences(stats.total) - stats.absent, 0);
}

/**
 * The ordered exam sequence relevant to a subject:
 *  - theory → CAT 1, CAT 2, FAT (theory/both)
 *  - lab    → FAT (lab/both) only
 */
export function getExamSequenceForSubject(
  subject: Subject,
  cutoffs: ExamCutoff[],
): ExamCutoff[] {
  if (subject.type === "lab") {
    return cutoffs.filter(
      (c) => c.kind === "FAT" && (c.scope === "lab" || c.scope === "both"),
    );
  }
  return cutoffs.filter((c) => {
    if (c.kind === "CAT1" || c.kind === "CAT2") {
      return c.scope === "theory" || c.scope === "both";
    }
    // FAT for theory subjects
    return c.scope === "theory" || c.scope === "both";
  });
}

/** The next upcoming exam for a subject (or the last one if all have passed). */
export function getNextExamForSubject(
  subject: Subject,
  cutoffs: ExamCutoff[],
  today: string,
): ExamCutoff | null {
  const seq = getExamSequenceForSubject(subject, cutoffs);
  if (seq.length === 0) return null;
  return seq.find((e) => e.date >= today) ?? seq[seq.length - 1];
}

export function getAttendanceSnapshot(
  subject: Subject,
  calendar: DailyCalendarEntry[],
  attendance: AttendanceRecord,
  timetable: Record<number, string[]>,
  untilDate?: string,
) {
  return calculateSubjectStats(
    subject,
    calendar,
    attendance,
    timetable,
    untilDate,
  );
}

export function getAttendanceHistory(
  subject: Subject,
  calendar: DailyCalendarEntry[],
  attendance: AttendanceRecord,
  timetable: Record<number, string[]>,
  untilDate?: string,
  startDate?: string,
): { date: string; status: AttendanceStatus }[] {
  const history: { date: string; status: AttendanceStatus }[] = [];

  calendar.forEach((day) => {
    if (day.type !== "instructional") return;
    if (untilDate && day.date > untilDate) return;
    if (startDate && day.date < startDate) return;

    const effectiveWeekday = getEffectiveWeekday(day);
    const subjectIds = timetable[effectiveWeekday] || [];

    if (!subjectIds.includes(subject.id)) return;

    const status = attendance[day.date]?.[subject.id];

    if (status === "absent" || status === "od") {
      history.push({
        date: day.date,
        status,
      });
    }
  });

  return history;
}

/** Are there any working Saturdays (day-order overrides on weekends) between
 *  now and the cutoff? Used to warn the user that adding them improves
 *  accuracy. We can only detect ones already added — so we surface a general
 *  reminder whenever a future exam window exists. */
export function hasFutureInstructionalDays(
  calendar: DailyCalendarEntry[],
  fromDate: string,
  toDate: string,
): boolean {
  return calendar.some(
    (d) =>
      d.type === "instructional" && d.date > fromDate && d.date <= toDate,
  );
}
