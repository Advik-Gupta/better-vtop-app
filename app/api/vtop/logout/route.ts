import { NextResponse } from "next/server";
import { writeSession } from "@/app/lib/vtop/client";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  writeSession(res, null);
  return res;
}
