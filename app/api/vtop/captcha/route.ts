import { NextResponse } from "next/server";
import { vtopFetch, writeSession, type VtopSession } from "@/app/lib/vtop/client";
import { parseCaptchaImage, parseCsrf } from "@/app/lib/vtop/parsers";

export const dynamic = "force-dynamic";

/** Starts a fresh VTOP session and returns the captcha for the user to read.
 *  VTOP sometimes asks for a Google reCAPTCHA instead of its own image; that
 *  can only be completed on VTOP itself, so we report it and let the user
 *  try again. */
export async function POST() {
  try {
    const session: VtopSession = { jar: {}, csrf: "", regNo: "" };

    const open = await vtopFetch(session, "open/page");
    const openCsrf = parseCsrf(open.html);
    if (!openCsrf) throw new Error("VTOP did not return a login page");

    const login = await vtopFetch(session, "prelogin/setup", {
      _csrf: openCsrf,
      flag: "VTOP",
    });
    session.csrf = parseCsrf(login.html) ?? openCsrf;

    const captcha = parseCaptchaImage(login.html);
    const res = NextResponse.json(
      captcha ? { captcha } : { captcha: null, reason: "recaptcha" },
    );
    writeSession(res, session);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reach VTOP" },
      { status: 502 },
    );
  }
}
