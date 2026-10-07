"use client";

import { useApp } from "@/app/lib/appContext";
import { blocksOn, formatDate, relativeDay } from "@/app/lib/engine";
import ClassRow from "./ClassRow";
import Sheet from "./Sheet";
import { IconStar } from "./Icons";

/** Everything about one date: classes with timings, assignments due, and the
 *  important flag with its note. */
export default function DaySheet({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const { data, look, important, setImportant, today } = useApp();
  const day = look.days.get(date);
  const blocks = blocksOn(look, date);
  const due = data.assignments.filter((a) => a.due === date);
  const flagged = important[date] !== undefined;

  const typeLine = !day
    ? "Outside the published calendar"
    : [day.label || "No classes", day.detail].filter(Boolean).join(" · ");

  return (
    <Sheet
      title={formatDate(date, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })}
      subtitle={`${typeLine} · ${relativeDay(date, today)}`}
      onClose={onClose}
    >
      <div className="important">
        <button
          className={`star-btn ${flagged ? "active" : ""}`}
          onClick={() => setImportant(date, flagged ? null : "")}
          aria-pressed={flagged}
        >
          <IconStar filled={flagged} />
          {flagged ? "Marked important" : "Mark as important"}
        </button>
        {flagged && (
          <input
            className="input"
            placeholder="Add a note - quiz, viva, submission…"
            value={important[date]}
            onChange={(e) => setImportant(date, e.target.value)}
          />
        )}
      </div>

      {due.length > 0 && (
        <>
          <h3 className="sheet-section">Assignments due</h3>
          <ul className="rows">
            {due.map((a) => (
              <li key={a.classId + a.title} className="row-static">
                <span
                  className={`dot ${a.submitted ? "dot-safe" : "dot-warning"}`}
                />
                <span className="row-main">
                  <span className="row-title">{a.title}</span>
                  <span className="muted small">
                    {a.course} · {a.maxMark} marks
                  </span>
                </span>
                <span className="muted small">
                  {a.submitted ? "Submitted" : "Open"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="sheet-section">
        {date > today ? "Classes - plan ahead" : "Classes"}
      </h3>
      {blocks.length === 0 ? (
        <p className="empty">No classes on this day.</p>
      ) : (
        <div className="class-list">
          {blocks.map((b) => (
            <ClassRow key={b.code} date={date} block={b} />
          ))}
        </div>
      )}
    </Sheet>
  );
}
