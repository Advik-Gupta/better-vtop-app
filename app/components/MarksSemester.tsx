"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/app/lib/appContext";
import { formatDate } from "@/app/lib/engine";
import {
  ABSOLUTE_GRADE,
  COMPONENT_KINDS,
  TARGETS,
  THEORY_INTERNAL,
  analyseCourse,
  expectedWeighted,
  fmt,
  marksCourses,
  neededFor,
  type CourseAnalysis,
  type PlanItem,
} from "@/app/lib/marks";
import { IconChevron, IconClose, IconPlus } from "./Icons";
import Sheet from "./Sheet";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** The course out of 100: earned, lost, still to come, not yet planned. */
function StackBar({ a }: { a: CourseAnalysis }) {
  return (
    <div className="stackbar" aria-hidden>
      <span className="sb-earned" style={{ width: `${a.earned}%` }} />
      <span className="sb-lost" style={{ width: `${a.lost}%` }} />
      <span className="sb-pending" style={{ width: `${a.pending}%` }} />
    </div>
  );
}

function sourceNote(item: PlanItem): string {
  if (item.source === "exam") return `Exam · worth ${fmt(item.weight)}`;
  if (item.source === "custom") return `Added by you · worth ${fmt(item.weight)}`;
  const due = item.due ? `due ${formatDate(item.due)}` : "no due date";
  return `${due}${item.submitted ? " · submitted" : ""} · worth ${fmt(item.weight)}`;
}

function AddComponent({ a }: { a: CourseAnalysis }) {
  const { updatePlan } = useApp();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>(COMPONENT_KINDS[0]);
  const [title, setTitle] = useState("");
  const [weight, setWeight] = useState("");

  // "Quiz" -> "Quiz 1", "Quiz 2"… based on what the course already has.
  const suggested = useMemo(() => {
    if (kind === "Other") return "";
    if (kind === "Course Project") return kind;
    const n = a.items.filter((i) =>
      i.title.toLowerCase().startsWith(kind.toLowerCase()),
    ).length;
    return `${kind} ${n + 1}`;
  }, [kind, a.items]);

  const room = a.unallocated;
  const value = Number(weight);
  const valid = (title.trim() || suggested) && value > 0 && value <= 100;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    updatePlan(a.code, (plan) => ({
      ...plan,
      custom: [
        ...plan.custom,
        {
          id: Date.now().toString(36),
          title: title.trim() || suggested,
          weight: value,
        },
      ],
    }));
    setTitle("");
    setWeight("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button className="add-btn" onClick={() => setOpen(true)}>
        <IconPlus width={16} height={16} />
        Add quiz, project, assessment…
        {room > 0 && (
          <span className="muted">{fmt(room)} marks not planned yet</span>
        )}
      </button>
    );
  }

  return (
    <form className="add-form" onSubmit={add}>
      <select
        className="input"
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        aria-label="Type of component"
      >
        {COMPONENT_KINDS.map((k) => (
          <option key={k}>{k}</option>
        ))}
      </select>
      <input
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={suggested || "Name"}
        aria-label="Name"
      />
      <input
        className="input"
        type="number"
        inputMode="decimal"
        min="0"
        max="100"
        step="any"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder={room > 0 ? `Marks (${fmt(room)} free)` : "Marks"}
        aria-label="Marks it is worth, out of 100"
      />
      <div className="add-actions">
        <button className="btn btn-primary" disabled={!valid}>
          Add
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
      {value > room && value <= 100 && (
        <p className="warn small">
          That is more than the {fmt(room)} marks still unplanned - the course
          would add up to over 100.
        </p>
      )}
    </form>
  );
}

