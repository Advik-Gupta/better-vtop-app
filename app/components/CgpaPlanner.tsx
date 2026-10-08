"use client";

import { useState } from "react";
import { useApp } from "@/app/lib/appContext";
import { cgpaTimeline, fmt, gpaOf, planCgpa, type ExtraCredit } from "@/app/lib/marks";
import { loadFromStorage, saveToStorage } from "@/app/lib/storage";

/** A degree runs for eight regular semesters. */
const DEGREE_SEMESTERS = 8;

interface StoredPlan {
  /** The plan is about the semesters after this one; it lapses when a new
   *  semester starts. */
  semesterId: string;
  target: string;
  /** How many semesters, this one included, the target is spread over. */
  span: number;
  /** GPAs the student settled on, by semesters from now (0 = this one). */
  gpas: Record<number, number>;
  /** Credits for later semesters, where the student changed the estimate. */
  credits: Record<number, number>;
}

const shortName = (name: string) =>
  name.replace(" Semester", "").replace(/20(\d\d)-/, "$1-");

/** "Fall Semester 2026-27" is followed by Winter 2026-27, then Fall 2027-28. */
function nameAhead(current: string, steps: number): string | null {
  const m = current.match(/(Fall|Winter)\D*(\d{4})/i);
  if (!m) return null;
  let fall = /fall/i.test(m[1]);
  let year = Number(m[2]);
  for (let i = 0; i < steps; i++) {
    if (!fall) year++;
    fall = !fall;
  }
  return `${fall ? "Fall" : "Winter"} ${String(year).slice(2)}-${String(year + 1).slice(2)}`;
}

const clampGpa = (n: number) => Math.round(Math.max(0, Math.min(10, n)) * 100) / 100;

