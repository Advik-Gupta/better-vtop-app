"use client";

import { useApp } from "@/app/lib/appContext";
import { PART_LABELS, type Part } from "@/app/lib/sync";

function when(iso?: string): string {
  if (!iso) return "not fetched yet";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** For data that hardly changes and is not pulled on every sign-in. */
export default function LiveSync({ parts }: { parts: Part[] }) {
  const { data, updating, refresh } = useApp();
  const oldest = parts
    .map((p) => data.updated?.[p])
    .sort((a, b) => (a ?? "").localeCompare(b ?? ""))[0];
  const busy = updating !== null && parts.includes(updating);
  return (
    <div className="live-sync">
      <span className="muted small">
        {parts.map((p) => PART_LABELS[p]).join(" and ").replace(/^./, (c) => c.toUpperCase())}{" "}
        last updated {when(oldest)}. It rarely changes, so it is not re-fetched at every sign-in.
      </span>
      <button className="btn btn-inline" onClick={() => refresh(parts)} disabled={updating !== null}>
        {busy ? "Updating…" : "Update from VTOP"}
      </button>
    </div>
  );
}
