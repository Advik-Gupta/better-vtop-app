import { NextResponse, type NextRequest } from "next/server";
import { readSession, vtopFetch, writeSession } from "@/app/lib/vtop/client";
import {
  isLoginPage,
  parseCsrf,
  parseLoginError,
  parseRegNo,
} from "@/app/lib/vtop/parsers";

export const dynamic = "force-dynamic";

/** Submits the user's credentials and the captcha they typed to VTOP. The
 *  password is forwarded and never stored or logged. */
export async function POST(req: NextRequest) {
  const session = readSession(req);
  if (!session) {
    return NextResponse.json(
      { error: "Login session expired - load a new captcha." },
      { status: 400 },
    );
  }

  const { username, password, captcha } = await req.json().catch(() => ({}));
  if (!username || !password || !captcha) {
    return NextResponse.json(
      { error: "Enter your username, password and the captcha." },
      { status: 400 },
    );
  }

  try {
    const reply = await vtopFetch(session, "login", {
      _csrf: session.csrf,
      username: String(username).trim(),
      password: String(password),
      captchaStr: String(captcha).trim().toUpperCase(),
    });

    const failed = isLoginPage(reply.html);
    const csrf = parseCsrf(reply.html);
    const regNo = parseRegNo(reply.html);

    if (failed || !csrf || !regNo) {
      const res = NextResponse.json(
        {
          error:
            parseLoginError(reply.html) ??
            "VTOP rejected the login. Check your username, password and captcha.",
        },
        { status: 401 },
      );
      // The pre-login session is spent either way; a new captcha is needed.
      writeSession(res, null);
      return res;
    }

    const res = NextResponse.json({ regNo });
    writeSession(res, { jar: session.jar, csrf, regNo });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reach VTOP" },
      { status: 502 },
    );
  }
}
