import type {
  DailyCalendarEntry,
  DayType,
  Weekday,
} from "@/app/types/attendance";

/* ──────────────────────────────────────────────────────────────────────────
   CALENDAR CONFIG
   A fully data-driven, user-editable academic calendar. The daily calendar
   (DailyCalendarEntry[]) consumed by the rest of the app is generated from
   this config, so a new semester never needs a code change.
   ────────────────────────────────────────────────────────────────────────── */

export type ExamKind = "CAT1" | "CAT2" | "FAT";
export type ExamScope = "theory" | "lab" | "both";

export interface ExamEntry {
  id: string;
  kind: ExamKind;
  scope: ExamScope; // FAT can be theory-only, lab-only, or both
  start: string; // ISO date — also the 75% cutoff for this exam
  end: string; // ISO date (inclusive)
}

export interface EventEntry {
  id: string;
  type: DayType; // holiday | festival | no_instruction | vacation | academic_process
  title: string;
  start: string;
  end: string; // inclusive
}

export interface CalendarConfig {
  name: string;
  start: string; // semester start (commencement)
  end: string; // semester end
  exams: ExamEntry[];
  events: EventEntry[];
  // ISO date -> weekday (1..5) whose timetable runs that day.
  // Used for working Saturdays or shuffled day-orders.
  dayOrders: Record<string, Weekday>;
}

/* ── ID + date helpers ── */

let idCounter = 0;
export function newId(prefix = "id"): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

function isWithin(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function getDayName(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

const WEEKDAY_NAMES: Record<Weekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
};

/* ──────────────────────────────────────────────────────────────────────────
   DEFAULT: Fall Semester 2026-27 (from the official academic calendar)
   ────────────────────────────────────────────────────────────────────────── */

export const FALL_2026_27_DEFAULT: CalendarConfig = {
  name: "Fall Semester 2026-27",
  start: "2026-07-06", // Commencement of Fall Semester
  end: "2026-12-01", // End of theory FAT
  exams: [
    {
      id: "exam_cat1",
      kind: "CAT1",
      scope: "both",
      start: "2026-08-09",
      end: "2026-08-16",
    },
    {
      id: "exam_cat2",
      kind: "CAT2",
      scope: "both",
      start: "2026-09-27",
      end: "2026-10-04",
    },
    {
      id: "exam_fat_lab",
      kind: "FAT",
      scope: "lab",
      start: "2026-10-26",
      end: "2026-10-30",
    },
    {
      id: "exam_fat_theory",
      kind: "FAT",
      scope: "theory",
      start: "2026-11-12",
      end: "2026-12-01",
    },
  ],
  events: [
    {
      id: "ev_independence",
      type: "holiday",
      title: "Independence Day",
      start: "2026-08-15",
      end: "2026-08-15",
    },
    {
      id: "ev_meelad",
      type: "no_instruction",
      title: "Meelad-un-Nabi / Onam",
      start: "2026-08-26",
      end: "2026-08-26",
    },
    {
      id: "ev_festivity",
      type: "festival",
      title: "Festivity Day",
      start: "2026-09-04",
      end: "2026-09-04",
    },
    {
      id: "ev_vinayakar",
      type: "holiday",
      title: "Vinayakar Chathurthi",
      start: "2026-09-14",
      end: "2026-09-14",
    },
    {
      id: "ev_gravitas",
      type: "no_instruction",
      title: "Gravitas'26",
      start: "2026-09-18",
      end: "2026-09-20",
    },
    {
      id: "ev_gandhi",
      type: "holiday",
      title: "Gandhi Jayanthi",
      start: "2026-10-02",
      end: "2026-10-02",
    },
    {
      id: "ev_ayutha",
      type: "holiday",
      title: "Ayutha Pooja",
      start: "2026-10-19",
      end: "2026-10-19",
    },
    {
      id: "ev_deepavali",
      type: "holiday",
      title: "Deepavali",
      start: "2026-11-04",
      end: "2026-11-11",
    },
  ],
  dayOrders: {},
};

/* ──────────────────────────────────────────────────────────────────────────
   GENERATION
   ────────────────────────────────────────────────────────────────────────── */

const EXAM_TITLES: Record<ExamKind, string> = {
  CAT1: "CAT - I",
  CAT2: "CAT - II",
  FAT: "Final Assessment Test",
};

function examTitle(exam: ExamEntry): string {
  if (exam.kind === "FAT") {
    if (exam.scope === "lab") return "FAT - Lab";
    if (exam.scope === "theory") return "FAT - Theory";
    return "Final Assessment Test";
  }
  return EXAM_TITLES[exam.kind];
}

export function generateCalendar(cfg: CalendarConfig): DailyCalendarEntry[] {
  const calendar: DailyCalendarEntry[] = [];
  const start = new Date(cfg.start + "T00:00:00");
  const end = new Date(cfg.end + "T00:00:00");

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayName = getDayName(d);
    const jsDay = d.getDay(); // 0=Sun..6=Sat
    const realWeekday = jsDay === 0 ? 7 : jsDay; // 1..7

    // 1) Day-order override → instructional, running that weekday's timetable
    const override = cfg.dayOrders[iso];
    if (override) {
      calendar.push({
        date: iso,
        dayName,
        type: "instructional",
        title: `${WEEKDAY_NAMES[override]} Day Order`,
        dayOrder: override,
      });
      continue;
    }

    // 2) Exam ranges
    const exam = cfg.exams.find((e) => isWithin(iso, e.start, e.end));
    if (exam) {
      calendar.push({
        date: iso,
        dayName,
        type: "exam",
        title: examTitle(exam),
      });
      continue;
    }

    // 3) Event ranges (holiday / festival / no_instruction / vacation)
    const event = cfg.events.find((e) => isWithin(iso, e.start, e.end));
    if (event) {
      calendar.push({
        date: iso,
        dayName,
        type: event.type,
        title: event.title,
      });
      continue;
    }

    // 4) Default: weekdays Mon-Fri are instructional, weekends are off
    if (realWeekday >= 1 && realWeekday <= 5) {
      calendar.push({
        date: iso,
        dayName,
        type: "instructional",
        title: "Instructional Day",
        dayOrder: realWeekday as Weekday,
      });
    } else {
      calendar.push({
        date: iso,
        dayName,
        type: "no_instruction",
        title: "Weekend",
      });
    }
  }

  return calendar;
}

/* ──────────────────────────────────────────────────────────────────────────
   EXAM CUTOFFS — the 75%-attendance deadline dates derived from the config.
   ────────────────────────────────────────────────────────────────────────── */

export interface ExamCutoff {
  kind: ExamKind;
  scope: ExamScope;
  label: string;
  date: string; // the cutoff (exam start)
}

export function getExamCutoffs(cfg: CalendarConfig): ExamCutoff[] {
  return [...cfg.exams]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => ({
      kind: e.kind,
      scope: e.scope,
      label: examLabel(e.kind, e.scope),
      date: e.start,
    }));
}

export function examLabel(kind: ExamKind, scope: ExamScope): string {
  if (kind === "FAT") {
    if (scope === "lab") return "Lab FAT";
    if (scope === "theory") return "FAT";
    return "FAT";
  }
  return kind === "CAT1" ? "CAT 1" : "CAT 2";
}
