import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { setWeekLock } from "@/app/actions/admin";
import { ActionButton } from "@/components/action-button";
import { PageHead, Score } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { addDays, fmtDateTime, fmtRange, isoWeek, startOfWeek, toYmd, zonedToIso } from "@/lib/dates";
import { teamInsights, teamTrend } from "@/lib/queries";
import { getCurrentWeek, listWeeks } from "@/lib/resets";
import { getSettings } from "@/lib/settings";
import { DeadlineEditor } from "./deadline-editor";
import { NewWeekForm } from "./new-week-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weeks" };

export default async function WeeksPage() {
  await requireAdmin();
  const [weeks, settings, trend, members, current] = await Promise.all([
    listWeeks(),
    getSettings(),
    teamTrend(60),
    db.query.users.findMany({ where: eq(schema.users.active, true), orderBy: schema.users.name }),
    getCurrentWeek(),
  ]);
  const latest = weeks[0];
  // Default next week: the week after the latest one (or this calendar week if none / latest is in the past).
  const s = settings.schedule;
  const thisWeekStart = startOfWeek(toYmd(new Date()), s.weekStartDay);
  const nextStart = latest ? (addDays(latest.startDate, 7) > thisWeekStart ? addDays(latest.startDate, 7) : thisWeekStart) : thisWeekStart;
  const iso = isoWeek(nextStart);
  const defaults = {
    weekNumber: iso.week,
    year: iso.year,
    startDate: nextStart,
    endDate: addDays(nextStart, 6),
    deadline: zonedToIso(addDays(nextStart, s.deadlineOffsetDays), s.deadlineTime, s.timezone),
  };
  const latestResets = latest
    ? await db.select({ id: schema.weeklyResets.id }).from(schema.weeklyResets).where(eq(schema.weeklyResets.weekId, latest.id))
    : [];
  const carryCount = latestResets.length
    ? (await db.select({ id: schema.priorities.id }).from(schema.priorities).where(inArray(schema.priorities.resetId, latestResets.map((r) => r.id)))).length +
      (await db.select({ nn: schema.reflections.nonNegotiable }).from(schema.reflections).where(inArray(schema.reflections.resetId, latestResets.map((r) => r.id)))).filter((r) => r.nn).length
    : 0;
  const ins = await teamInsights(current, 4);
  const byWeek = new Map(trend.map((t) => [t.weekId, t]));

  return (
    <main className="container page">
      <PageHead eyebrow="Weeks" title="Every reset, ever." sub="Start the next one, lock the last one. History stays forever." />
      <div className="grid-2 mt-32" style={{ alignItems: "start" }}>
        <section className="card" id="new">
          <div className="eyebrow">Next week starts here</div>
          <h2 className="h2 mt-8" style={{ fontSize: 30 }}>Start new reset</h2>
          <div className="mt-24">
            <NewWeekForm defaults={defaults} members={members.map((m) => ({ id: m.id, name: m.name, department: m.department, avatar: m.avatar }))} carry={{ prevWeek: latest?.weekNumber ?? null, commitments: carryCount, openLoops: ins?.unresolved.length ?? 0 }} />
          </div>
        </section>
        <section className="stack gap-8">
          {weeks.map((w) => {
            const t = byWeek.get(w.id);
            return (
              <div key={w.id} className="card tight">
                <div className="row gap-16 wrap">
                  <Link href={`/admin?week=${w.id}`} className="row gap-16 grow">
                    <div style={{ width: 70 }}>
                      <div className="num" style={{ fontSize: 30 }}>W{w.weekNumber}</div>
                      <div className="tiny faint">{w.year}</div>
                    </div>
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{fmtRange(w.startDate, w.endDate)}</div>
                      <div className="tiny faint">due {fmtDateTime(w.deadline, s.timezone)}</div>
                    </div>
                    <div className="stack" style={{ alignItems: "flex-end" }}>
                      <Score value={t?.avgScore} size={22} />
                      <span className="tiny muted">{t ? `${t.done}/${t.total}` : "0/0"} reset</span>
                    </div>
                  </Link>
                </div>
                <div className="row gap-8 mt-8 wrap">
                  {w.status === "locked" ? <span className="pill">🔒 Locked</span> : <span className="pill good"><span className="dot" /> Open</span>}
                  <div className="grow" />
                  {w.status === "open" && <DeadlineEditor weekId={w.id} deadline={w.deadline} />}
                  <a className="btn sm ghost" href={`/api/export?type=week&weekId=${w.id}`}>⬇ CSV</a>
                  {w.status === "open" ? (
                    <ActionButton action={setWeekLock.bind(null, w.id, true)} confirm={`Lock week ${w.weekNumber}? Nobody can edit after this.`} className="btn sm">Lock</ActionButton>
                  ) : (
                    <ActionButton action={setWeekLock.bind(null, w.id, false)} className="btn sm ghost">Unlock</ActionButton>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
