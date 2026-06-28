"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadFromStorage, saveToStorage } from "@/app/lib/storage";
import {
  FALL_2026_27_DEFAULT,
  generateCalendar,
  newId,
  type CalendarConfig,
  type ExamEntry,
  type EventEntry,
  type ExamKind,
  type ExamScope,
} from "@/app/lib/calendarConfig";
import type {
  DailyCalendarEntry,
  DayType,
  Weekday,
} from "@/app/types/attendance";
import Toast from "@/app/components/Toast";
import "./CalendarEditor.css";

/* ── date helpers ── */
function shift(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthKey(iso: string) {
  return iso.slice(0, 7);
}
function monthLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return (
    d.toLocaleString("en-GB", { month: "long" }).toUpperCase() +
    " " +
    d.getFullYear()
  );
}
function monthShort(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return (
    d.toLocaleString("en-GB", { month: "short" }).toUpperCase() +
    " " +
    d.getFullYear().toString().slice(2)
  );
}
function jsToMonSun(jsDay: number) {
  return (jsDay + 6) % 7;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_OPTS: { label: string; value: Weekday }[] = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
];

const TYPE_META: Record<DayType, { label: string; cls: string }> = {
  instructional: { label: "Class", cls: "t-inst" },
  exam: { label: "Exam", cls: "t-exam" },
  holiday: { label: "Holiday", cls: "t-holiday" },
  festival: { label: "Festival", cls: "t-festival" },
  no_instruction: { label: "No class", cls: "t-noinst" },
  vacation: { label: "Vacation", cls: "t-vacation" },
  academic_process: { label: "Process", cls: "t-process" },
};

/** Remove the [start,end] span from a set of dated entries, splitting any
 *  entry that straddles the span into the surviving before/after pieces. */
function removeRange<T extends { id: string; start: string; end: string }>(
  entries: T[],
  start: string,
  end: string,
): T[] {
  const out: T[] = [];
  for (const e of entries) {
    if (e.end < start || e.start > end) {
      out.push(e);
      continue;
    }
    if (e.start < start) {
      out.push({ ...e, id: newId("e"), end: shift(start, -1) });
    }
    if (e.end > end) {
      out.push({ ...e, id: newId("e"), start: shift(end, 1) });
    }
  }
  return out;
}

