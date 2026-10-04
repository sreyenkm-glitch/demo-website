import { and, desc, eq, inArray, lt } from "drizzle-orm";
import Link from "next/link";
import { Avatar, Delta, Empty, Ring, Score, StatusPill } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { dueIn, fmtDateTime, fmtRange } from "@/lib/dates";
import { rosterStats, weekRoster } from "@/lib/queries";
import { getCurrentWeek, getPreviousWeek, getResetFor, loadResetDetail } from "@/lib/resets";
import { SECTION_ORDER, getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const LOOP = ["Look back", "Review", "Reflect", "Rate", "Learn", "Reset", "Commit", "Start again"];

export default async function Dashboard() {
  const user = await requireUser();
  const settings = await getSettings();
  const week = await getCurrentWeek();

  if (!week) {
    return (
      <main className="container page">
        <Empty
          title="Nothing here yet."
          body="Your first reset starts the loop."
          action={user.role === "admin" ? <Link className="btn primary" href="/admin/weeks">Start the first reset →</Link> : <span className="muted small">Ask your admin to open week one.</span>}
        />
      </main>
    );
  }

  const [roster, prevWeek, myReset] = await Promise.all([weekRoster(week.id), getPreviousWeek(week), getResetFor(user.id, week.id)]);
  const stats = rosterStats(roster);
  const prevStats = prevWeek ? rosterStats(await weekRoster(prevWeek.id)) : null;
  const due = dueIn(week.deadline);
  const detail = myReset ? await loadResetDetail(myReset.id) : null;
  const sectionsDone = myReset ? (JSON.parse(myReset.sectionsDone) as string[]).filter((s) => (SECTION_ORDER as string[]).includes(s)).length : 0;

  // Last week's plan: what I'm carrying into this week.
  const lastPlan = await db
    .select({ id: schema.weeklyResets.id, weekNumber: schema.weeklyResets.weekNumber })
    .from(schema.weeklyResets)
    .where(and(eq(schema.weeklyResets.userId, user.id), lt(schema.weeklyResets.startDate, week.startDate), inArray(schema.weeklyResets.status, ["submitted", "reviewed"])))
    .orderBy(desc(schema.weeklyResets.startDate))
    .limit(1);
  const lastReflection = lastPlan[0] ? await db.query.reflections.findFirst({ where: eq(schema.reflections.resetId, lastPlan[0].id) }) : null;
  const commitments = detail?.commitments ?? [];
  const latestFeedback = await db
    .select({ comment: schema.adminReviews.comment, status: schema.adminReviews.reviewStatus, at: schema.adminReviews.reviewedAt, weekNumber: schema.weeklyResets.weekNumber, reviewer: schema.users.name, resetId: schema.weeklyResets.id })
    .from(schema.adminReviews)
    .innerJoin(schema.weeklyResets, eq(schema.weeklyResets.id, schema.adminReviews.resetId))
    .innerJoin(schema.users, eq(schema.users.id, schema.adminReviews.reviewerId))
    .where(eq(schema.weeklyResets.userId, user.id))
    .orderBy(desc(schema.adminReviews.reviewedAt))
    .limit(1);

  // Unsubmitted earlier open week?
  const lateOpen = await db
    .select({ id: schema.weeklyResets.id, weekNumber: schema.weeklyResets.weekNumber })
    .from(schema.weeklyResets)
    .innerJoin(schema.weeks, eq(schema.weeks.id, schema.weeklyResets.weekId))
    .where(and(eq(schema.weeklyResets.userId, user.id), eq(schema.weeks.status, "open"), lt(schema.weeks.startDate, week.startDate), inArray(schema.weeklyResets.status, ["not_started", "in_progress"])))
    .limit(1);

  const status = myReset?.status ?? "not_started";
  const done = status === "submitted" || status === "reviewed";
  const loopStep = done ? 7 : status === "in_progress" ? Math.min(6, 1 + sectionsDone) : 0;
  const locked = week.status === "locked";

  const cta = locked ? null : done ? (
    <Link href={`/reset/${myReset!.id}/view`} className="btn ink lg">Reset complete ✓ <span className="arrow">→</span></Link>
  ) : status === "in_progress" ? (
    <Link href="/reset" className="btn primary lg">Continue my reset <span className="arrow">→</span></Link>
  ) : (
    <Link href="/reset" className="btn primary lg">Start reset <span className="arrow">→</span></Link>
  );

  return (
    <main className="container page">
      <section className="rise">
        <div className="row between wrap gap-8">
          <div className="eyebrow">{settings.brand.name}</div>
          <div className="eyebrow">{settings.brand.tagline}</div>
        </div>
        <div className="row wrap gap-24 mt-24" style={{ alignItems: "flex-end" }}>
          <div className="grow">
            <div className="display hero-week">
              WEEK {week.weekNumber}
              <span className="accent-text">.</span>
            </div>
            <div className="row wrap gap-12 mt-16">
              <span className="h3">{fmtRange(week.startDate, week.endDate)}</span>
              {locked ? (
                <span className="pill">🔒 Locked</span>
              ) : done ? (
                <span className="due">✓ You&apos;re reset.</span>
              ) : (
                <span className={`due ${due.overdue ? "overdue" : ""}`}><span className="pulse" /> Your reset is {due.label}.</span>
              )}
            </div>
          </div>
        </div>
        <div className="loop mt-24" aria-label="The weekly loop">
          {LOOP.map((s, i) => (
            <span key={s} className={i <= loopStep ? "on" : ""}>
              {i < loopStep ? <b className="accent-text">{s.toUpperCase()}</b> : s.toUpperCase()}
              {i < LOOP.length - 1 && <span aria-hidden> →</span>}
            </span>
          ))}
        </div>
        <div className="row wrap gap-12 mt-32">
          {cta}
          {status === "in_progress" && <span className="muted small">{sectionsDone} / {SECTION_ORDER.length} sections done</span>}
          {done && myReset?.overallScore != null && (
            <span className="row gap-8 muted small">Your score <Score value={myReset.overallScore} size={22} /></span>
          )}
        </div>
        {lateOpen[0] && (
          <div className="callout bad mt-24 small">
            Week {lateOpen[0].weekNumber} is still open and your reset isn&apos;t in.{" "}
            <Link className="hl" href={`/reset/${lateOpen[0].id}`}>Close the loop →</Link>
          </div>
        )}
      </section>

      {/* Team pulse */}
      <section className="section rise-2">
        <div className="grid-4">
          <div className="card" style={{ gridColumn: "span 2", display: "flex", gap: 20, alignItems: "center" }}>
            <Ring pct={stats.rate} size={112}>
              <div className="num" style={{ fontSize: 30 }}>{Math.round(stats.rate * 100)}%</div>
            </Ring>
            <div className="stack gap-4" style={{ minWidth: 0 }}>
              <div className="num" style={{ fontSize: 34 }}>{stats.done} / {stats.total}</div>
              <div className="eyebrow">Reset complete</div>
              {prevStats && <div className="small muted">Last week: {prevStats.done}/{prevStats.total}</div>}
            </div>
          </div>
          <div className="card">
            <div className="eyebrow">Pending</div>
            <div className="num mt-8" style={{ fontSize: 44 }}>{stats.pending}</div>
            <div className="small muted">{stats.inProgress} in progress · {stats.notStarted} not started</div>
          </div>
          <div className="card">
            <div className="eyebrow">Team avg</div>
            <div className="row gap-8 mt-8" style={{ alignItems: "baseline" }}>
              <Score value={stats.avgScore} size={44} />
            </div>
            <div className="small muted row gap-8">vs W{prevWeek?.weekNumber ?? "—"} <Delta from={prevStats?.avgScore} to={stats.avgScore} /></div>
          </div>
        </div>
        <div className="row wrap gap-8 mt-16 small muted">
          <span>⏱ Deadline {fmtDateTime(week.deadline, settings.schedule.timezone)}</span>
        </div>
        <div className="row wrap gap-8 mt-24" aria-label="Who's reset">
          {roster.map((r) => {
            const isDone = r.status === "submitted" || r.status === "reviewed";
            return (
              <span key={r.userId} className="pill" style={{ padding: "4px 12px 4px 4px", opacity: isDone ? 1 : 0.55, borderColor: isDone ? "var(--accent)" : undefined }} title={`${r.name}: ${r.status.replace("_", " ")}`}>
                <Avatar emoji={r.avatar} name={r.name} size="sm" />
                {r.name.split(" ")[0]} {isDone ? "✓" : r.status === "in_progress" ? "…" : ""}
              </span>
            );
          })}
        </div>
      </section>

      {/* Carry forward */}
      <section className="section grid-2 rise-3">
        <div className="card flat">
          <div className="section-head" style={{ marginBottom: 8 }}>
            <h2 className="h3">Carrying into this week</h2>
            {lastPlan[0] && <span className="eyebrow">from W{lastPlan[0].weekNumber}</span>}
          </div>
          {commitments.length === 0 ? (
            <p className="muted">No unfinished business. 👀</p>
          ) : (
            <ul className="stack gap-12" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
              {commitments.map((c) => (
                <li key={c.id} className="row gap-12" style={{ alignItems: "flex-start" }}>
                  <span style={{ marginTop: 2 }}>{c.status === "completed" ? "✅" : c.status === "partial" ? "◐" : c.status === "not_completed" ? "✕" : c.kind === "non_negotiable" ? "🔒" : "○"}</span>
                  <span className="grow">
                    <span style={{ fontWeight: 600 }}>{c.title}</span>
                    {c.streak >= 2 && <span className="pill bad" style={{ marginLeft: 8 }}>open {c.streak} weeks</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="stack gap-16">
          {lastReflection?.nonNegotiable && (
            <div className="nn">
              <div className="eyebrow" style={{ color: "color-mix(in oklab, var(--bg) 55%, transparent)" }}>Your non-negotiable</div>
              <div className="h3 mt-8" style={{ fontSize: 24 }}>&ldquo;{lastReflection.nonNegotiable}&rdquo;</div>
            </div>
          )}
          {latestFeedback[0] ? (
            <Link href={`/reset/${latestFeedback[0].resetId}/view`} className="card link flat">
              <div className="row between">
                <span className="eyebrow">Feedback · W{latestFeedback[0].weekNumber}</span>
                <span>{latestFeedback[0].status === "kudos" ? "🔥" : latestFeedback[0].status === "needs_attention" ? "⚑" : "💬"}</span>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 17 }}>&ldquo;{latestFeedback[0].comment}&rdquo;</p>
              <div className="small muted mt-8">— {latestFeedback[0].reviewer}</div>
            </Link>
          ) : (
            <div className="card flat"><span className="muted">No feedback yet. Submit and it lands here.</span></div>
          )}
          {myReset && <div className="row gap-8 small muted">Your status: <StatusPill status={myReset.status} /></div>}
        </div>
      </section>
    </main>
  );
}
