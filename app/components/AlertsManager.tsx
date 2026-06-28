"use client";

import { useEffect, useState } from "react";
import {
  computeAlerts,
  addDismissal,
  type AppAlert,
} from "@/app/lib/alerts";
import { loadImportantDates } from "@/app/lib/importantDates";
import {
  ensureNotificationPermission,
  showLocalNotification,
} from "@/app/lib/notifications";
import type { ExamCutoff } from "@/app/lib/calendarConfig";
import type {
  Subject,
  AttendanceRecord,
  DailyCalendarEntry,
} from "@/app/types/attendance";
import "./AlertsManager.css";

interface AlertsManagerProps {
  subjects: Subject[];
  calendar: DailyCalendarEntry[];
  attendance: AttendanceRecord;
  timetable: Record<number, string[]>;
  cutoffs: ExamCutoff[];
}

export default function AlertsManager({
  subjects,
  calendar,
  attendance,
  timetable,
  cutoffs,
}: AlertsManagerProps) {
  const [queue] = useState<AppAlert[]>(() => {
    if (typeof window === "undefined") return [];
    const today = new Date().toISOString().split("T")[0];
    return computeAlerts(
      subjects,
      calendar,
      attendance,
      timetable,
      cutoffs,
      loadImportantDates(),
      today,
    );
  });
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fire on-device notifications once, after permission is (re)confirmed.
  useEffect(() => {
    if (queue.length === 0) return;
    let cancelled = false;
    (async () => {
      const ok = await ensureNotificationPermission();
      if (!ok || cancelled) return;
      for (const a of queue) {
        await showLocalNotification(
          a.title.replace(/^[★⚠]\s*/, ""),
          a.message,
          a.dismissKey,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // run once for the initial queue
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;
  if (index >= queue.length) return null;

  const alert = queue[index];
  const advance = () => setIndex((i) => i + 1);
  const dismissForever = () => {
    addDismissal(alert.dismissKey);
    advance();
  };

  const remaining = queue.length - index - 1;

  return (
    <div className="alert-backdrop" onClick={advance}>
      <div
        className={`alert-modal sev-${alert.severity}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="alert-accent" />
        <div className="alert-head">
          <span className="alert-title">{alert.title}</span>
          {queue.length > 1 && (
            <span className="alert-count">
              {index + 1}/{queue.length}
            </span>
          )}
        </div>
        <p className="alert-message">{alert.message}</p>
        <div className="alert-actions">
          {alert.canDismissForever && (
            <button className="alert-btn alert-btn-ghost" onClick={dismissForever}>
              Don&apos;t show again
            </button>
          )}
          <button className="alert-btn alert-btn-primary" onClick={advance}>
            {remaining > 0 ? "Next" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
