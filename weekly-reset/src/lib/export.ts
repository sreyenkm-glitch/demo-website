/**
 * Export layer. Each report builds a format-neutral `Table`; formatters turn it into bytes.
 * CSV ships now. To add PDF, implement `Formatter` (e.g. with pdf-lib) and register it in `formatters`.
 */
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { userHistory, teamTrend, weekRoster } from "./queries";
import { getRatingCategories } from "./settings";

export type Table = { title: string; filename: string; columns: string[]; rows: (string | number | null)[][] };

export interface Formatter {
  contentType: string;
  extension: string;
  render(t: Table): string | Uint8Array;
}

const csvCell = (v: string | number | null) => {
  if (v == null) return "";
  const s = String(v);
  // Neutralize spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const formatters: Record<string, Formatter> = {
  csv: {
    contentType: "text/csv; charset=utf-8",
    extension: "csv",
    render: (t) => "﻿" + [t.columns, ...t.rows].map((r) => r.map(csvCell).join(",")).join("\r\n"),
  },
};

export async function weekReport(weekId: string): Promise<Table | null> {
  const week = await db.query.weeks.findFirst({ where: eq(schema.weeks.id, weekId) });
  if (!week) return null;
  const [roster, cats] = await Promise.all([weekRoster(weekId), getRatingCategories()]);
  const ids = roster.map((r) => r.resetId);
  const [prios, refl, learn] = ids.length
    ? await Promise.all([
        db.select().from(schema.priorities).where(inArray(schema.priorities.resetId, ids)).orderBy(asc(schema.priorities.sortOrder)),
        db.select().from(schema.reflections).where(inArray(schema.reflections.resetId, ids)),
        db.select().from(schema.learnings).where(inArray(schema.learnings.resetId, ids)),
      ])
    : [[], [], []];
  return {
    title: `Week ${week.weekNumber} reset`,
    filename: `obsa-reset-w${week.weekNumber}-${week.year}`,
    columns: ["Name", "Department", "Status", "Submitted", "Overall", ...cats.map((c) => c.label), "Biggest win", "Biggest miss", "Biggest learning", "Priority 1", "Priority 2", "Priority 3", "Stop", "Start", "Continue", "Non-negotiable", "Review"],
    rows: roster.map((r) => {
      const p = prios.filter((x) => x.resetId === r.resetId);
      const f = refl.find((x) => x.resetId === r.resetId);
      const l = learn.filter((x) => x.resetId === r.resetId);
      return [
        r.name, r.department, r.status, r.submittedAt?.slice(0, 16).replace("T", " ") ?? "", r.overallScore,
        ...cats.map((c) => r.ratings[c.key] ?? null),
        r.biggestWin, r.biggestMiss, (l.find((x) => x.isBiggest) ?? l[0])?.content ?? "",
        p[0]?.title ?? "", p[1]?.title ?? "", p[2]?.title ?? "",
        f?.stop ?? "", f?.start ?? "", f?.continue ?? "", f?.nonNegotiable ?? "", r.reviewFlag ?? "",
      ];
    }),
  };
}

export async function personReport(userId: string): Promise<Table | null> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return null;
  const [h, cats] = await Promise.all([userHistory(userId), getRatingCategories()]);
  return {
    title: `${user.name} — history`,
    filename: `obsa-reset-${user.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    columns: ["Week", "Start", "End", "Status", "Overall", ...cats.map((c) => c.label), "Wins", "Misses", "Learnings"],
    rows: h.resets.map((r) => {
      const rt = h.ratings.get(r.id) ?? {};
      return [
        r.weekNumber, r.startDate, r.endDate, r.status, r.score,
        ...cats.map((c) => rt[c.key] ?? null),
        h.wins.filter((w) => w.resetId === r.id).map((w) => w.title).join(" | "),
        h.misses.filter((w) => w.resetId === r.id).map((w) => w.title).join(" | "),
        h.learnings.filter((w) => w.resetId === r.id).map((w) => w.content).join(" | "),
      ];
    }),
  };
}

export async function summaryReport(): Promise<Table> {
  const [trend, cats] = await Promise.all([teamTrend(52), getRatingCategories()]);
  return {
    title: "Team weekly summary",
    filename: "obsa-reset-team-summary",
    columns: ["Week", "Start", "End", "Status", "Members", "Completed", "Reset rate %", "Avg overall", ...cats.map((c) => `Avg ${c.label}`)],
    rows: [...trend].reverse().map((t) => [t.weekNumber, t.startDate, t.endDate, t.status, t.total, t.done, Math.round(t.rate * 100), t.avgScore, ...cats.map((c) => t.metrics[c.key] ?? null)]),
  };
}
