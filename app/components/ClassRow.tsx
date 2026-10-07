"use client";

import { useApp } from "@/app/lib/appContext";
import {
  classState,
  pctTone,
  projection,
  riskOf,
  statsIf,
  verdict,
  type ClassBlock,
  type ClassState,
} from "@/app/lib/engine";
import type { Status } from "@/app/types/vtop";

export const STATUS_LABEL: Record<Status, string> = {
  present: "Present",
  absent: "Absent",
  od: "On duty",
};

/** Present is the default, so only the exceptions can be marked. */
const OPTIONS: Exclude<Status, "present">[] = ["absent", "od"];

/** State and the one action for marking a class. Choosing the status that is
 *  already in force clears the user's mark, which falls back to VTOP (or to
 *  present, when VTOP has nothing yet). */
export function useMark(date: string, code: string) {
  const { look, marks, mark } = useApp();
  const state = classState(look, marks, date, code);
  const choose = (opt: Status) => {
    const clear =
      opt === state.vtop || (state.source === "local" && state.status === opt);
    mark(date, code, clear ? null : opt);
  };
  return { state, choose, reset: () => mark(date, code, null) };
}

/** An on-duty mark over a class VTOP still shows as absent. */
const awaitingOD = (state: ClassState) =>
  state.overridden && state.status === "od" && state.vtop === "absent";

/** One class on one day, with full detail: used on the home screen's "today"
 *  list and in the day sheet. */
export default function ClassRow({
  date,
  block,
}: {
  date: string;
  block: ClassBlock;
}) {
  const { look, marks, today, statsByCode, openCourse } = useApp();
  const { state, choose, reset } = useMark(date, block.code);
  const stats = statsByCode.get(block.code);
  const future = date > today;

  let note: React.ReactNode = null;
  if (awaitingOD(state)) {
    note = (
      <>
        <span className="warn">Not on VTOP yet</span> - VTOP still shows this as
        absent. Your on-duty mark stays until VTOP updates.
      </>
    );
  } else if (state.overridden) {
    note = (
      <>
        What-if - VTOP has this as {STATUS_LABEL[state.vtop!].toLowerCase()}, and
        the next sync will go back to that.{" "}
        <button className="link" onClick={reset}>
          Reset
        </button>
      </>
    );
  } else if (state.source === "vtop") {
    note = state.mixed
      ? "Recorded on VTOP - partly absent"
      : `Recorded on VTOP as ${STATUS_LABEL[state.vtop!].toLowerCase()}`;
  } else if (state.source === "local") {
    note = future ? "Planned" : "Your mark - not on VTOP yet";
  } else if (!future) {
    note = "Counts as present unless you mark it.";
  }

  // Undecided class: spell out both outcomes before the user picks one.
  const undecided = stats && !state.status && date >= today;
  const missed = undecided
    ? statsIf(look, marks, stats.course, today, date, "absent")
    : null;

  return (
    <div className={`class-row ${state.status ? `is-${state.status}` : ""}`}>
      <div className="class-time">
        <span>{block.start}</span>
        <span className="class-time-end">{block.end}</span>
      </div>

      <div className="class-main">
        <button className="class-name" onClick={() => openCourse(block.code)}>
          {block.course?.name ?? block.code}
        </button>
        <div className="class-meta">
          {block.code} · {block.slots.join("+")} · {block.venue}
        </div>

        <div className="seg" role="group" aria-label="Mark attendance">
          {OPTIONS.map((opt) => (
            <button
              key={opt}
              className={`seg-btn seg-${opt} ${state.status === opt ? "active" : ""} ${state.source === "local" ? "local" : ""}`}
              aria-pressed={state.status === opt}
              onClick={() => choose(opt)}
            >
              {STATUS_LABEL[opt]}
            </button>
          ))}
        </div>
        {note && <div className="muted small">{note}</div>}

        {stats && missed ? (
          <div className="outcomes">
            <div>
              <span className="outcome-if">If you attend</span>
              <span className={`num ${pctTone(stats)}`}>{stats.pct}%</span>
              <span className={`verdict verdict-${riskOf(stats)}`}>
                {verdict(stats)}
              </span>
            </div>
            <div>
              <span className="outcome-if">If you miss it</span>
              <span className={`num ${pctTone(missed)}`}>{missed.pct}%</span>
              <span className={`verdict verdict-${riskOf(missed)}`}>
                {missed.safe && missed.canMiss > 0
                  ? `still fine - can miss ${missed.canMiss} more before ${missed.horizonLabel}`
                  : missed.safe
                    ? `still fine, but no more misses before ${missed.horizonLabel}`
                    : projection(missed).replace(/^./, (c) => c.toLowerCase())}
              </span>
            </div>
          </div>
        ) : (
          stats && (
            <div className={`verdict verdict-${riskOf(stats)}`}>
              {verdict(stats)}
            </div>
          )
        )}
      </div>

      {stats && (
        <div className={`class-pct ${pctTone(stats)}`}>{stats.pct}%</div>
      )}
    </div>
  );
}

const SHORT: Record<Status, string> = {
  present: "Present",
  absent: "Absent",
  od: "OD",
};

/** The compact form used inside a calendar day. */
export function ClassChip({ date, block }: { date: string; block: ClassBlock }) {
  const { openCourse } = useApp();
  const { state, choose } = useMark(date, block.code);

  return (
    <div
      className={`chip-class ${state.status ? `is-${state.status}` : ""} ${state.source === "local" ? "is-local" : ""}`}
    >
      <div className="chip-top">
        <button
          className="chip-name"
          title={`${block.course?.name ?? block.code} · ${block.start}–${block.end} · ${block.venue}`}
          onClick={() => openCourse(block.code)}
        >
          {block.course?.name ?? block.code}
        </button>
        {state.status === "present" && (
          <span className="chip-present">Present</span>
        )}
        <span className={`chip-kind ${block.kind}`}>
          {block.kind === "lab" ? "Lab" : "Th"}
        </span>
      </div>
      <div className="chip-btns" role="group" aria-label="Mark attendance">
        {OPTIONS.map((opt) => (
          <button
            key={opt}
            className={`chip-btn seg-${opt} ${state.status === opt ? "active" : ""}`}
            aria-pressed={state.status === opt}
            aria-label={STATUS_LABEL[opt]}
            title={STATUS_LABEL[opt]}
            onClick={() => choose(opt)}
          >
            {SHORT[opt]}
          </button>
        ))}
      </div>
      {awaitingOD(state) ? (
        <span className="chip-note">OD · not on VTOP yet</span>
      ) : (
        state.overridden && <span className="chip-note">what-if</span>
      )}
    </div>
  );
}
