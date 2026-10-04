import { NextResponse, type NextRequest } from "next/server";

/** Cheap gate: bounce cookieless visitors to /login. Real auth + role checks happen server-side on every page/action. */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("obsa_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = req.nextUrl.pathname === "/" ? "" : `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
