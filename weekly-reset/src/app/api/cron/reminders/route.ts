import { NextResponse } from "next/server";
import { runScheduledReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

/** Call hourly from a scheduler (Vercel Cron, GitHub Actions, crontab) with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runScheduledReminders());
}
