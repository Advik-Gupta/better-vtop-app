"use client";

import { useMemo, useRef, useState } from "react";
import { useApp } from "@/app/lib/appContext";
import {
  blocksOn,
  formatDate,
  parseISO,
  toISO,
  weekdayOf,
} from "@/app/lib/engine";
import type { CalendarDay } from "@/app/types/vtop";
import { ClassChip } from "./ClassRow";
import { IconChevron, IconStar } from "./Icons";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Week {
  key: string; // ISO date of the Monday
  days: (CalendarDay | null)[];
}

const mondayOf = (iso: string) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() - (weekdayOf(iso) - 1));
  return toISO(d);
};

function buildWeeks(calendar: CalendarDay[]): Week[] {
  const byKey = new Map<string, Week>();
  for (const day of calendar) {
    const key = mondayOf(day.date);
    if (!byKey.has(key)) byKey.set(key, { key, days: Array(7).fill(null) });
    byKey.get(key)!.days[weekdayOf(day.date) - 1] = day;
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** What to call a day besides its number. */
function dayNote(day: CalendarDay): string {
  if (day.type === "instructional") {
    return day.dayOrder ? `${WEEKDAYS[day.dayOrder - 1]} order` : "";
  }
  if (day.type === "holiday") return day.detail || "Holiday";
  return day.label;
}

/** The semester as a calendar where every day lists its classes and each can
 *  be marked in place. A month grid on wide screens; one week at a time, as a
 *  list, on phones. */
export default function PlannerCalendar() {
  const { data, look, important, setImportant, today, openDay } = useApp();

  const weeks = useMemo(() => buildWeeks(data.calendar), [data.calendar]);
  const months = useMemo(
    () => [...new Set(data.calendar.map((d) => d.date.slice(0, 7)))],
    [data.calendar],
  );
  const dueOn = useMemo(() => {
    const map = new Map<string, typeof data.assignments>();
    for (const a of data.assignments) {
      if (a.due) map.set(a.due, [...(map.get(a.due) ?? []), a]);
    }
    return map;
  }, [data]);

  const homeMonth = months.includes(today.slice(0, 7))
    ? today.slice(0, 7)
    : (months[0] ?? "");
  const homeWeek = weeks.some((w) => w.key === mondayOf(today))
    ? mondayOf(today)
    : (weeks[0]?.key ?? "");

  const [month, setMonth] = useState(homeMonth);
  const [week, setWeek] = useState(homeWeek);
  const todayRef = useRef<HTMLDivElement | null>(null);

  if (!weeks.length) {
    return (
      <p className="empty">
        VTOP has not published a calendar for this semester yet.
      </p>
    );
  }

  const weekIndex = weeks.findIndex((w) => w.key === week);
  const active = weeks[weekIndex];
  const firstOf = (w: Week) => w.days.find(Boolean)!;
  const lastOf = (w: Week) => [...w.days].reverse().find(Boolean)!;

  const goWeek = (i: number) => {
    const w = weeks[i];
    if (!w) return;
    setWeek(w.key);
    setMonth(firstOf(w).date.slice(0, 7));
  };
  const goMonth = (m: string) => {
    setMonth(m);
    const w = weeks.find((x) => x.days.some((d) => d?.date.startsWith(m)));
    if (w) setWeek(w.key);
  };
  const goToday = () => {
    setMonth(homeMonth);
    setWeek(homeWeek);
    setTimeout(
      () =>
        todayRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        }),
      60,
    );
  };

  return (
    <section className="plan">
      <div className="plan-bar">
        <div className="plan-months" role="tablist" aria-label="Month">
          {months.map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={m === month}
              className={`plan-month ${m === month ? "active" : ""}`}
              onClick={() => goMonth(m)}
            >
              {formatDate(m + "-01", { month: "short" })}
            </button>
          ))}
        </div>

        <div className="plan-weeknav">
          <button
            className="icon-btn flip"
            disabled={weekIndex <= 0}
            onClick={() => goWeek(weekIndex - 1)}
            aria-label="Previous week"
          >
            <IconChevron />
          </button>
          <strong>
            {formatDate(firstOf(active).date)} –{" "}
            {formatDate(lastOf(active).date)}
          </strong>
          <button
            className="icon-btn"
            disabled={weekIndex >= weeks.length - 1}
            onClick={() => goWeek(weekIndex + 1)}
            aria-label="Next week"
          >
            <IconChevron />
          </button>
        </div>

        <button className="plan-today" onClick={goToday}>
          Jump to today
        </button>
      </div>

      <div className="plan-grid">
        <div className="plan-head">
          {WEEKDAYS.map((w, i) => (
            <span key={w} className={i >= 5 ? "weekend" : ""}>
              {w}
            </span>
          ))}
        </div>

        {weeks.map((w) => {
          const inMonth = w.days.some((d) => d?.date.startsWith(month));
          return (
            <div
              key={w.key}
              className={`plan-week ${inMonth ? "in-month" : ""} ${w.key === week ? "is-active" : ""}`}
            >
              {w.days.map((day, i) => {
                if (!day) return <div key={i} className="plan-day is-empty" />;
                const blocks = blocksOn(look, day.date);
                const isToday = day.date === today;
                const flagged = important[day.date] !== undefined;
                const note = dayNote(day);
                const due = dueOn.get(day.date) ?? [];
                return (
                  <div
                    key={day.date}
                    ref={isToday ? todayRef : null}
                    className={[
                      "plan-day",
                      `type-${day.type}`,
                      isToday && "is-today",
                      flagged && "is-important",
                      !day.date.startsWith(month) && "is-outside",
                      blocks.length === 0 && due.length === 0 && "is-free",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div className="plan-day-head">
                      <button
                        className="plan-date"
                        onClick={() => openDay(day.date)}
                        aria-label={`Open ${formatDate(day.date, { weekday: "long", day: "numeric", month: "long" })}`}
                      >
                        <span className="plan-num">
                          {parseISO(day.date).getDate()}
                        </span>
                        <span className="plan-wd">{WEEKDAYS[i]}</span>
                        {isToday && (
                          <span className="plan-badge today">Today</span>
                        )}
                      </button>
                      <button
                        className={`plan-star ${flagged ? "active" : ""}`}
                        onClick={() =>
                          flagged
                            ? openDay(day.date)
                            : setImportant(day.date, "")
                        }
                        aria-pressed={flagged}
                        aria-label={
                          flagged
                            ? "Important - open note"
                            : "Mark as important"
                        }
                        title={
                          flagged
                            ? important[day.date] || "Important"
                            : "Mark as important"
                        }
                      >
                        <IconStar filled={flagged} width={15} height={15} />
                      </button>
                    </div>

                    {note && <div className="plan-note">{note}</div>}
                    {flagged && important[day.date] && (
                      <div className="plan-note star">
                        {important[day.date]}
                      </div>
                    )}

                    {due.map((a, n) => (
                      <button
                        key={a.classId + a.title + n}
                        className={`plan-da ${a.submitted ? "done" : ""}`}
                        onClick={() => openDay(day.date)}
                        title={`${a.title} - ${a.course}${a.submitted ? " (submitted)" : ""}`}
                      >
                        <span className="plan-da-tag">
                          {a.submitted ? "DA ✓" : "DA due"}
                        </span>
                        <span className="plan-da-text">
                          {a.title}
                          <small>{a.course}</small>
                        </span>
                      </button>
                    ))}

                    <div className="plan-classes">
                      {blocks.map((b) => (
                        <ClassChip key={b.code} date={day.date} block={b} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="muted small plan-help">
        Every class counts as present unless you mark it Absent or OD. A solid
        colour is VTOP&apos;s record; a dashed outline is your own mark. An OD you
        add over a VTOP absence is kept until VTOP updates. Tap a date for
        timings and notes.
      </p>
    </section>
  );
}
