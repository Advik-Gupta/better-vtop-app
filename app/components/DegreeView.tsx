"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/app/lib/appContext";
import {
  NORMAL_LIMIT,
  NPTEL_LIMIT,
  degreeProgress,
  searchCourses,
  type CategoryProgress,
  type CourseStatus,
  type DegreePlan,
  type DegreeProgress,
  type PlannedCourse,
  type PoolProgress,
  type SemesterBucket,
} from "@/app/lib/degree";
import { fmt } from "@/app/lib/marks";
import { loadFromStorage, saveToStorage } from "@/app/lib/storage";
import type { VtopData } from "@/app/types/vtop";
import { IconClose, IconPlus } from "./Icons";
import LiveSync from "./LiveSync";
import Sheet from "./Sheet";

const PAGE = 60;

type CatalogueCourse = DegreeProgress["catalogue"][number];

/** Done, this semester and planned, as one bar out of `whole`. */
function StackBar({
  done,
  current,
  planned,
  whole,
  tall,
  minimum,
}: {
  done: number;
  current: number;
  planned: number;
  whole: number;
  tall?: boolean;
  /** Draws a tick where the minimum sits, when it is short of the whole bar. */
  minimum?: number;
}) {
  const share = (n: number) => `${whole ? Math.min(100, (n / whole) * 100) : 0}%`;
  return (
    <div className={`dg-bar ${tall ? "tall" : ""}`}>
      <span className="dg-done" style={{ width: share(done) }} />
      <span className="dg-current" style={{ width: share(current) }} />
      <span className="dg-planned" style={{ width: share(planned) }} />
      {minimum !== undefined && minimum > 0 && minimum < whole && (
        <i className="dg-min" style={{ left: share(minimum) }} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: CourseStatus }) {
  if (status.kind === "done") return <span className="dg-tag done">Done · {status.grade}</span>;
  if (status.kind === "current") return <span className="dg-tag current">This semester</span>;
  if (status.kind === "planned") return <span className="dg-tag planned">Sem {status.semester}</span>;
  return null;
}

function CourseRow({
  course,
  status,
  semesters,
  fixedSemester,
  onAdd,
  onRemove,
}: {
  course: CatalogueCourse;
  status: CourseStatus;
  semesters: SemesterBucket[];
  /** Adding from a semester's own list: no need to ask which one. */
  fixedSemester?: number;
  onAdd: (course: PlannedCourse, semester: number) => void;
  onRemove: (code: string) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const add = (semester: number) => {
    onAdd(
      { code: course.code, name: course.name, credits: course.credits, category: course.category },
      semester,
    );
    setChoosing(false);
  };

  return (
    <li className="dg-course">
      <div className="dg-course-top">
        <div className="dg-course-text">
          <span className="course-name">{course.name || course.code}</span>
          <span className="muted small">
            {course.code} · {fmt(course.credits)} credit{course.credits === 1 ? "" : "s"}
            {course.type && ` · ${course.type}`}
          </span>
        </div>
        <StatusBadge status={status} />
        {status.kind === "planned" && (
          <button
            className="mk-remove"
            onClick={() => onRemove(course.code)}
            aria-label={`Remove ${course.name}`}
          >
            <IconClose width={14} height={14} />
          </button>
        )}
        {status.kind === "open" && (
          <button
            className="dg-add"
            aria-expanded={choosing}
            onClick={() =>
              fixedSemester === undefined ? setChoosing((v) => !v) : add(fixedSemester)
            }
          >
            <IconPlus width={14} height={14} /> Add
          </button>
        )}
      </div>
      {choosing && (
        <div className="dg-choose" role="group" aria-label="Pick a semester">
          {semesters.map((s) => (
            <button key={s.number} onClick={() => add(s.number)}>
              Sem {s.number}
              {s.isCurrent && " · now"}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function CourseList({
  courses,
  progress,
  fixedSemester,
  onAdd,
  onRemove,
  empty,
}: {
  courses: CatalogueCourse[];
  progress: DegreeProgress;
  fixedSemester?: number;
  onAdd: (course: PlannedCourse, semester: number) => void;
  onRemove: (code: string) => void;
  empty: string;
}) {
  const [shown, setShown] = useState(PAGE);
  if (!courses.length) return <p className="empty">{empty}</p>;
  return (
    <>
      <ul className="dg-courses">
        {courses.slice(0, shown).map((c) => (
          <CourseRow
            key={`${c.category}:${c.code}`}
            course={c}
            status={progress.status.get(c.code) ?? { kind: "open" }}
            semesters={progress.semesters}
            fixedSemester={fixedSemester}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        ))}
      </ul>
      {courses.length > shown && (
        <button className="btn btn-inline" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({courses.length - shown} left)
        </button>
      )}
    </>
  );
}

function CategorySheet({
  category,
  progress,
  onAdd,
  onRemove,
  onClose,
}: {
  category: CategoryProgress;
  progress: DegreeProgress;
  onAdd: (course: PlannedCourse, semester: number) => void;
  onRemove: (code: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"todo" | "taken" | "all">("todo");
  const courses = useMemo(() => {
    const mine = progress.catalogue.filter((c) => c.category === category.id);
    const open = (c: CatalogueCourse) => (progress.status.get(c.code)?.kind ?? "open") === "open";
    const picked =
      filter === "all" ? mine : mine.filter((c) => open(c) === (filter === "todo"));
    return searchCourses(picked, query);
  }, [progress, category.id, filter, query]);

  return (
    <Sheet
      title={category.name}
      subtitle={`${fmt(category.done)} done · ${fmt(category.current + category.planned)} on the way · ${
        category.pooled
          ? `min ${fmt(category.required)}, up to ${fmt(category.max)}`
          : `${fmt(category.required)} needed`
      }`}
      onClose={onClose}
    >
      <div className="stack">
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or code"
          aria-label={`Search ${category.name}`}
        />
        <div className="chips" role="group" aria-label="Filter courses">
          {(
            [
              ["todo", "To do"],
              ["taken", "Done or planned"],
              ["all", "All"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`chip ${filter === key ? "active" : ""}`}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <CourseList
          courses={courses}
          progress={progress}
          onAdd={onAdd}
          onRemove={onRemove}
          empty={
            category.courses.length
              ? "No course matches."
              : "VTOP's list for this bucket could not be read. Sync again, or add subjects by hand from the semester plan."
          }
        />
      </div>
    </Sheet>
  );
}

function CategoryCard({
  category,
  onOpen,
}: {
  category: CategoryProgress;
  onOpen: () => void;
}) {
  const got = category.done + category.current + category.planned;
  const whole = Math.max(category.required, category.max);
  const flexible = category.max > category.required;
  const below = category.toGo > 0;
  const met = category.required > 0 && category.done >= category.required;

  let note = flexible ? `Optional · counts up to ${fmt(category.max)}` : "Nothing needed";
  if (met) note = flexible ? `Minimum met · counts up to ${fmt(category.max)}` : "Complete";
  else if (category.required > 0 && !below) note = "Minimum covered by your plan";

  return (
    <button className={`dg-category ${below ? "below" : ""}`} onClick={onOpen}>
      <span className="dg-code">{category.id}</span>
      <span className="dg-category-main">
        <span className="dg-category-top">
          <strong>{category.name}</strong>
          <span className="num">
            {fmt(got)}
            <span className="tile-of">/{fmt(whole)}</span>
          </span>
        </span>
        <StackBar
          done={category.done}
          current={category.current}
          planned={category.planned}
          whole={whole}
          minimum={category.required}
        />
        {below ? (
          <span className="dg-below">
            Below minimum · {fmt(category.toGo)} more needed (min {fmt(category.required)})
          </span>
        ) : (
          <span className={`small ${met ? "good" : "muted"}`}>{note}</span>
        )}
      </span>
    </button>
  );
}

function PoolHeader({ pool }: { pool: PoolProgress }) {
  const got = Math.min(pool.done + pool.current + pool.planned, pool.max);
  const short = Math.max(0, pool.min - got);
  return (
    <div className="dg-pool">
      <div className="credit-top">
        <span>
          <strong>Electives</strong> <span className="muted small">{pool.label} share this total</span>
        </span>
        <span className="num">
          {fmt(got)}
          <span className="tile-of">/{fmt(pool.max)}</span>
        </span>
      </div>
      <StackBar done={pool.done} current={pool.current} planned={pool.planned} whole={pool.max} />
      {short > 0 && <span className="dg-below">Below minimum · {fmt(short)} more needed</span>}
    </div>
  );
}

function AddSheet({
  semester,
  progress,
  onAdd,
  onRemove,
  onClose,
}: {
  semester: SemesterBucket;
  progress: DegreeProgress;
  onAdd: (course: PlannedCourse, semester: number) => void;
  onRemove: (code: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState("");
  const [custom, setCustom] = useState({ code: "", name: "", credits: "", category: "" });
  const credits = Number(custom.credits);
  const validCustom = custom.name.trim() !== "" && credits > 0 && credits <= 30;

  const courses = useMemo(() => {
    const list = progress.catalogue.filter(
      (c) =>
        (!bucket || c.category === bucket) &&
        (progress.status.get(c.code)?.kind ?? "open") === "open",
    );
    return searchCourses(list, query);
  }, [progress, bucket, query]);

  return (
    <Sheet
      title={`Add to Sem ${semester.number}`}
      subtitle={`${fmt(semester.credits)} of ${fmt(semester.limit)} credits so far`}
      onClose={onClose}
    >
      <div className="stack">
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every subject"
          aria-label="Search subjects"
        />
        <div className="chips dg-buckets" role="group" aria-label="Filter by bucket">
          <button
            className={`chip ${bucket === "" ? "active" : ""}`}
            onClick={() => setBucket("")}
          >
            All
          </button>
          {progress.categories
            .filter((c) => c.courses.length)
            .map((c) => (
              <button
                key={c.id}
                className={`chip ${bucket === c.id ? "active" : ""}`}
                onClick={() => setBucket(c.id)}
              >
                {c.id}
              </button>
            ))}
        </div>
        <CourseList
          key={`${bucket}:${query}`}
          courses={courses}
          progress={progress}
          fixedSemester={semester.number}
          onAdd={onAdd}
          onRemove={onRemove}
          empty="No subject matches. You can add it by hand below."
        />
        <details className="dg-custom">
          <summary>Subject not listed? Add it by hand</summary>
          <form
            className="add-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!validCustom) return;
              onAdd(
                {
                  code: custom.code.trim().toUpperCase() || `CUSTOM-${Date.now().toString(36)}`,
                  name: custom.name.trim(),
                  credits,
                  category: custom.category,
                  custom: true,
                },
                semester.number,
              );
              setCustom({ code: "", name: "", credits: "", category: "" });
            }}
          >
            <input
              className="input span-2"
              value={custom.name}
              onChange={(e) => setCustom({ ...custom, name: e.target.value })}
              placeholder="Subject name"
              aria-label="Subject name"
            />
            <input
              className="input"
              value={custom.code}
              onChange={(e) => setCustom({ ...custom, code: e.target.value })}
              placeholder="Code (optional)"
              aria-label="Course code"
            />
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="0"
              max="30"
              step="0.5"
              value={custom.credits}
              onChange={(e) => setCustom({ ...custom, credits: e.target.value })}
              placeholder="Credits"
              aria-label="Credits"
            />
            <select
              className="input span-2"
              value={custom.category}
              onChange={(e) => setCustom({ ...custom, category: e.target.value })}
              aria-label="Bucket"
            >
              <option value="">Which bucket does it count in?</option>
              {progress.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} · {c.name}
                </option>
              ))}
            </select>
            <div className="add-actions">
              <button className="btn btn-primary" disabled={!validCustom}>
                Add
              </button>
            </div>
          </form>
        </details>
      </div>
    </Sheet>
  );
}

function SemesterCard({
  semester,
  onAdd,
  onRemove,
}: {
  semester: SemesterBucket;
  onAdd: () => void;
  onRemove: (code: string) => void;
}) {
  const over = semester.credits > semester.limit;
  const row = (c: PlannedCourse, removable: boolean) => (
    <li key={c.code} className="dg-course">
      <div className="dg-course-top">
        <div className="dg-course-text">
          <span className="course-name">{c.name || c.code}</span>
          <span className="muted small">
            {c.code.startsWith("CUSTOM-") ? "Added by hand" : c.code} · {fmt(c.credits)} credit
            {c.credits === 1 ? "" : "s"}
            {c.category && ` · ${c.category}`}
          </span>
        </div>
        {removable ? (
          <button
            className="mk-remove"
            onClick={() => onRemove(c.code)}
            aria-label={`Remove ${c.name}`}
          >
            <IconClose width={14} height={14} />
          </button>
        ) : (
          <span className="dg-tag current">Registered</span>
        )}
      </div>
    </li>
  );

  return (
    <section className="card pad dg-semester">
      <div className="card-head">
        <h2>
          Sem {semester.number} <span className="muted small">{semester.label}</span>
        </h2>
        <span className={`num ${over ? "bad" : ""}`}>
          {fmt(semester.credits)}
          <span className="tile-of">/{fmt(semester.limit)}</span>
        </span>
      </div>
      <div className="bar">
        <div
          className="bar-fill"
          style={{
            width: `${Math.min(100, (semester.credits / semester.limit) * 100)}%`,
            background: over ? "var(--bad)" : undefined,
          }}
        />
      </div>
      {over && (
        <p className="bad small dg-over">
          {fmt(semester.credits - semester.limit)} over the {fmt(semester.limit)} credit limit.
        </p>
      )}
      {semester.registered.length + semester.planned.length > 0 && (
        <ul className="dg-courses">
          {semester.registered.map((c) => row(c, false))}
          {semester.planned.map((c) => row(c, true))}
        </ul>
      )}
      <button className="add-btn" onClick={onAdd}>
        <IconPlus width={16} height={16} />
        Add subjects
      </button>
    </section>
  );
}

export default function DegreeView({ onSync }: { onSync: () => void }) {
  const { data } = useApp();
  if (!data.curriculum?.categories.length || !data.grades) {
    return (
      <section className="card">
        <div className="empty">
          <p>Your curriculum hasn&apos;t been loaded yet.</p>
          <button className="btn btn-primary btn-inline" onClick={onSync}>
            Sync with VTOP
          </button>
        </div>
      </section>
    );
  }
  return (
    <>
      <DegreeBoard data={data} storageKey="degreePlan" />
      <LiveSync parts={["grades", "curriculum"]} />
    </>
  );
}

/** The planner itself, fed either by VTOP or by what the student typed in. */
export function DegreeBoard({
  data,
  storageKey,
  manualDone,
}: {
  data: VtopData;
  storageKey: string;
  manualDone?: Record<string, number>;
}) {
  const [plan, setPlan] = useState<DegreePlan>(() => loadFromStorage<DegreePlan>(storageKey, {}));
  const [section, setSection] = useState<"buckets" | "plan">("buckets");
  const [query, setQuery] = useState("");
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<number | null>(null);

  const progress = useMemo(
    () => degreeProgress(data, plan, manualDone),
    [data, plan, manualDone],
  );

  const save = (next: DegreePlan) => {
    setPlan(next);
    saveToStorage(storageKey, next);
  };
  const remove = (code: string) =>
    save(
      Object.fromEntries(
        Object.entries(plan).map(([k, list]) => [k, list.filter((c) => c.code !== code)]),
      ),
    );
  const add = (course: PlannedCourse, semester: number) => {
    const without = Object.fromEntries(
      Object.entries(plan).map(([k, list]) => [k, list.filter((c) => c.code !== course.code)]),
    );
    save({ ...without, [semester]: [...(without[semester] ?? []), course] });
  };

  const { total, done, current, planned, left } = progress;
  const visible = progress.categories.filter(
    (c) => c.required > 0 || c.max > 0 || c.done + c.current + c.planned > 0,
  );
  const core = visible.filter((c) => !c.pooled);
  const belowMinimum = visible.filter((c) => c.toGo > 0);
  const category = progress.categories.find((c) => c.id === openCategory);
  const target = progress.semesters.find((s) => s.number === addingTo);
  const results = query.trim() ? searchCourses(progress.catalogue, query) : [];

  return (
    <div className="stack">
      <section className="card pad dg-hero">
        <div className="dg-hero-top">
          <div>
            <span className="dg-big">
              {fmt(done)}
              <span className="tile-of"> / {fmt(total)}</span>
            </span>
            <span className="muted small block">credits completed</span>
          </div>
          <span className="dg-percent">{total ? Math.floor((done / total) * 100) : 0}%</span>
        </div>
        <StackBar done={done} current={current} planned={planned} whole={total} tall />
        <div className="dg-legend">
          <span>
            <i className="dg-done" /> Done <strong>{fmt(done)}</strong>
          </span>
          <span>
            <i className="dg-current" /> This semester <strong>{fmt(current)}</strong>
          </span>
          <span>
            <i className="dg-planned" /> Planned <strong>{fmt(planned)}</strong>
          </span>
          <span>
            <i /> Not planned <strong>{fmt(left)}</strong>
          </span>
        </div>
        <div className={`dg-outcome ${left === 0 ? "complete" : ""}`}>
          <div>
            <span className="dg-outcome-label">With this plan you reach</span>
            <span className="dg-outcome-num">
              {fmt(done + current + planned)}
              <span className="tile-of"> / {fmt(total)}</span>
            </span>
          </div>
          <div>
            <span className="dg-outcome-label">{left === 0 ? "Degree" : "Still to place"}</span>
            <span className="dg-outcome-num">
              {left === 0 ? "Fully planned" : fmt(left)}
              {left > 0 && <span className="tile-of"> credit{left === 1 ? "" : "s"}</span>}
            </span>
          </div>
        </div>
        {belowMinimum.length > 0 && (
          <div className="dg-short">
            <span className="small">Below minimum, even with your plan:</span>
            <div className="dg-short-list">
              {belowMinimum.map((c) => (
                <button key={c.id} onClick={() => setOpenCategory(c.id)}>
                  {c.id} <strong>{fmt(c.toGo)}</strong>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="chips sections" role="tablist" aria-label="Degree sections">
        {(
          [
            ["buckets", "Subject buckets"],
            ["plan", "Semester plan"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={section === key}
            className={`chip ${section === key ? "active" : ""}`}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "buckets" && (
        <>
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all subjects"
            aria-label="Search all subjects"
          />
          {query.trim() ? (
            <section className="card pad">
              <CourseList
                key={query}
                courses={results}
                progress={progress}
                onAdd={add}
                onRemove={remove}
                empty="No subject matches."
              />
            </section>
          ) : (
            <>
              <div className="dg-categories">
                {core.map((c) => (
                  <CategoryCard key={c.id} category={c} onOpen={() => setOpenCategory(c.id)} />
                ))}
              </div>
              {progress.pools.map((pool) => (
                <div key={pool.label} className="stack">
                  <PoolHeader pool={pool} />
                  <div className="dg-categories">
                    {visible
                      .filter((c) => pool.ids.includes(c.id))
                      .map((c) => (
                        <CategoryCard
                          key={c.id}
                          category={c}
                          onOpen={() => setOpenCategory(c.id)}
                        />
                      ))}
                  </div>
                </div>
              ))}
              {progress.unmatched.length > 0 && (
                <p className="muted small">
                  Not counted, because they fit no bucket here:{" "}
                  {progress.unmatched.map((c) => c.code).join(", ")}.
                </p>
              )}
            </>
          )}
        </>
      )}

      {section === "plan" && (
        <>
          <p className="muted small">
            Pencil subjects into each semester and watch the totals above change. Nothing is sent
            to VTOP. The limit is {fmt(NORMAL_LIMIT)} credits a semester, or {fmt(NPTEL_LIMIT)} with
            an NPTEL course (CFOC).
          </p>
          <div className="dg-semesters">
            {progress.semesters.map((s) => (
              <SemesterCard
                key={s.number}
                semester={s}
                onAdd={() => setAddingTo(s.number)}
                onRemove={remove}
              />
            ))}
          </div>
        </>
      )}

      {category && (
        <CategorySheet
          category={category}
          progress={progress}
          onAdd={add}
          onRemove={remove}
          onClose={() => setOpenCategory(null)}
        />
      )}
      {target && (
        <AddSheet
          semester={target}
          progress={progress}
          onAdd={add}
          onRemove={remove}
          onClose={() => setAddingTo(null)}
        />
      )}
    </div>
  );
}
