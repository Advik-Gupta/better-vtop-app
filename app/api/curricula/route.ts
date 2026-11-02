import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

/* Saves a synced curriculum as a public file, so students of the same branch
   and batch can plan without signing in. Development only: production
   deployments cannot write files, and the files are committed instead. */

const BRANCHES: Record<string, string> = {
  BEC: "ECE",
  BCE: "CSE",
  BEE: "EEE",
  BME: "Mechanical",
  BCL: "Civil",
  BIT: "IT",
  BCH: "Chemical",
  BBT: "Biotech",
};

interface Entry {
  key: string;
  label: string;
  savedAt: string;
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development." }, { status: 403 });
  }
  const { regNo, curriculum } = await req.json().catch(() => ({}));
  const m = String(regNo ?? "").match(/^(\d{2})([A-Z]{3})\d{4}$/);
  if (!m || !Array.isArray(curriculum?.categories) || !curriculum.categories.length) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }
  const batch = 2000 + Number(m[1]) + 4;
  const key = `${m[2]}-${batch}`;
  const label = `${BRANCHES[m[2]] ?? m[2]} · ${batch} batch`;

  const folder = path.join(process.cwd(), "public", "curricula");
  await mkdir(folder, { recursive: true });
  await writeFile(
    path.join(folder, `${key}.json`),
    JSON.stringify({ key, label, curriculum }),
  );
  const indexFile = path.join(folder, "index.json");
  const index: Entry[] = JSON.parse(await readFile(indexFile, "utf8").catch(() => "[]"));
  const next = [
    { key, label, savedAt: new Date().toISOString() },
    ...index.filter((e) => e.key !== key),
  ].sort((a, b) => a.key.localeCompare(b.key));
  await writeFile(indexFile, JSON.stringify(next, null, 2));
  return NextResponse.json({ saved: key });
}
