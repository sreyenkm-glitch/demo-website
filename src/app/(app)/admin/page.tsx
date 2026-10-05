import { eq } from "drizzle-orm";
import Link from "next/link";
import { addMemberToWeek, nudgePending, setWeekLock } from "@/app/actions/admin";
import { ActionButton } from "@/components/action-button";
import { Avatar, Delta, Empty, PageHead, ReviewFlag, Score, StatusPill } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { dueIn, fmtDateTime, fmtRange } from "@/lib/dates";
import { type RosterRow, isDone, rosterStats, weekRoster } from "@/lib/queries";
import { getCurrentWeek, getPreviousWeek, getWeek, listWeeks } from "@/lib/resets";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team" };

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "completed", label: "Completed" },
  { key: "pending", label: "Pending" },
  { key: "review", label: "Needs review" },
  { key: "high", label: "High performance" },
  { key: "attention", label: "Needs attention" },
] as const;

const needsAttention = (r: RosterRow) =>
  r.reviewFlag === "needs_attention" || (isDone(r.status) && ((r.overallScore ?? 10) < 6.5 || (r.ratings.morale ?? 10) <= 5));

function applyFilter(rows: RosterRow[], f: string) {
  switch (f) {
    case "completed": return rows.filter((r) => isDone(r.status));
    case "pending": return rows.filter((r) => !isDone(r.status));
    case "review": return rows.filter((r) => r.status === "submitted");
    case "high": return rows.filter((r) => isDone(r.status) && (r.overallScore ?? 0) >= 8);
    case "attention": return rows.filter(needsAttention);
    default: return rows;
  }
}

