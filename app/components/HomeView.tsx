"use client";

import { useApp } from "@/app/lib/appContext";
import {
  blocksOn,
  daysBetween,
  formatDate,
  isOpen,
  defaultHorizon,
  pctTone,
  projection,
  relativeDay,
  riskOf,
  shownPct,
  sortedAssignments,
  whenLabel,
} from "@/app/lib/engine";
import ClassRow from "./ClassRow";
import PlannerCalendar from "./PlannerCalendar";

export default function HomeView({
  onSeeAll,
}: {
  onSeeAll: (tab: "attendance" | "tasks") => void;
}) {
  const { data, look, today, stats, important, openDay, openCourse } = useApp();

  const day = look.days.get(today);
  const blocks = blocksOn(look, today);
  const horizon = defaultHorizon(data, today);
  const exam = horizon.date > today ? horizon : null;

  const attended = stats.reduce((n, s) => n + s.attended, 0);
  const total = stats.reduce((n, s) => n + s.total, 0);
  const atRisk = stats.filter((s) => riskOf(s) !== "safe");
  const safeCount = stats.length - atRisk.length;

  const dueSoon = sortedAssignments(data.assignments).filter(
    (a) => isOpen(a, today) && a.due && daysBetween(today, a.due) <= 7,
  );

  // The next day with classes, shown when today has none.
  const nextClassDay = blocks.length
    ? null
    : data.calendar.find(
        (d) => d.date > today && blocksOn(look, d.date).length > 0,
      );

  const dayLabel = !day
    ? "Outside the published calendar"
    : day.label
      ? `${day.label}${day.detail ? ` · ${day.detail}` : ""}`
      : "No classes";

  return (
    <div className="stack">
      <section className="hero">
        <div>
          <p className="eyebrow">{formatDate(today, { weekday: "long" })}</p>
          <h1 className="hero-date">
            {formatDate(today, { day: "numeric", month: "long" })}
          </h1>
          <p className="muted">{dayLabel}</p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-num">{shownPct(attended, total)}%</span>
            <span className="muted small">overall</span>
          </div>
          <div className="hero-stat">
            <span className={`hero-num ${atRisk.length ? "warn" : "good"}`}>
              {safeCount}
              <span className="tile-of">/{stats.length}</span>
            </span>
            <span className="muted small">
              safe{exam ? ` till ${exam.label}` : ""}
            </span>
          </div>
        </div>
      </section>

      {important[today] !== undefined && (
        <button className="notice notice-star" onClick={() => openDay(today)}>
          <strong>Marked important</strong>
          <span>{important[today] || "You flagged today."}</span>
        </button>
      )}

      <div className="home-grid">
        <section className="card">
          <div className="card-head">
            <h2>Today&apos;s classes</h2>
            {blocks.length > 0 && (
              <span className="muted small">{blocks.length}</span>
            )}
          </div>
          {blocks.length > 0 ? (
            <div className="class-list">
              {blocks.map((b) => (
                <ClassRow key={b.code} date={today} block={b} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <p>No classes today.</p>
              {nextClassDay && (
                <button
                  className="link"
                  onClick={() => openDay(nextClassDay.date)}
                >
                  Next:{" "}
                  {formatDate(nextClassDay.date, {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                  })}
                  {" · "}
                  {blocksOn(look, nextClassDay.date).length} classes
                </button>
              )}
            </div>
          )}
        </section>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>{atRisk.length ? "Needs attention" : "Attendance"}</h2>
              <button className="link" onClick={() => onSeeAll("attendance")}>
                Exam by exam
              </button>
            </div>
            {atRisk.length === 0 ? (
              <p className="empty">
                Every course is safe{exam ? ` until ${exam.label}` : ""}.
              </p>
            ) : (
              <ul className="rows">
                {atRisk.map((s) => (
                  <li key={s.course.code}>
                    <button
                      className="row-btn"
                      onClick={() => openCourse(s.course.code)}
                    >
                      <span className={`dot dot-${riskOf(s)}`} />
                      <span className="row-main">
                        <span className="row-title">{s.course.name}</span>
                        <span className="muted small">
                          {s.course.debar ? `${s.course.debar} · ` : ""}
                          {projection(s)}
                        </span>
                      </span>
                      <span className={`num ${pctTone(s)}`}>
                        {s.pct}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Coming up</h2>
              <button className="link" onClick={() => onSeeAll("tasks")}>
                All assignments
              </button>
            </div>
            <ul className="rows">
              {exam && (
                <li>
                  <button
                    className="row-btn"
                    onClick={() => openDay(exam.date)}
                  >
                    <span className="dot dot-exam" />
                    <span className="row-main">
                      <span className="row-title">{exam.label}</span>
                      <span className="muted small">
                        {exam.inferred ? "Classes end - " : "Starts "}
                        {whenLabel(exam)}
                      </span>
                    </span>
                    <span className="muted small">
                      {relativeDay(exam.date, today)}
                    </span>
                  </button>
                </li>
              )}
              {dueSoon.map((a, i) => (
                <li key={a.classId + a.title + i}>
                  <button className="row-btn" onClick={() => openDay(a.due!)}>
                    <span className="dot dot-warning" />
                    <span className="row-main">
                      <span className="row-title">{a.title}</span>
                      <span className="muted small">{a.course}</span>
                    </span>
                    <span className="muted small">
                      due {relativeDay(a.due!, today)}
                    </span>
                  </button>
                </li>
              ))}
              {dueSoon.length === 0 && (
                <li className="empty">No assignments due in the next week.</li>
              )}
            </ul>
          </section>
        </div>
      </div>

      <PlannerCalendar />
    </div>
  );
}
