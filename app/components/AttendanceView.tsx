"use client";

import { useMemo } from "react";
import { useApp } from "@/app/lib/appContext";
import {
  REQUIRED,
  classState,
  examOutlook,
  formatDate,
  nextOpenClass,
  outlookSentence,
  pctTone,
  rawPct,
  relativeDay,
  riskOf,
  shownPct,
  statsIf,
  whenLabel,
  type ExamOutlook,
} from "@/app/lib/engine";
import { STATUS_LABEL } from "./ClassRow";
import Sheet from "./Sheet";

function Bar({ attended, total }: { attended: number; total: number }) {
  const pct = Math.min(rawPct(attended, total), 100);
  return (
    <div className="bar" aria-hidden>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
      <div className="bar-mark" style={{ left: `${REQUIRED}%` }} />
    </div>
  );
}

const plural = (n: number) => `${n} class${n === 1 ? "" : "es"}`;

/** One course's standing for one exam, as a pill. */
function ExamCell({ o }: { o: ExamOutlook | undefined }) {
  if (!o) return <span className="muted">-</span>;
  if (o.debarred) return <span className="tag tag-bad">Debarred</span>;
  if (o.past) {
    if (o.total === 0) return <span className="muted">-</span>;
    return (
      <span className={`tag ${o.safe ? "tag-muted" : "tag-bad"}`}>
        {o.pct}% · {o.safe ? "cleared" : "short"}
      </span>
    );
  }
  if (!o.safe) return <span className="tag tag-bad">Out of reach</span>;
  if (o.upcoming === 0)
    return <span className="tag tag-muted">No classes left</span>;
  return (
    <span
      className={`tag ${o.canMiss === 0 ? "tag-bad" : o.canMiss === 1 ? "tag-warn" : "tag-good"}`}
    >
      {o.canMiss === 0 ? "0 left" : `Can miss ${o.canMiss}`}
    </span>
  );
}