export default function CalendarEditor() {
  const [config, setConfig] = useState<CalendarConfig>(() =>
    loadFromStorage<CalendarConfig>("calendarConfig", FALL_2026_27_DEFAULT),
  );
  const [mounted, setMounted] = useState(false);
  const [activeMonth, setActiveMonth] = useState<string>("");
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);
  const [toast, setToast] = useState({ visible: false, msg: "" });

  useEffect(() => {
    setMounted(true);
  }, []);

  const calendar = useMemo(() => generateCalendar(config), [config]);

  const monthMap = useMemo(() => {
    const map: Record<string, DailyCalendarEntry[]> = {};
    for (const d of calendar) {
      const k = monthKey(d.date);
      (map[k] ||= []).push(d);
    }
    return map;
  }, [calendar]);
  const monthKeys = Object.keys(monthMap);
  const currentMonth = activeMonth || monthKeys[0] || "";

  const showToast = (msg: string) => {
    setToast({ visible: true, msg });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  };

  const persist = (next: CalendarConfig, msg: string) => {
    setConfig(next);
    saveToStorage("calendarConfig", next);
    showToast(msg);
  };

  /* ── selection ── */
  const onDayClick = (date: string) => {
    if (selStart && !selEnd) {
      if (date < selStart) {
        setSelEnd(selStart);
        setSelStart(date);
      } else {
        setSelEnd(date);
      }
    } else {
      setSelStart(date);
      setSelEnd(null);
    }
  };

  const inSelection = (date: string) => {
    if (!selStart) return false;
    const end = selEnd ?? selStart;
    const lo = selStart < end ? selStart : end;
    const hi = selStart < end ? end : selStart;
    return date >= lo && date <= hi;
  };

  const clearSelection = () => {
    setSelStart(null);
    setSelEnd(null);
  };

  const range = selStart ? { start: selStart, end: selEnd ?? selStart } : null;
  const isSingleDay = range && range.start === range.end;

  /* ── apply actions ── */
  const applyExam = (kind: ExamKind, scope: ExamScope) => {
    if (!range) return;
    const cleanedExams = removeRange(config.exams, range.start, range.end);
    const cleanedEvents = removeRange(config.events, range.start, range.end);
    const dayOrders = { ...config.dayOrders };
    for (const d of Object.keys(dayOrders))
      if (d >= range.start && d <= range.end) delete dayOrders[d];
    const exam: ExamEntry = {
      id: newId("exam"),
      kind,
      scope,
      start: range.start,
      end: range.end,
    };
    persist(
      { ...config, exams: [...cleanedExams, exam], events: cleanedEvents, dayOrders },
      "Exam range set",
    );
    clearSelection();
  };

  const applyEvent = (type: DayType, title: string) => {
    if (!range) return;
    const cleanedExams = removeRange(config.exams, range.start, range.end);
    const cleanedEvents = removeRange(config.events, range.start, range.end);
    const dayOrders = { ...config.dayOrders };
    for (const d of Object.keys(dayOrders))
      if (d >= range.start && d <= range.end) delete dayOrders[d];
    const ev: EventEntry = {
      id: newId("ev"),
      type,
      title,
      start: range.start,
      end: range.end,
    };
    persist(
      { ...config, exams: cleanedExams, events: [...cleanedEvents, ev], dayOrders },
      `Marked as ${title}`,
    );
    clearSelection();
  };

  const applyClear = () => {
    if (!range) return;
    const dayOrders = { ...config.dayOrders };
    for (const d of Object.keys(dayOrders))
      if (d >= range.start && d <= range.end) delete dayOrders[d];
    persist(
      {
        ...config,
        exams: removeRange(config.exams, range.start, range.end),
        events: removeRange(config.events, range.start, range.end),
        dayOrders,
      },
      "Reset to default classes",
    );
    clearSelection();
  };

  const applyDayOrder = (weekday: Weekday | null) => {
    if (!range || !isSingleDay) return;
    const date = range.start;
    const dayOrders = { ...config.dayOrders };
    // clear exam/event on this day so the day-order takes effect cleanly
    const exams = removeRange(config.exams, date, date);
    const events = removeRange(config.events, date, date);
    if (weekday === null) delete dayOrders[date];
    else dayOrders[date] = weekday;
    persist(
      { ...config, exams, events, dayOrders },
      weekday === null ? "Day order cleared" : "Working day set",
    );
    clearSelection();
  };

  const resetToDefault = () => {
    if (!window.confirm("Reset the entire calendar to the Fall 2026-27 default?"))
      return;
    persist(FALL_2026_27_DEFAULT, "Calendar reset to default");
    clearSelection();
  };

  if (!mounted) return null;

  const activeDays = monthMap[currentMonth] ?? [];
  const cells: (DailyCalendarEntry | null)[] = activeDays.length
    ? [
        ...Array(
          jsToMonSun(new Date(activeDays[0].date + "T00:00:00").getDay()),
        ).fill(null),
        ...activeDays,
      ]
    : [];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="ce-root">
      <div className="ce-header">
        <div>
          <Link href="/" className="ce-back">
            ← Back to tracker
          </Link>
          <h1 className="ce-title">Academic Calendar</h1>
          <p className="ce-subtitle">{config.name}</p>
        </div>
        <button className="ce-reset-btn" onClick={resetToDefault}>
          ⟲ Reset to default
        </button>
      </div>

      <p className="ce-hint">
        Tap a day, then tap another to select a range — then choose what it is.
        For a single Saturday running another day&apos;s timetable, select just
        that day and set its <strong>day order</strong>.
      </p>

      {/* month nav */}
      <div className="ce-month-nav">
        {monthKeys.map((k) => (
          <button
            key={k}
            className={`ce-month-btn ${currentMonth === k ? "active" : ""}`}
            onClick={() => setActiveMonth(k)}
          >
            {monthShort(monthMap[k][0].date)}
          </button>
        ))}
      </div>

      {activeDays.length > 0 && (
        <>
          <div className="ce-month-title">{monthLabel(activeDays[0].date)}</div>
          <div className="ce-weekday-row">
            {WEEKDAY_LABELS.map((l, i) => (
              <div key={l} className={`ce-wd ${i >= 5 ? "weekend" : ""}`}>
                {l}
              </div>
            ))}
          </div>
          <div className="ce-grid">
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} className="ce-cell empty" />;
              const meta = TYPE_META[day.type];
              const selected = inSelection(day.date);
              const isEdge =
                day.date === selStart || day.date === selEnd;
              const hasOrder = !!config.dayOrders[day.date];
              const d = new Date(day.date + "T00:00:00");
              return (
                <button
                  key={day.date}
                  onClick={() => onDayClick(day.date)}
                  className={`ce-cell ${meta.cls}${selected ? " selected" : ""}${isEdge ? " edge" : ""}`}
                  title={day.title}
                >
                  <span className="ce-cell-num">{d.getDate()}</span>
                  <span className="ce-cell-type">{meta.label}</span>
                  {hasOrder && <span className="ce-cell-order">⤳</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* action panel */}
      {range && (
        <div className="ce-panel">
          <div className="ce-panel-head">
            <span>
              {range.start === range.end
                ? `Selected ${range.start}`
                : `${range.start} → ${range.end}`}
            </span>
            <button className="ce-panel-close" onClick={clearSelection}>
              ✕
            </button>
          </div>

          <div className="ce-panel-group">
            <span className="ce-group-label">Exam</span>
            <div className="ce-btn-row">
              <button onClick={() => applyExam("CAT1", "both")}>CAT 1</button>
              <button onClick={() => applyExam("CAT2", "both")}>CAT 2</button>
              <button onClick={() => applyExam("FAT", "theory")}>
                Final (Theory)
              </button>
              <button onClick={() => applyExam("FAT", "lab")}>
                Final (Lab)
              </button>
              <button onClick={() => applyExam("FAT", "both")}>
                Final (Both)
              </button>
            </div>
          </div>

          <div className="ce-panel-group">
            <span className="ce-group-label">Non-instructional</span>
            <div className="ce-btn-row">
              <button onClick={() => applyEvent("holiday", "Holiday")}>
                Holiday
              </button>
              <button onClick={() => applyEvent("festival", "Festival")}>
                Festival
              </button>
              <button onClick={() => applyEvent("festival", "Gravitas")}>
                Gravitas
              </button>
              <button onClick={() => applyEvent("festival", "Riviera")}>
                Riviera
              </button>
              <button
                onClick={() => applyEvent("no_instruction", "No Instruction")}
              >
                No Instruction
              </button>
              <button onClick={() => applyEvent("vacation", "Vacation")}>
                Vacation
              </button>
            </div>
          </div>

          {isSingleDay && (
            <div className="ce-panel-group">
              <span className="ce-group-label">
                Day order (working day running another day&apos;s timetable)
              </span>
              <div className="ce-btn-row">
                {WEEKDAY_OPTS.map((w) => (
                  <button
                    key={w.value}
                    className={
                      config.dayOrders[range.start] === w.value ? "on" : ""
                    }
                    onClick={() => applyDayOrder(w.value)}
                  >
                    {w.label}
                  </button>
                ))}
                <button onClick={() => applyDayOrder(null)}>None</button>
              </div>
            </div>
          )}

          <div className="ce-panel-group">
            <button className="ce-clear-btn" onClick={applyClear}>
              ↺ Reset selection to default classes
            </button>
          </div>
        </div>
      )}

      <Toast message={toast.msg} visible={toast.visible} />
    </div>
  );
}
