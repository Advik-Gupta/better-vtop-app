"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/app/lib/appContext";
import {
  daysBetween,
  formatDate,
  relativeDay,
  sortedAssignments,
} from "@/app/lib/engine";
import type { Assignment } from "@/app/types/vtop";

type State = "submitted" | "overdue" | "soon" | "open" | "undated";

function stateOf(a: Assignment, today: string): State {
  if (a.submitted) return "submitted";
  if (!a.due) return "undated";
  if (a.due < today) return "overdue";
  return daysBetween(today, a.due) <= 3 ? "soon" : "open";
}

const isPending = (s: State) => s !== "submitted" && s !== "overdue";

function StatusTag({ a, state, today }: { a: Assignment; state: State; today: string }) {
  if (state === "submitted") return <span className="tag tag-good">Submitted</span>;
  if (state === "overdue") return <span className="tag tag-muted">Past due</span>;
  if (state === "undated") return <span className="tag tag-muted">No date</span>;
  return (
    <span className={`tag ${state === "soon" ? "tag-bad" : "tag-warn"}`}>
      Due {relativeDay(a.due!, today)}
    </span>
  );
}

interface Group {
  code: string;
  course: string;
  items: { a: Assignment; state: State }[];
  submitted: number;
  pending: number;
  nextDue: string;
}

export default function AssignmentsView() {
  const { data, today, openDay } = useApp();
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const all = useMemo(
    () =>
      sortedAssignments(data.assignments).map((a) => ({
        a,
        state: stateOf(a, today),
      })),
    [data.assignments, today],
  );

  // One group per course, the course with the nearest deadline first.
  const groups = useMemo(() => {
    const byCode = new Map<string, Group>();
    for (const item of all) {
      const { a, state } = item;
      if (!byCode.has(a.code)) {
        byCode.set(a.code, {
          code: a.code,
          course: a.course,
          items: [],
          submitted: 0,
          pending: 0,
          nextDue: "9999",
        });
      }
      const g = byCode.get(a.code)!;
      g.items.push(item);
      if (state === "submitted") g.submitted += 1;
      if (isPending(state)) {
        g.pending += 1;
        if (a.due && a.due < g.nextDue) g.nextDue = a.due;
      }
    }
    return [...byCode.values()].sort(
      (x, y) => x.nextDue.localeCompare(y.nextDue) || x.course.localeCompare(y.course),
    );
  }, [all]);

  if (all.length === 0) {
    return (
      <p className="empty">No digital assignments on VTOP for this semester.</p>
    );
  }

  const pending = all.filter((i) => isPending(i.state));
  const thisWeek = pending.filter(
    (i) => i.a.due && daysBetween(today, i.a.due) <= 7,
  );
  const submitted = all.filter((i) => i.state === "submitted").length;
  const upNext = pending.filter((i) => i.a.due).slice(0, 4);

  const shown = groups
    .map((g) => ({
      ...g,
      visible: filter === "all" ? g.items : g.items.filter((i) => isPending(i.state)),
    }))
    .filter((g) => g.visible.length > 0);

  return (
    <div className="stack">
      <section className="summary">
        <div className="tile">
          <span className={`tile-num ${pending.length ? "warn" : "good"}`}>
            {pending.length}
          </span>
          <span className="tile-label">To do</span>
        </div>
        <div className="tile">
          <span className={`tile-num ${thisWeek.length ? "bad" : ""}`}>
            {thisWeek.length}
          </span>
          <span className="tile-label">Due this week</span>
        </div>
        <div className="tile">
          <span className="tile-num">
            {submitted}
            <span className="tile-of">/{all.length}</span>
          </span>
          <span className="tile-label">Submitted</span>
        </div>
      </section>

      {upNext.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Up next</h2>
          </div>
          <ul className="rows">
            {upNext.map(({ a, state }, i) => (
              <li key={a.classId + a.title + i}>
                <button className="row-btn" onClick={() => openDay(a.due!)}>
                  <span className="row-date">
                    {formatDate(a.due!, { day: "numeric" })}
                    <small>{formatDate(a.due!, { month: "short" })}</small>
                  </span>
                  <span className="row-main">
                    <span className="row-title">{a.title}</span>
                    <span className="muted small">{a.course}</span>
                  </span>
                  <StatusTag a={a} state={state} today={today} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="da-filter">
        <h2>By course</h2>
        <div className="chips">
          <button
            className={`chip ${filter === "pending" ? "active" : ""}`}
            aria-pressed={filter === "pending"}
            onClick={() => setFilter("pending")}
          >
            To do · {pending.length}
          </button>
          <button
            className={`chip ${filter === "all" ? "active" : ""}`}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All · {all.length}
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="empty">Nothing left to do.</p>
      ) : (
        <div className="da-grid">
          {shown.map((g) => (
            <section key={g.code} className="card da-course">
              <div className="da-course-head">
                <div>
                  <h3>{g.course}</h3>
                  <span className="muted small">{g.code}</span>
                </div>
                <span className="muted small da-count">
                  {g.submitted}/{g.items.length} submitted
                </span>
              </div>
              <div className="bar" aria-hidden>
                <div
                  className="bar-fill"
                  style={{ width: `${(g.submitted / g.items.length) * 100}%` }}
                />
              </div>
              <ul className="rows">
                {g.visible.map(({ a, state }, i) => (
                  <li key={a.title + i}>
                    <button
                      className={`row-btn ${isPending(state) ? "" : "is-done"}`}
                      disabled={!a.due}
                      onClick={() => a.due && openDay(a.due)}
                    >
                      <span className="row-main">
                        <span className="row-title">{a.title}</span>
                        <span className="muted small">
                          {a.due
                            ? formatDate(a.due, {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })
                            : "No due date"}
                          {a.maxMark && ` · ${a.maxMark} marks`}
                          {a.weightage && ` · ${a.weightage}%`}
                        </span>
                      </span>
                      <StatusTag a={a} state={state} today={today} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="muted small center">
        Upload assignments on VTOP itself - this is a read-only view.
      </p>
    </div>
  );
}