export default function AttendanceView() {
  const { look, marks, today, stats, openCourse } = useApp();

  const rows = useMemo(
    () =>
      stats.map((s) => ({
        s,
        outlook: examOutlook(look, marks, s.course, today),
      })),
    [stats, look, marks, today],
  );

  // Every exam any course sits, in date order - the table's columns.
  const exams = useMemo(() => {
    const seen = new Map<string, ExamOutlook>();
    for (const r of rows)
      for (const o of r.outlook) if (!seen.has(o.label)) seen.set(o.label, o);
    return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start));
  }, [rows]);

  const attended = stats.reduce((n, s) => n + s.attended, 0);
  const total = stats.reduce((n, s) => n + s.total, 0);
  const next = exams.find((e) => !e.past);
  const canMissNext = rows.reduce(
    (n, r) =>
      n + (r.outlook.find((o) => o.label === next?.label)?.canMiss ?? 0),
    0,
  );

  return (
    <div className="stack">
      <section className="summary summary-5">
        <div className="tile">
          <span className="tile-num">{shownPct(attended, total)}%</span>
          <span className="tile-label">Overall</span>
        </div>
        <div className="tile">
          <span className="tile-num">{total}</span>
          <span className="tile-label">Total classes</span>
        </div>
        <div className="tile">
          <span className="tile-num good">{attended}</span>
          <span className="tile-label">Attended</span>
        </div>
        <div className="tile">
          <span className="tile-num bad">{total - attended}</span>
          <span className="tile-label">Absent</span>
        </div>
        <div className="tile">
          <span className={`tile-num ${canMissNext === 0 ? "bad" : "warn"}`}>
            {canMissNext}
          </span>
          <span className="tile-label">
            Can miss{next ? ` before ${next.label}` : ""}
          </span>
        </div>
      </section>

      {/* Wide screens: one table, an exam per column. */}
      <section className="card exam-table-wrap">
        <table className="exam-table">
          <thead>
            <tr>
              <th>Course</th>
              <th className="num">Attended</th>
              <th>Attendance</th>
              {exams.map((e) => (
                <th key={e.label}>
                  {e.label}
                  <small>
                    {e.past
                      ? `${formatDate(e.start)} · done`
                      : `${whenLabel(e)} · ${relativeDay(e.start, today)}`}
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, outlook }) => (
              <tr
                key={s.course.code}
                className={`risk-${riskOf(s)}`}
                onClick={() => openCourse(s.course.code)}
              >
                <td>
                  <button className="exam-course">
                    <span className="course-name">{s.course.name}</span>
                    <span className="muted small">
                      {s.course.code} · {s.course.typeLabel || s.course.kind}
                    </span>
                  </button>
                </td>
                <td className="num">
                  {s.attended}
                  <span className="tile-of">/{s.total}</span>
                </td>
                <td>
                  <div className="exam-pct">
                    <span className="course-pct">{s.pct}%</span>
                    <Bar attended={s.attended} total={s.total} />
                  </div>
                </td>
                {exams.map((e) => (
                  <td key={e.label}>
                    <ExamCell o={outlook.find((o) => o.label === e.label)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Phones: a card per course, an exam per line. */}
      <div className="course-grid exam-cards">
        {rows.map(({ s, outlook }) => (
          <button
            key={s.course.code}
            className={`course-card risk-${riskOf(s)}`}
            onClick={() => openCourse(s.course.code)}
          >
            <div className="course-top">
              <div className="course-id">
                <span className="course-name">{s.course.name}</span>
                <span className="muted small">
                  {s.course.code} · {s.course.typeLabel || s.course.kind} ·{" "}
                  {s.attended}/{s.total}
                </span>
              </div>
              <span className="course-pct">{s.pct}%</span>
            </div>
            <Bar attended={s.attended} total={s.total} />
            <div className="exam-lines">
              {outlook.map((o) => (
                <div key={o.label} className="exam-line">
                  <span className={o.past ? "muted" : ""}>
                    {o.past
                      ? o.label
                      : `Before ${o.label} · ${plural(o.upcoming)} left`}
                  </span>
                  <ExamCell o={o} />
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>

      <p className="muted small center">
        &ldquo;Can miss&rdquo; counts classes from today up to each exam, using
        your timetable and VTOP&apos;s academic calendar. A lab day is one
        class. VTOP rounds percentages up, so 74.1% counts as 75%.
      </p>
    </div>
  );
}

export function CourseSheet({
  code,
  onClose,
}: {
  code: string;
  onClose: () => void;
}) {
  const { data, look, marks, today, statsByCode } = useApp();
  const s = statsByCode.get(code);
  if (!s) return null;
  const { course } = s;

  const outlook = examOutlook(look, marks, course, today);
  const records = data.records[code] ?? [];
  const count = (status: string) =>
    records.filter((r) => r.status === status).length;

  // VTOP's records (with any what-if applied) plus the user's own marks.
  const history = [
    ...records.map((r) => {
      const state = classState(look, marks, r.date, code);
      return {
        date: r.date,
        slot: r.slot,
        time: r.time,
        status: state.overridden ? state.status! : r.status,
        note: state.overridden
          ? `what-if · VTOP: ${STATUS_LABEL[r.status]}`
          : "",
        local: state.overridden,
      };
    }),
    ...Object.entries(marks)
      .filter(
        ([date, byCode]) => byCode[code] && !look.recorded.get(date)?.has(code),
      )
      .map(([date, byCode]) => ({
        date,
        slot: "",
        time: "",
        status: byCode[code],
        note: date > today ? "planned" : "your mark",
        local: true,
      })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  // What happens if the very next class is skipped.
  const nextDate = nextOpenClass(look, marks, course, today, s.horizon);
  const skip = nextDate
    ? statsIf(look, marks, course, today, nextDate, "absent")
    : null;

  return (
    <Sheet
      title={course.name}
      subtitle={`${course.code} · ${course.typeLabel || course.kind} · ${course.slot} · ${course.venue}`}
      onClose={onClose}
    >
      <div className={`headline headline-${riskOf(s)}`}>
        <p>{outlookSentence(s)}</p>
        {s.safe && s.belowNow && (
          <p>
            You&apos;re at {s.pct}% today, which is fine - what counts is being at
            75% when {s.horizonLabel} starts. Attend them all and you finish at{" "}
            {s.bestPct}%.
          </p>
        )}
        {course.debar && <p className="bad">VTOP: {course.debar}</p>}
      </div>

      <div className="summary summary-4">
        <div className="tile">
          <span className={`tile-num ${pctTone(s)}`}>{s.pct}%</span>
          <span className="tile-label">Attendance now</span>
        </div>
        <div className="tile">
          <span className="tile-num">
            {s.attended}
            <span className="tile-of">/{s.total}</span>
          </span>
          <span className="tile-label">Attended</span>
        </div>
        <div className="tile">
          <span className="tile-num">{s.upcoming}</span>
          <span className="tile-label">Left before {s.horizonLabel}</span>
        </div>
        <div className="tile">
          <span
            className={`tile-num ${s.safe ? (s.canMiss ? "good" : "warn") : "bad"}`}
          >
            {s.canMiss}
          </span>
          <span className="tile-label">Can still miss</span>
        </div>
      </div>

      <Bar attended={s.attended} total={s.total} />

      {skip && nextDate && (
        <dl className="facts">
          <div>
            <dt>
              If you miss the next class
              <small>
                {formatDate(nextDate, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
                {nextDate === today ? " · today" : ""}
              </small>
            </dt>
            <dd>
              <strong className={pctTone(skip)}>{skip.pct}%</strong>
              {" · "}
              {skip.safe
                ? skip.canMiss > 0
                  ? `still fine, can miss ${skip.canMiss} more`
                  : "still fine, but no more misses"
                : `can't reach 75% by ${skip.horizonLabel}`}
            </dd>
          </div>
        </dl>
      )}

      <h3 className="sheet-section">Exam by exam</h3>
      <dl className="facts">
        {outlook.map((o) => (
          <div key={o.label}>
            <dt>
              {o.label}
              <small>
                {o.past
                  ? formatDate(o.start)
                  : `${whenLabel(o)} · ${plural(o.upcoming)} left`}
              </small>
            </dt>
            <dd>
              <ExamCell o={o} />
            </dd>
          </div>
        ))}
      </dl>

      <dl className="facts">
        {records.length > 0 && (
          <div>
            <dt>On VTOP</dt>
            <dd>
              {count("present")} present · {count("absent")} absent ·{" "}
              {count("od")} on duty
            </dd>
          </div>
        )}
        {s.localTotal > 0 && (
          <div>
            <dt>Your marks</dt>
            <dd>
              {plural(s.localTotal)} not on VTOP yet · {s.localAbsent} absent
            </dd>
          </div>
        )}
        {s.plannedAbsent > 0 && (
          <div>
            <dt>Planned</dt>
            <dd>You plan to miss {plural(s.plannedAbsent)}.</dd>
          </div>
        )}
        <div>
          <dt>Faculty</dt>
          <dd>{course.faculty}</dd>
        </div>
      </dl>

      <h3 className="sheet-section">Class by class</h3>
      {history.length === 0 ? (
        <p className="empty">VTOP has no classes recorded yet.</p>
      ) : (
        <ul className="history">
          {history.map((r, i) => (
            <li key={r.date + r.slot + i}>
              <span className="history-date">
                {formatDate(r.date, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </span>
              <span className="muted small">
                {[r.slot, r.time, r.note].filter(Boolean).join(" · ")}
              </span>
              <span
                className={`pill pill-${r.status} ${r.local ? "pill-local" : ""}`}
              >
                {STATUS_LABEL[r.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        To change a class, open its date on the home calendar.
      </p>
    </Sheet>
  );
}
