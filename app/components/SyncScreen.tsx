"use client";

import { SYNC_STEPS, type SyncStep } from "@/app/lib/sync";
import { IconCheck } from "./Icons";

interface SyncScreenProps {
  step: SyncStep;
  error?: string;
  /** Float over the app (a refresh) instead of filling the page (first load). */
  overlay?: boolean;
  onRetry: () => void;
  onSignIn: () => void;
}

/** Progress while everything is pulled from VTOP. */
export default function SyncScreen({
  step,
  error,
  overlay,
  onRetry,
  onSignIn,
}: SyncScreenProps) {
  const current = SYNC_STEPS.findIndex((s) => s.key === step);

  const card = (
    <div className="auth-card">
      <div className="brand">
        <span className={`brand-mark ${error ? "" : "pulse"}`}>V</span>
        <div>
          <h1>
            {error
              ? "Sync stopped"
              : overlay
                ? "Syncing with VTOP"
                : "Getting your data"}
          </h1>
          <p className="muted">
            {error
              ? "Nothing was changed."
              : "Straight from VTOP - about 20 seconds."}
          </p>
        </div>
      </div>

      <ol className="steps">
        {SYNC_STEPS.map((s, i) => {
          const state =
            i < current
              ? "done"
              : i === current
                ? error
                  ? "failed"
                  : "active"
                : "todo";
          return (
            <li key={s.key} className={`step step-${state}`}>
              <span className="step-mark">
                {state === "done" ? <IconCheck width={14} height={14} /> : null}
              </span>
              {s.label}
            </li>
          );
        })}
      </ol>

      {error && (
        <>
          <div className="notice notice-danger" role="alert">
            {error}
          </div>
          <button className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
          <button className="btn btn-ghost" onClick={onSignIn}>
            Sign in again
          </button>
        </>
      )}
    </div>
  );

  return overlay ? (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Syncing">
      {card}
    </div>
  ) : (
    <main className="auth">{card}</main>
  );
}
