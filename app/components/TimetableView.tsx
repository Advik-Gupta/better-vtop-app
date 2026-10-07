"use client";

import { useState } from "react";
import { useApp } from "@/app/lib/appContext";
import { blocksForWeekday, dayOrderOn, weekdayOf } from "@/app/lib/engine";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function TimetableView() {
  const { data, look, today, openCourse } = useApp();

  // Today's timetable may be another weekday's (a "Monday day order" Saturday).
  const todayOrder = dayOrderOn(look, today);
  const weekdays = DAYS.map((_, i) => i + 1).filter(
    (d) => d <= 5 || data.timetable.some((e) => e.day === d),
  );
  const [day, setDay] = useState(() => {
    const d = todayOrder ?? weekdayOf(today);
    return weekdays.includes(d) ? d : 1;
  });

  const blocks = blocksForWeekday(data, day);

  return (
    <div className="stack">
      <div className="chips" role="tablist" aria-label="Day of week">
        {weekdays.map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={d === day}
            className={`chip ${d === day ? "active" : ""}`}
            onClick={() => setDay(d)}
          >
            {DAYS[d - 1]}
            {d === todayOrder && <span className="chip-dot" />}
          </button>
        ))}
      </div>

      <section className="card">
        {blocks.length === 0 ? (
          <p className="empty">No classes on {DAYS[day - 1]}.</p>
        ) : (
          <div className="class-list">
            {blocks.map((b) => (
              <div className="class-row" key={b.code}>
                <div className="class-time">
                  <span>{b.start}</span>
                  <span className="class-time-end">{b.end}</span>
                </div>
                <div className="class-main">
                  <button className="class-name" onClick={() => openCourse(b.code)}>
                    {b.course?.name ?? b.code}
                  </button>
                  <div className="class-meta">
                    {b.code} · {b.slots.join("+")}
                  </div>
                  {b.course && <div className="muted small">{b.course.faculty}</div>}
                </div>
                <div className="venue">{b.venue}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {todayOrder && todayOrder !== weekdayOf(today) && (
        <p className="muted small center">
          Today follows the {DAYS[todayOrder - 1]} timetable.
        </p>
      )}
    </div>
  );
}