/** Everything about one course's marks, shown in a sheet. */
function CourseDetail({ a }: { a: CourseAnalysis }) {
  const { plans, updatePlan } = useApp();
  const scored = a.items.filter((i) => i.state === "scored");
  const pending = a.items.filter((i) => i.state === "pending");
  const hiddenCount = plans[a.code]?.hidden.length ?? 0;

  const setExpected = (item: PlanItem, raw: string) =>
    updatePlan(a.code, (plan) => {
      const expectedMarks = { ...plan.expectedMarks };
      if (raw === "") delete expectedMarks[item.key];
      else expectedMarks[item.key] = Math.max(0, Math.min(item.max, Number(raw)));
      return { ...plan, expectedMarks };
    });

  const remove = (item: PlanItem) =>
    updatePlan(a.code, (plan) =>
      item.customId
        ? { ...plan, custom: plan.custom.filter((c) => c.id !== item.customId) }
        : { ...plan, hidden: [...plan.hidden, item.key] },
    );

  return (
    <>
      <div className="summary">
        <div className="tile">
          <span className="tile-num">
            {fmt(a.earned)}
            <span className="tile-of">/{fmt(a.evaluated)}</span>
          </span>
          <span className="tile-label">
            Scored{a.rate !== null ? ` · ${pct(a.rate)}` : ""}
          </span>
        </div>
        <div className="tile">
          <span className="tile-num bad">{fmt(a.lost)}</span>
          <span className="tile-label">Lost</span>
        </div>
        <div className="tile">
          <span className="tile-num">{fmt(100 - a.evaluated)}</span>
          <span className="tile-label">Still open</span>
        </div>
      </div>

      <StackBar a={a} />
      <div className="mk-legend">
        <span><i className="sw sb-earned" />Scored</span>
        <span><i className="sw sb-lost" />Lost</span>
        <span><i className="sw sb-pending" />To come {fmt(a.pending)}</span>
        {a.unallocated > 0 && (
          <span><i className="sw sb-open" />Not planned {fmt(a.unallocated)}</span>
        )}
      </div>

      {scored.length > 0 && (
        <>
          <h3 className="sheet-section">Evaluated</h3>
          <ul className="mk-rows">
            {scored.map((i) => (
              <li key={i.key}>
                <span className="mk-title">
                  {i.title}
                  <small>
                    counts {fmt(i.weighted!)} of {fmt(i.weight)}
                    {i.remark && ` · ${i.remark}`}
                  </small>
                  {i.absent && <small className="bad">Absent</small>}
                </span>
                <span className="mk-w">
                  {fmt(i.scored!)}
                  <span className="tile-of">/{fmt(i.max)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="sheet-section">Still to come</h3>
      {pending.length === 0 ? (
        <p className="muted small">Nothing listed yet.</p>
      ) : (
        <ul className="mk-rows">
          {pending.map((i) => {
            const counted = expectedWeighted(i);
            return (
              <li key={i.key} className="is-pending">
                <span className="mk-title">
                  {i.title}
                  <small>{sourceNote(i)}</small>
                  {counted !== null && (
                    <small className="good">
                      would count {fmt(counted)} of {fmt(i.weight)}
                    </small>
                  )}
                </span>
                <label className="mk-expect">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max={i.max}
                    step="any"
                    value={i.expectedMarks ?? ""}
                    onChange={(e) => setExpected(i, e.target.value)}
                    placeholder="?"
                    aria-label={`Marks you expect in ${i.title}, out of ${i.max}`}
                  />
                  <span className="tile-of">/{fmt(i.max)}</span>
                </label>
                {i.source !== "exam" ? (
                  <button
                    className="mk-remove"
                    onClick={() => remove(i)}
                    aria-label={`Remove ${i.title}`}
                    title="Remove"
                  >
                    <IconClose width={14} height={14} />
                  </button>
                ) : (
                  <span />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small">
        Type the marks you expect in each one to see where the course lands.
      </p>

      <AddComponent a={a} />
      {a.isTheory && (
        <p className="muted small">
          Theory: CAT-I 15, CAT-II 15, FAT 30 and {THEORY_INTERNAL} internal
          marks, of which {fmt(Math.min(a.internalPlanned, THEORY_INTERNAL))} are
          listed.
        </p>
      )}
      {hiddenCount > 0 && (
        <button
          className="link"
          onClick={() => updatePlan(a.code, (plan) => ({ ...plan, hidden: [] }))}
        >
          Restore {hiddenCount} removed component{hiddenCount === 1 ? "" : "s"}
        </button>
      )}

      <h3 className="sheet-section">Where this can end up</h3>
      <dl className="facts">
        <div>
          <dt>Best possible</dt>
          <dd>
            <strong>{fmt(a.best)}</strong> / 100
          </dd>
        </div>
        {a.atRate !== null && (
          <div>
            <dt>
              At your current rate
              <small>{pct(a.rate!)} on everything left</small>
            </dt>
            <dd>
              <strong>{fmt(a.atRate)}</strong> / 100
            </dd>
          </div>
        )}
        {a.expected !== null && (
          <div>
            <dt>
              With the marks you expect
              <small>current rate where you left it blank</small>
            </dt>
            <dd>
              <strong>{fmt(a.expected)}</strong> / 100
            </dd>
          </div>
        )}
      </dl>
      <div className="mk-targets">
        {TARGETS.map((t) => {
          const need = neededFor(a, t);
          const letter = a.isTheory ? "" : ` (${ABSOLUTE_GRADE[t]})`;
          return (
            <span
              key={t}
              className={`tag ${need === null ? "tag-muted" : need === 0 ? "tag-good" : need > 0.9 ? "tag-bad" : need > 0.75 ? "tag-warn" : "tag-good"}`}
            >
              {t}+{letter}:{" "}
              {need === null
                ? "out of reach"
                : need === 0
                  ? "secured"
                  : `need ${pct(need)} of what's left`}
            </span>
          );
        })}
      </div>
    </>
  );
}

/** The short form: one glanceable card per course. */
function CourseCard({ a, onOpen }: { a: CourseAnalysis; onOpen: () => void }) {
  const waiting = a.items.filter((i) => i.state === "pending").length;
  const projected = a.expected ?? a.atRate;
  return (
    <button className="mk-card" onClick={onOpen}>
      <div className="mk-card-top">
        <div className="course-id">
          <span className="course-name">{a.name}</span>
          <span className="muted small">{a.code}</span>
        </div>
        <div className="mk-score">
          <span className="course-pct">
            {fmt(a.earned)}
            <span className="tile-of">/{fmt(a.evaluated)}</span>
          </span>
          <span className="muted small">
            {a.rate === null ? "not evaluated" : pct(a.rate)}
          </span>
        </div>
      </div>
      <StackBar a={a} />
      <div className="mk-card-foot">
        <span className="muted small">
          {waiting} to come
          {projected !== null &&
            ` · ${a.expected !== null ? "expecting" : "on track for"} ${fmt(Math.round(projected))}`}
        </span>
        <IconChevron width={16} height={16} />
      </div>
    </button>
  );
}

export default function MarksSemester() {
  const { data, plans } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const analyses = useMemo(
    () => marksCourses(data).map((c) => analyseCourse(data, plans, c)),
    [data, plans],
  );

  const earned = analyses.reduce((n, a) => n + a.earned, 0);
  const evaluated = analyses.reduce((n, a) => n + a.evaluated, 0);
  const waiting = analyses.reduce(
    (n, a) => n + a.items.filter((i) => i.state === "pending").length,
    0,
  );

  const groups = [
    { title: "Theory", list: analyses.filter((a) => a.isTheory) },
    { title: "Labs and skill courses", list: analyses.filter((a) => !a.isTheory) },
  ].filter((g) => g.list.length > 0);

  const current = analyses.find((a) => a.code === open);

  return (
    <div className="stack">
      <section className="summary">
        <div className="tile">
          <span className="tile-num">
            {evaluated ? pct(earned / evaluated) : "-"}
          </span>
          <span className="tile-label">Scored so far</span>
        </div>
        <div className="tile">
          <span className="tile-num bad">{fmt(evaluated - earned)}</span>
          <span className="tile-label">Marks lost</span>
        </div>
        <div className="tile">
          <span className="tile-num">{waiting}</span>
          <span className="tile-label">Still to come</span>
        </div>
      </section>

      {groups.map((g) => (
        <section key={g.title} className="stack">
          <h2 className="group-title">{g.title}</h2>
          <div className="mk-cards">
            {g.list.map((a) => (
              <CourseCard key={a.code} a={a} onOpen={() => setOpen(a.code)} />
            ))}
          </div>
        </section>
      ))}

      <p className="muted small center">
        Tap a course for every component, what is still to come, and where it
        can end up.
      </p>

      {current && (
        <Sheet
          title={current.name}
          subtitle={`${current.code} · ${current.typeLabel}`}
          onClose={() => setOpen(null)}
        >
          <CourseDetail a={current} />
        </Sheet>
      )}
    </div>
  );
}
