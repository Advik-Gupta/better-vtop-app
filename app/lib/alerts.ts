import {
  calculateSubjectStats,
  canMissUntil,
  getNextExamForSubject,
  displayPct,
  meetsThreshold,
} from "@/app/lib/attendanceLogic";
import type { ExamCutoff } from "@/app/lib/calendarConfig";
import type {
  Subject,
  AttendanceRecord,
  DailyCalendarEntry,
} from "@/app/types/attendance";
import type { ImportantDates } from "@/app/lib/importantDates";

export type AlertSeverity = "critical" | "warning" | "info";

export interface AppAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  /** Stable key used to remember "don't show again". */
  dismissKey: string;
  canDismissForever: boolean;
}

/** Subjects with this many or fewer "safe absences" left are flagged. */
export const RISKY_THRESHOLD = 2;

const DISMISS_KEY = "alertDismissals";

export function loadDismissals(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function addDismissal(key: string) {
  if (typeof window === "undefined") return;
  const set = loadDismissals();
  set.add(key);
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  info: 1,
  warning: 2,
};

export function computeAlerts(
  subjects: Subject[],
  calendar: DailyCalendarEntry[],
  attendance: AttendanceRecord,
  timetable: Record<number, string[]>,
  cutoffs: ExamCutoff[],
  important: ImportantDates,
  today: string,
): AppAlert[] {
  const dismissed = loadDismissals();
  const alerts: AppAlert[] = [];

  // 1) Risky-attendance alerts
  for (const sub of subjects) {
    const nextExam = getNextExamForSubject(sub, cutoffs, today);
    if (!nextExam) continue;

    const canMiss = canMissUntil(
      sub,
      calendar,
      attendance,
      timetable,
      nextExam.date,
    );
    const current = calculateSubjectStats(
      sub,
      calendar,
      attendance,
      timetable,
      today,
    );
    if (current.total === 0) continue;
    if (canMiss > RISKY_THRESHOLD) continue;

    const pct = displayPct(current.percentage);
    const belowThreshold = !meetsThreshold(current.percentage);
    const severity: AlertSeverity =
      canMiss === 0 || belowThreshold ? "critical" : "warning";

    const dismissKey = `risky:${sub.id}:${canMiss}`;
    if (dismissed.has(dismissKey)) continue;

    const message = belowThreshold
      ? `${sub.name} is at ${pct}% — below the 75% needed for ${nextExam.label}. Attend the next classes to recover.`
      : canMiss === 0
        ? `${sub.name} is at ${pct}%. You cannot miss any more classes before ${nextExam.label} without dropping below 75%.`
        : `${sub.name} is at ${pct}%. You can miss only ${canMiss} more class${canMiss === 1 ? "" : "es"} before ${nextExam.label} to stay above 75%.`;

    alerts.push({
      id: dismissKey,
      severity,
      title: belowThreshold
        ? "⚠ Attendance below 75%"
        : "Attendance getting risky",
      message,
      dismissKey,
      canDismissForever: true,
    });
  }

  // 2) Important-day alert (today)
  const note = important[today];
  if (note !== undefined) {
    const dismissKey = `important:${today}`;
    if (!dismissed.has(dismissKey)) {
      alerts.push({
        id: dismissKey,
        severity: "info",
        title: "★ Today is marked important",
        message:
          note && note.trim().length > 0
            ? note
            : "You marked today as important — you may have a quiz or test today.",
        dismissKey,
        canDismissForever: true,
      });
    }
  }

  return alerts.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}