export default async function AdminTeam({ searchParams }: { searchParams: Promise<{ week?: string; f?: string; dept?: string; started?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const settings = await getSettings();
  const week = sp.week ? await getWeek(sp.week) : await getCurrentWeek();
  if (!week) {
    return (
      <main className="container page">
        <Empty title="Nothing here yet." body="Your first reset starts the loop." action={<Link className="btn primary" href="/admin/weeks">START NEW RESET →</Link>} />
      </main>
    );
  }
  const [roster, prev, weeks, allUsers] = await Promise.all([weekRoster(week.id), getPreviousWeek(week), listWeeks(), db.query.users.findMany({ where: eq(schema.users.active, true) })]);
  const prevRoster = prev ? await weekRoster(prev.id) : [];
  const prevScore = new Map(prevRoster.map((r) => [r.userId, r.overallScore]));
  const stats = rosterStats(roster);
  const prevStats = prev ? rosterStats(prevRoster) : null;
  const f = sp.f ?? "all";
  const dept = sp.dept ?? "";
  const rows = applyFilter(roster, f).filter((r) => !dept || r.department === dept);
  const departments = [...new Set(roster.map((r) => r.department).filter(Boolean))] as string[];
  const notIncluded = allUsers.filter((u) => !roster.some((r) => r.userId === u.id));
  const q = (o: Record<string, string>) => {
    const p = new URLSearchParams({ week: week.id, f, ...(dept ? { dept } : {}), ...o });
    if (p.get("f") === "all") p.delete("f");
    if (!p.get("dept")) p.delete("dept");
    return `/admin?${p}`;
  };
  const due = dueIn(week.deadline);

  return (
    <main className="container page">
      {sp.started && <div className="card accent rise" style={{ marginBottom: 24 }}><b>Week {week.weekNumber} is live.</b> Everyone&apos;s last plan has been carried forward. ↻</div>}
      <PageHead
        eyebrow={<>Team · {week.status === "locked" ? "🔒 locked" : `deadline ${fmtDateTime(week.deadline, settings.schedule.timezone)}`}</>}
        title={<>Week {week.weekNumber} <span className="faint" style={{ fontWeight: 600 }}>{fmtRange(week.startDate, week.endDate)}</span></>}
        actions={
          <>
            <form action="/admin" className="row gap-8">
              <select name="week" className="select" defaultValue={week.id} style={{ minHeight: 40, padding: "6px 12px", width: "auto" }} aria-label="Week">
                {weeks.map((w) => <option key={w.id} value={w.id}>W{w.weekNumber} · {fmtRange(w.startDate, w.endDate)}{w.status === "locked" ? " 🔒" : ""}</option>)}
              </select>
              <button className="btn sm">Go</button>
            </form>
            <a className="btn sm" href={`/api/export?type=week&weekId=${week.id}`}>⬇ CSV</a>
            {week.status === "open" && <ActionButton action={nudgePending.bind(null, week.id)}>👀 Nudge pending</ActionButton>}
            {week.status === "open" ? (
              <ActionButton action={setWeekLock.bind(null, week.id, true)} confirm={`Lock week ${week.weekNumber}? Nobody can edit after this.`} className="btn sm ink">🔒 Lock week</ActionButton>
            ) : (
              <ActionButton action={setWeekLock.bind(null, week.id, false)}>Unlock</ActionButton>
            )}
          </>
        }
      />

      <section className="grid-4 mt-32">
        <div className="card">
          <div className="eyebrow">Reset rate</div>
          <div className="num mt-8" style={{ fontSize: 44 }}>{Math.round(stats.rate * 100)}%</div>
          <div className="small muted">{stats.done}/{stats.total} · last week {prevStats ? Math.round(prevStats.rate * 100) : "—"}%</div>
        </div>
        <div className="card">
          <div className="eyebrow">Avg score</div>
          <div className="mt-8"><Score value={stats.avgScore} size={44} /></div>
          <div className="small muted row gap-8">vs W{prev?.weekNumber ?? "—"} <Delta from={prevStats?.avgScore} to={stats.avgScore} /></div>
        </div>
        <div className="card">
          <div className="eyebrow">Needs review</div>
          <div className="num mt-8" style={{ fontSize: 44 }}>{stats.needsReview}</div>
          <Link className="small hl" href={q({ f: "review" })}>Review now →</Link>
        </div>
        <div className="card">
          <div className="eyebrow">Pending</div>
          <div className="num mt-8" style={{ fontSize: 44 }}>{stats.pending}</div>
          <div className={`small ${due.overdue ? "err" : "muted"}`}>{week.status === "locked" ? "Week closed" : due.label}</div>
        </div>
      </section>

      <section className="section" style={{ marginTop: 40 }}>
        <div className="row wrap gap-8 between">
          <div className="chips" role="group" aria-label="Filter">
            {FILTERS.map((x) => (
              <Link key={x.key} href={q({ f: x.key })} className={`chip ${f === x.key ? "on" : ""}`} aria-current={f === x.key ? "page" : undefined}>
                {x.label}
                {x.key !== "all" && <span className="faint mono tiny">{applyFilter(roster, x.key).length}</span>}
              </Link>
            ))}
          </div>
          {departments.length > 1 && (
            <div className="chips">
              <Link href={q({ dept: "" })} className={`chip ${!dept ? "on" : ""}`}>All teams</Link>
              {departments.map((d) => <Link key={d} href={q({ dept: d })} className={`chip ${dept === d ? "on" : ""}`}>{d}</Link>)}
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="mt-24"><Empty title={f === "review" ? "Inbox zero. 🧘" : "Nobody here."} body={f === "review" ? "Every submitted reset has been reviewed." : "Try another filter."} /></div>
        ) : (
          <>
            {/* desktop table */}
            <div className="table-wrap mt-24 hide-mobile">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th><th>Reset</th><th className="n">Overall</th><th className="n">Work</th><th className="n">Effic.</th><th className="n">Morale</th><th>Biggest win</th><th>Biggest miss</th><th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.resetId} className="clickable">
                      <td>
                        <Link href={`/admin/resets/${r.resetId}`} className="row gap-12">
                          <Avatar emoji={r.avatar} name={r.name} size="sm" />
                          <span className="stack"><b>{r.name}</b><span className="tiny faint">{r.department}</span></span>
                        </Link>
                      </td>
                      <td><StatusPill status={r.status} /></td>
                      <td className="n">
                        <div className="stack" style={{ alignItems: "flex-end" }}>
                          <Score value={r.overallScore} size={20} />
                          {isDone(r.status) && <Delta from={prevScore.get(r.userId)} to={r.overallScore} />}
                        </div>
                      </td>
                      <td className="n">{r.ratings.work ?? "–"}</td>
                      <td className="n">{r.ratings.efficiency ?? "–"}</td>
                      <td className="n" style={{ color: (r.ratings.morale ?? 10) <= 5 ? "var(--bad)" : undefined }}>{r.ratings.morale ?? "–"}</td>
                      <td style={{ maxWidth: 220 }}><span className="clamp2 small">{r.biggestWin ?? <span className="faint">—</span>}</span></td>
                      <td style={{ maxWidth: 220 }}><span className="clamp2 small">{r.biggestMiss ?? <span className="faint">—</span>}</span></td>
                      <td>{r.status === "submitted" ? <Link href={`/admin/resets/${r.resetId}`} className="pill mid">Review →</Link> : <ReviewFlag flag={r.reviewFlag} />}{needsAttention(r) && r.reviewFlag !== "needs_attention" && <span className="pill bad" style={{ marginLeft: 4 }} title="Low score or morale">⚑</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* mobile cards */}
            <div className="stack gap-12 mt-24 hide-desktop">
              {rows.map((r) => (
                <Link key={r.resetId} href={`/admin/resets/${r.resetId}`} className="card tight link">
                  <div className="row gap-12">
                    <Avatar emoji={r.avatar} name={r.name} />
                    <div className="grow">
                      <b>{r.name}</b>
                      <div className="row gap-8 mt-8 wrap"><StatusPill status={r.status} /><ReviewFlag flag={r.reviewFlag} /></div>
                    </div>
                    <Score value={r.overallScore} size={28} />
                  </div>
                  {r.biggestWin && <p className="small" style={{ margin: "12px 0 0" }}>★ {r.biggestWin}</p>}
                  {r.biggestMiss && <p className="small muted" style={{ margin: "4px 0 0" }}>◆ {r.biggestMiss}</p>}
                </Link>
              ))}
            </div>
          </>
        )}

        {week.status === "open" && notIncluded.length > 0 && (
          <div className="row wrap gap-8 mt-24 small muted">
            Not in this week:
            {notIncluded.map((u) => (
              <ActionButton key={u.id} action={addMemberToWeek.bind(null, week.id, u.id)} className="chip">+ {u.name}</ActionButton>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