export default function CgpaPlanner({
  credits,
  extras,
  pickedGpa,
}: {
  /** Graded credits on this semester's timetable. */
  credits: number;
  /** Credits added by hand above; their grades are already decided. */
  extras: ExtraCredit[];
  /** The timetable's GPA from the grades picked above, once all are picked. */
  pickedGpa: number | null;
}) {
  const { data } = useApp();
  const grades = data.grades!;
  const timeline = cgpaTimeline(grades);
  const now = gpaOf(grades.history).gpa;

  const done = timeline.filter((t) => /fall|winter/i.test(t.semester.name)).length;
  const maxSpan = Math.max(1, DEGREE_SEMESTERS - done);

  const [plan, setPlan] = useState<StoredPlan>(() => {
    const blank: StoredPlan = {
      semesterId: data.semester.id,
      target: "",
      span: 1,
      gpas: {},
      credits: {},
    };
    const stored = loadFromStorage<StoredPlan | null>("cgpaPlan", null);
    return stored?.semesterId === blank.semesterId ? { ...blank, ...stored } : blank;
  });
  const update = (patch: Partial<StoredPlan>) => {
    const next = { ...plan, ...patch };
    setPlan(next);
    saveToStorage("cgpaPlan", next);
  };

  const span = Math.min(plan.span, maxSpan);
  const ahead = Array.from({ length: span }, (_, i) => ({
    // Later semesters are assumed to be as heavy as this one until told otherwise.
    credits: i === 0 ? credits : (plan.credits[i] ?? credits),
    gpa: plan.gpas[i],
  }));
  const target = Number(plan.target);
  const result =
    plan.target && target > 0 ? planCgpa(grades, ahead, target, extras) : null;
  const extra = gpaOf(extras);
  // The extras are banked first, so each row's change is its own doing.
  const withExtras = gpaOf([...grades.history, ...extras]).gpa;
  const open = ahead.filter((s) => s.gpa === undefined).length;
  const anyFixed = ahead.some((s) => s.gpa !== undefined);

  const setGpa = (i: number, gpa: number | null) => {
    const gpas = { ...plan.gpas };
    if (gpa === null) delete gpas[i];
    else gpas[i] = clampGpa(gpa);
    update({ gpas });
  };

  const label = (i: number) => ({
    title: `Sem ${done + 1 + i}`,
    sub: [
      i === 0 ? shortName(data.semester.name) : nameAhead(data.semester.name, i),
      i === 0 ? "this semester" : null,
    ]
      .filter(Boolean)
      .join(" · "),
  });

  return (
    <>
      {timeline.length > 0 && (
        <section className="card pad">
          <div className="card-head">
            <h2>How you got here</h2>
          </div>
          <div className="table-scroll">
            <table className="exam-table plan-table">
              <thead>
                <tr>
                  <th>Semester</th>
                  <th className="num">Credits</th>
                  <th className="num">GPA</th>
                  <th className="num">CGPA after</th>
                  <th className="num">Change</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((t, i) => {
                  const before = i > 0 ? timeline[i - 1].cgpa : null;
                  const change =
                    before !== null && t.cgpa !== null ? t.cgpa - before : null;
                  return (
                    <tr key={t.semester.id}>
                      <td>
                        <span className="course-name">Sem {i + 1}</span>
                        <span className="muted small block">
                          {shortName(t.semester.name)}
                        </span>
                      </td>
                      <td className="num">{t.credits}</td>
                      <td className="num">{t.gpa?.toFixed(2) ?? "-"}</td>
                      <td className="num">{t.cgpa?.toFixed(2) ?? "-"}</td>
                      <td
                        className={`num ${change === null ? "muted" : change >= 0 ? "good" : "bad"}`}
                      >
                        {change === null
                          ? "-"
                          : `${change >= 0 ? "+" : ""}${change.toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card pad">
        <div className="card-head">
          <h2>Aiming for a CGPA?</h2>
          {anyFixed && (
            <button className="link" onClick={() => update({ gpas: {} })}>
              Reset plan
            </button>
          )}
        </div>

        <div className="plan-goal">
          <label className="field">
            <span>Target CGPA</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="0"
              max="10"
              step="0.01"
              value={plan.target}
              onChange={(e) => update({ target: e.target.value })}
              placeholder={now?.toFixed(2) ?? "8.50"}
            />
          </label>
          <label className="field">
            <span>By the end of</span>
            <select
              className="input"
              value={span}
              onChange={(e) => update({ span: Number(e.target.value) })}
            >
              {Array.from({ length: maxSpan }, (_, i) => (
                <option key={i} value={i + 1}>
                  {label(i).title}
                  {label(i).sub && ` (${label(i).sub})`}
                </option>
              ))}
            </select>
          </label>
        </div>

        {result === null ? (
          <p className="muted">
            Enter a target to see the GPA you would need in each semester on
            the way there.
          </p>
        ) : (
          <>
            <p className="cg-answer">
              {result.needed === null ? (
                <>
                  This plan finishes on{" "}
                  <strong
                    className={(result.final ?? 0) + 0.005 >= target ? "good" : "bad"}
                  >
                    {result.final?.toFixed(2)}
                  </strong>
                  {(result.final ?? 0) + 0.005 >= target
                    ? `, which reaches ${target.toFixed(2)}.`
                    : `, short of ${target.toFixed(2)}. Raise a semester or undo one of your picks.`}
                </>
              ) : result.needed > 10 ? (
                <>
                  Not reachable by then - the {open === 1 ? "semester" : `${open} semesters`}{" "}
                  left open would need a GPA of{" "}
                  <strong className="bad">{result.needed.toFixed(2)}</strong>. With a
                  10 {open === 1 ? "there" : "in each"} you finish on{" "}
                  <strong>{result.final?.toFixed(2)}</strong>.
                </>
              ) : result.needed <= 0 ? (
                <>You are already above that whatever happens from here.</>
              ) : (
                <>
                  You need a GPA of{" "}
                  <strong className="good">{result.needed.toFixed(2)}</strong>{" "}
                  {span === 1
                    ? "this semester."
                    : open === 1
                      ? "in the semester left open."
                      : `in each of the ${open} semesters${anyFixed ? " left open" : ""}.`}
                </>
              )}
            </p>

            <ul className="plan-rows">
              {extra.gpa !== null && (
                <li className="plan-row">
                  <div className="plan-name">
                    <span className="course-name">Extra credits</span>
                    <span className="muted small">
                      {extras.map((e) => `${e.title} (${e.grade})`).join(", ")}
                    </span>
                  </div>
                  <div className="plan-cell">
                    <input
                      className="plan-box"
                      value={fmt(extra.credits)}
                      disabled
                      aria-label="Extra credits"
                    />
                    <span className="muted small">Credits</span>
                  </div>
                  <div className="plan-cell">
                    <input
                      className="plan-box"
                      value={extra.gpa.toFixed(2)}
                      disabled
                      aria-label="GPA of the extra credits"
                    />
                    <span className="muted small">Already graded</span>
                  </div>
                  <div className="plan-cell plan-after">
                    <span className="plan-value num">
                      {withExtras?.toFixed(2) ?? "-"}
                      {withExtras !== null && now !== null && (
                        <span className={`small ${withExtras >= now ? "good" : "bad"}`}>
                          {withExtras >= now ? "+" : ""}
                          {(withExtras - now).toFixed(2)}
                        </span>
                      )}
                    </span>
                    <span className="muted small">CGPA after</span>
                  </div>
                </li>
              )}
              {result.rows.map((r, i) => {
                const { title, sub } = label(i);
                const before = i === 0 ? withExtras : result.rows[i - 1].cgpaAfter;
                const change =
                  before !== null && r.cgpaAfter !== null ? r.cgpaAfter - before : null;
                return (
                  <li key={i} className="plan-row">
                    <div className="plan-name">
                      <span className="course-name">{title}</span>
                      <span className="muted small">{sub}</span>
                    </div>

                    <label className="plan-cell">
                      <input
                        className="plan-box"
                        type="number"
                        inputMode="decimal"
                        min="1"
                        max="40"
                        step="0.5"
                        value={r.credits}
                        disabled={i === 0}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (n > 0 && n <= 40)
                            update({ credits: { ...plan.credits, [i]: n } });
                        }}
                        aria-label={`Credits in ${title}`}
                      />
                      <span className="muted small">Credits</span>
                    </label>

                    <div className="plan-cell">
                      <div className="plan-stepper">
                        <button
                          onClick={() => setGpa(i, r.gpa - 0.1)}
                          aria-label={`Lower the GPA for ${title}`}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="10"
                          step="0.01"
                          value={r.fixed ? r.gpa : r.gpa.toFixed(2)}
                          onChange={(e) =>
                            setGpa(i, e.target.value === "" ? null : Number(e.target.value))
                          }
                          aria-label={`GPA for ${title}`}
                        />
                        <button
                          onClick={() => setGpa(i, r.gpa + 0.1)}
                          aria-label={`Raise the GPA for ${title}`}
                        >
                          +
                        </button>
                      </div>
                      {r.fixed ? (
                        <button className="link small" onClick={() => setGpa(i, null)}>
                          Your pick · undo
                        </button>
                      ) : (
                        <span className="muted small">GPA needed</span>
                      )}
                    </div>

                    <div className="plan-cell plan-after">
                      <span className="plan-value num">
                        {r.cgpaAfter?.toFixed(2) ?? "-"}
                        {change !== null && (
                          <span className={`small ${change >= 0 ? "good" : "bad"}`}>
                            {change >= 0 ? "+" : ""}
                            {change.toFixed(2)}
                          </span>
                        )}
                      </span>
                      <span className="muted small">CGPA after</span>
                    </div>
                  </li>
                );
              })}
            </ul>

            {pickedGpa !== null && plan.gpas[0] !== clampGpa(pickedGpa) && (
              <button className="link" onClick={() => setGpa(0, pickedGpa)}>
                Use the grades picked above for this semester ({pickedGpa.toFixed(2)})
              </button>
            )}
            <p className="muted small">
              Change any semester&apos;s GPA and the others adjust to still reach
              the target.
              {extra.gpa !== null &&
                " Extra credits keep the grades you gave them above; the semester GPAs are for timetable courses only."}
              {span > 1 &&
                " Later semesters are assumed to carry the same credits as this one - edit them if you know better."}
            </p>
          </>
        )}
      </section>
    </>
  );
}
