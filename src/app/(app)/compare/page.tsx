import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { Empty, PageHead } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { fmtRange } from "@/lib/dates";
import { teamTrend } from "@/lib/queries";
import { listWeeks, loadResetDetail } from "@/lib/resets";
import { getRatingCategories } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compare weeks" };

type Change = { label: string; a: number | null; b: number | null; inverted?: boolean };

function verdict(c: Change) {
  if (c.a == null || c.b == null) return { text: "—", cls: "flat" };
  const d = (c.b - c.a) * (c.inverted ? -1 : 1);
  if (Math.abs(d) < 0.05) return { text: "Unchanged", cls: "flat" };
  return d > 0 ? { text: "Improved", cls: "up" } : { text: "Declined", cls: "down" };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ user?: string; a?: string; b?: string }> }) {
  const viewer = await requireUser();
  const sp = await searchParams;
  const isAdmin = viewer.role === "admin";
  const subject = isAdmin && sp.user ? sp.user : viewer.id;
  const team = isAdmin && subject === "team";
  const [weeks, cats, people] = await Promise.all([
    listWeeks(),
    getRatingCategories(),
    isAdmin ? db.query.users.findMany({ columns: { id: true, name: true }, orderBy: schema.users.name }) : Promise.resolve([]),
  ]);

  // Weeks this subject actually has completed resets for (or all weeks for team view).
  const myResets = team
    ? []
    : await db
        .select({ id: schema.weeklyResets.id, weekId: schema.weeklyResets.weekId, status: schema.weeklyResets.status })
        .from(schema.weeklyResets)
        .where(and(eq(schema.weeklyResets.userId, subject), inArray(schema.weeklyResets.status, ["submitted", "reviewed"])));
  const usable = team ? weeks : weeks.filter((w) => myResets.some((r) => r.weekId === w.id));
  const bId = sp.b && usable.some((w) => w.id === sp.b) ? sp.b : usable[0]?.id;
  const aId = sp.a && usable.some((w) => w.id === sp.a) ? sp.a : usable.find((w) => w.id !== bId)?.id;
  const A = weeks.find((w) => w.id === aId);
  const B = weeks.find((w) => w.id === bId);

  const picker = (
    <form className="row wrap gap-8" action="/compare">
      {isAdmin && (
        <select name="user" className="select" defaultValue={team ? "team" : subject} style={{ width: "auto", minHeight: 40, padding: "6px 12px" }} aria-label="Who">
          <option value="team">Whole team</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <select name="a" className="select" defaultValue={aId} style={{ width: "auto", minHeight: 40, padding: "6px 12px" }} aria-label="From week">
        {usable.map((w) => <option key={w.id} value={w.id}>W{w.weekNumber}</option>)}
      </select>
      <span className="faint">→</span>
      <select name="b" className="select" defaultValue={bId} style={{ width: "auto", minHeight: 40, padding: "6px 12px" }} aria-label="To week">
        {usable.map((w) => <option key={w.id} value={w.id}>W{w.weekNumber}</option>)}
      </select>
      <button className="btn sm ink">Compare</button>
    </form>
  );

  if (!A || !B) {
    return (
      <main className="container page">
        <PageHead eyebrow="Compare" title="Week vs week" actions={picker} />
        <div className="mt-32"><Empty title="Need two resets to compare." body="One more week and the patterns start showing." /></div>
      </main>
    );
  }
  const [first, second] = A.startDate <= B.startDate ? [A, B] : [B, A];

  let changes: Change[] = [];
  let extra: React.ReactNode = null;

  if (team) {
    const trend = await teamTrend(60);
    const ta = trend.find((t) => t.weekId === first.id);
    const tb = trend.find((t) => t.weekId === second.id);
    changes = [
      { label: "Reset rate %", a: ta ? Math.round(ta.rate * 100) : null, b: tb ? Math.round(tb.rate * 100) : null },
      { label: "Overall", a: ta?.avgScore ?? null, b: tb?.avgScore ?? null },
      ...cats.map((c) => ({ label: c.label, a: ta?.metrics[c.key] ?? null, b: tb?.metrics[c.key] ?? null, inverted: c.inverted })),
    ];
  } else {
    const ra = myResets.find((r) => r.weekId === first.id)!;
    const rb = myResets.find((r) => r.weekId === second.id)!;
    const [da, db_] = await Promise.all([loadResetDetail(ra.id), loadResetDetail(rb.id)]);
    if (da && db_) {
      changes = [
        { label: "Overall", a: da.reset.overallScore, b: db_.reset.overallScore },
        ...cats.map((c) => ({ label: c.label, a: da.ratings[c.key] ?? null, b: db_.ratings[c.key] ?? null, inverted: c.inverted })),
      ];
      const repeatedMisses = db_.misses.filter((m) => da.misses.some((x) => norm(x.title) === norm(m.title)));
      const stuck = db_.commitments.filter((c) => c.status !== "completed" && c.streak >= 1);
      const fixed = db_.commitments.filter((c) => c.status === "completed" && c.streak >= 1);
      extra = (
        <>
          <section className="section">
            <div className="section-head"><h2 className="h3" style={{ fontSize: 24 }}>Recurring issues</h2></div>
            {stuck.length === 0 && repeatedMisses.length === 0 && fixed.length === 0 ? (
              <p className="muted">No recurring issues between these weeks. Clean.</p>
            ) : (
              <div className="stack gap-12">
                {stuck.map((c) => (
                  <div key={c.id} className="callout bad">
                    <b>&ldquo;{c.title}&rdquo;</b>
                    <div className="small muted">This commitment has remained incomplete for {c.streak + (c.status ? 1 : 0)} consecutive weeks.</div>
                  </div>
                ))}
                {fixed.map((c) => (
                  <div key={c.id} className="callout">
                    <b>&ldquo;{c.title}&rdquo;</b>
                    <div className="small muted">Finally done after {c.streak} week{c.streak > 1 ? "s" : ""} of carrying it. 🎉</div>
                  </div>
                ))}
                {repeatedMisses.map((m) => (
                  <div key={m.id} className="callout bad">
                    <b>&ldquo;{m.title}&rdquo;</b>
                    <div className="small muted">Showed up as a miss in both W{first.weekNumber} and W{second.weekNumber}.</div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="section grid-2">
            {[da, db_].map((d) => (
              <div key={d.reset.id} className="card flat">
                <div className="eyebrow">W{d.week.weekNumber}</div>
                <div className="mt-8"><b>★ {(d.wins.find((w) => w.isBiggestWin) ?? d.wins[0])?.title ?? "—"}</b></div>
                <div className="small muted mt-8">◆ {(d.misses.find((m) => m.isBiggestMiss) ?? d.misses[0])?.title ?? "—"}</div>
                <div className="small mt-8">🔒 {d.reflection?.nonNegotiable || "—"}</div>
                <Link className="small hl mt-8" style={{ display: "inline-block" }} href={viewer.role === "admin" && d.user.id !== viewer.id ? `/admin/resets/${d.reset.id}` : `/reset/${d.reset.id}/view`}>Open reset →</Link>
              </div>
            ))}
          </section>
        </>
      );
    }
  }

  const improved = changes.filter((c) => verdict(c).cls === "up").length;
  const declined = changes.filter((c) => verdict(c).cls === "down").length;
  const subjectName = team ? "Whole team" : people.find((p) => p.id === subject)?.name ?? viewer.name;

  return (
    <main className="container page">
      <PageHead eyebrow={`Compare · ${subjectName}`} title={<>WEEK {first.weekNumber} <span className="accent-text">→</span> WEEK {second.weekNumber}</>} sub={`${fmtRange(first.startDate, first.endDate)} vs ${fmtRange(second.startDate, second.endDate)}`} actions={picker} />
      <div className="row gap-8 mt-24 wrap">
        <span className="pill good">▲ {improved} improved</span>
        <span className="pill bad">▼ {declined} declined</span>
        <span className="pill">= {changes.length - improved - declined} unchanged</span>
      </div>
      <section className="mt-24 table-wrap">
        <table className="table">
          <thead><tr><th>Metric</th><th className="n">W{first.weekNumber}</th><th className="n">W{second.weekNumber}</th><th>Change</th></tr></thead>
          <tbody>
            {changes.map((c) => {
              const v = verdict(c);
              return (
                <tr key={c.label}>
                  <td><b>{c.label}</b>{c.inverted && <span className="faint tiny"> (lower is better)</span>}</td>
                  <td className="n">{c.a ?? "–"}</td>
                  <td className="n" style={{ fontWeight: 700 }}>{c.b ?? "–"}</td>
                  <td><span className={`delta ${v.cls}`}>{v.cls === "up" ? "▲ " : v.cls === "down" ? "▼ " : ""}{v.text}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {extra}
    </main>
  );
}
