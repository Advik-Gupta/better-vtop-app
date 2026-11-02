import Link from "next/link";
import type { ReactNode } from "react";

export default function ToolsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-id">
          <span className="brand-mark small">V</span>
          <div>
            <strong>VIT Attendance tools</strong>
            <span className="muted small">No VTOP sign-in needed</span>
          </div>
        </div>
        <Link className="btn btn-inline tools-signin" href="/">
          Sign in to VTOP
        </Link>
      </header>
      <nav className="tools-nav" aria-label="Tools">
        <Link href="/tools/cgpa">CGPA calculator</Link>
        <Link href="/tools/degree">Degree planner</Link>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
