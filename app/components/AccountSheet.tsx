"use client";

import { useRef } from "react";
import { useApp } from "@/app/lib/appContext";
import { pendingOD } from "@/app/lib/engine";
import { exportBackup, importBackup } from "@/app/lib/storage";
import Sheet from "./Sheet";

interface AccountSheetProps {
  syncing: boolean;
  onSync: () => void;
  onSignOut: () => void;
  onRemoveData: () => void;
  onToast: (msg: string) => void;
  onClose: () => void;
}

export default function AccountSheet({
  syncing,
  onSync,
  onSignOut,
  onRemoveData,
  onToast,
  onClose,
}: AccountSheetProps) {
  const { data, look, marks } = useApp();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const localCount = Object.values(marks).reduce(
    (n, byCode) => n + Object.keys(byCode).length,
    0,
  );

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (await importBackup(file)) {
      onToast("Backup restored - reloading…");
      setTimeout(() => window.location.reload(), 800);
    } else {
      onToast("That isn't a backup file from this app");
    }
  };

  const signOut = () => {
    if (window.confirm("Sign out of VTOP? Your data stays on this device.")) onSignOut();
  };

  const removeData = () => {
    const warning = localCount
      ? `Remove everything from this device, including your ${localCount} own mark${localCount === 1 ? "" : "s"} and important dates? Export a backup first if you want to keep them.`
      : "Remove all your data from this device?";
    if (window.confirm(warning)) onRemoveData();
  };

  return (
    <Sheet title={data.regNo} subtitle={data.semester.name} onClose={onClose}>
      <dl className="facts">
        <div>
          <dt>Last synced</dt>
          <dd>
            {new Date(data.syncedAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          </dd>
        </div>
        <div>
          <dt>Courses</dt>
          <dd>{data.courses.length}</dd>
        </div>
        <div>
          <dt>Your marks and what-ifs</dt>
          <dd>{localCount}</dd>
        </div>
        <div>
          <dt>ODs waiting for VTOP</dt>
          <dd>{pendingOD(look, marks)}</dd>
        </div>
      </dl>

      <div className="btn-col">
        <button className="btn btn-primary" onClick={onSync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync with VTOP now"}
        </button>
        <button
          className="btn"
          onClick={() => {
            exportBackup();
            onToast("Backup downloaded");
          }}
        >
          Export backup
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import backup
        </button>
        <button className="btn" onClick={signOut}>
          Sign out
        </button>
        <button className="btn btn-danger" onClick={removeData}>
          Remove my data from this device
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={handleImport}
      />

      <p className="muted small">
        Everything is stored only on this device. After a sync VTOP is the
        source of truth, except on-duty marks: those stay until VTOP stops
        showing the class as absent.
      </p>
    </Sheet>
  );
}
