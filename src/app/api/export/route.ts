import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { formatters, personReport, summaryReport, weekReport } from "@/lib/export";

export const dynamic = "force-dynamic";

/** GET /api/export?type=week&weekId=… | type=person&userId=… | type=summary  [&format=csv] */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const fmt = formatters[url.searchParams.get("format") ?? "csv"];
  if (!fmt) return NextResponse.json({ error: "Unsupported format." }, { status: 400 });

  // Members may export only their own history; everything else is admin-only.
  const userId = url.searchParams.get("userId") ?? user.id;
  const allowed = user.role === "admin" || (type === "person" && userId === user.id);
  if (!allowed) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const table =
    type === "week" ? await weekReport(url.searchParams.get("weekId") ?? "")
    : type === "person" ? await personReport(userId)
    : type === "summary" ? await summaryReport()
    : null;
  if (!table) return NextResponse.json({ error: "Nothing to export." }, { status: 404 });
  return new NextResponse(fmt.render(table) as BodyInit, {
    headers: {
      "Content-Type": fmt.contentType,
      "Content-Disposition": `attachment; filename="${table.filename}.${fmt.extension}"`,
      "Cache-Control": "no-store",
    },
  });
}
