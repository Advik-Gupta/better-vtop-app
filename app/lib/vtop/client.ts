/* Server-side VTOP HTTP client. VTOP has no CORS and no JSON API, so the
   browser talks to our route handlers and they talk to VTOP with the user's
   session cookies. Nothing is stored on the server: the VTOP session lives in
   an httpOnly cookie on our own domain, and the password is only ever
   forwarded to VTOP. */

import type { NextRequest, NextResponse } from "next/server";
import { isLoginPage } from "./parsers";

const BASE = "https://vtop.vit.ac.in/vtop";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

export const SESSION_COOKIE = "vtop_session";

export interface VtopSession {
  /** VTOP cookies: JSESSIONID plus the SERVERID load-balancer pin. */
  jar: Record<string, string>;
  csrf: string;
  regNo: string;
}

export class SessionExpiredError extends Error {
  constructor() {
    super("VTOP session expired");
  }
}

/* ── Our cookie <-> session ── */

export function readSession(req: NextRequest): VtopSession | null {
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const s = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return s?.jar && s.csrf ? (s as VtopSession) : null;
  } catch {
    return null;
  }
}

export function writeSession(res: NextResponse, session: VtopSession | null) {
  res.cookies.set(SESSION_COOKIE, session
    ? Buffer.from(JSON.stringify(session)).toString("base64url")
    : "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/vtop",
    ...(session ? {} : { maxAge: 0 }),
  });
}

/* ── HTTP ── */

interface Reply {
  status: number;
  url: string;
  html: string;
}

type Body = Record<string, string> | FormData | undefined;

/** One request with cookies; follows redirects by hand so that cookies set
 *  mid-chain (VTOP rotates JSESSIONID on login) are captured. */
export async function vtopFetch(
  session: Pick<VtopSession, "jar">,
  path: string,
  body?: Body,
  xhr = false,
): Promise<Reply> {
  let url = path.startsWith("http") ? path : `${BASE}/${path.replace(/^\//, "")}`;
  let method = body ? "POST" : "GET";
  let payload: BodyInit | undefined =
    body instanceof FormData ? body : body ? new URLSearchParams(body) : undefined;

  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(url, {
      method,
      body: payload,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "user-agent": UA,
        origin: "https://vtop.vit.ac.in",
        // Data calls are XHRs from the content page; the login flow is
        // ordinary page navigation.
        referer: `${BASE}/${xhr ? "content" : "login"}`,
        ...(xhr ? { "x-requested-with": "XMLHttpRequest" } : {}),
        cookie: Object.entries(session.jar)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
    });

    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) session.jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url).toString();
      method = "GET";
      payload = undefined;
      continue;
    }
    return { status: res.status, url, html: await res.text() };
  }
  throw new Error("Too many redirects from VTOP");
}

/** An authenticated POST. VTOP expects the CSRF token, the register number
 *  and a timestamp on every call. Throws when the session is no longer valid
 *  (VTOP answers an expired session with a 404 or the login page). */
export async function vtopPost(
  session: VtopSession,
  path: string,
  fields: Record<string, string> = {},
  multipart = false,
): Promise<string> {
  const all: Record<string, string> = {
    _csrf: session.csrf,
    authorizedID: session.regNo,
    ...fields,
  };
  let body: Body = all;
  if (multipart) {
    body = new FormData();
    for (const [k, v] of Object.entries(all)) body.append(k, v);
  } else {
    all.x = new Date().toUTCString();
  }

  const reply = await vtopFetch(session, path, body, true);
  if (reply.status === 404 || reply.status === 401 || reply.status === 403) {
    throw new SessionExpiredError();
  }
  if (isLoginPage(reply.html) || /\/vtop\/(login|open\/page)/.test(reply.url)) {
    throw new SessionExpiredError();
  }
  if (reply.status >= 400) throw new Error(`VTOP returned ${reply.status}`);
  return reply.html;
}

/** Opens a VTOP "menu" page; the data calls behind it are made right after,
 *  the same order the VTOP site itself uses. */
export const openMenu = (session: VtopSession, path: string) =>
  vtopPost(session, path, { verifyMenu: "true", nocache: "@(new Date().getTime())" });

/** Run tasks a few at a time so we don't hammer VTOP. */
export async function pooled<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await task(items[i]);
      }
    }),
  );
  return out;
}
