import Link from "next/link";
import { LineChart } from "@/components/line-chart";
import { Delta, Empty, PageHead, Score } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { teamInsights, teamTrend } from "@/lib/queries";
import { getCurrentWeek } from "@/lib/resets";
import { LEARNING_CATEGORIES } from "@/lib/settings";
import type { Theme } from "@/lib/themes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  await requireAdmin();
  const week = await getCurrentWeek();
  const [trend, ins] = await Promise.all([teamTrend(8), teamInsights(week, 4)]);
  if (!trend.length || !ins) return <main className="container page"><Empty title="Nothing here yet." body="Your first reset starts the loop." /></main>;

  const cur = trend[trend.length - 1];
  // Compare against the most recent week that has data if current is still filling up.
  const prev = trend[trend.length - 2];
  const pts = (fn: (t: (typeof trend)[number]) => number | null, hint = true) =>
    trend.map((t) => ({ label: `W${t.weekNumber}`, value: fn(t), hint: hint ? `${t.done}/${t.total} in` : undefined }));
  const ctl = ins.controllability;
  const ctlTotal = ctl.yes + ctl.partially + ctl.no || 1;
  const maxCat = Math.max(1, ...Object.values(ins.learningCats));

  return (
    <main className="container page">
      <PageHead eyebrow="Insights · last 4 weeks of resets" title="What the loop is telling us" sub="Insight, not data overload." actions={<a className="btn sm" href="/api/export?type=summary">⬇ Team summary CSV</a>} />

      <section className="grid-3 mt-32">
        <div className="card">
          <div className="eyebrow">Team reset rate</div>
          <div className="num mt-8" style={{ fontSize: 56 }}>{Math.round(cur.rate * 100)}%</div>
          <div className="small muted">W{cur.weekNumber} · {cur.done}/{cur.total} {prev && <>· W{prev.weekNumber} {Math.round(prev.rate * 100)}%</>}</div>
        </div>
        <div className="card">
          <div className="eyebrow">Average performance</div>
          <div className="row gap-12 mt-8" style={{ alignItems: "baseline" }}><Score value={cur.avgScore} size={56} /><Delta from={prev?.avgScore} to={cur.avgScore} /></div>
          <div className="small muted">W{cur.weekNumber} vs W{prev?.weekNumber ?? "—"} (submitted resets)</div>
        </div>
        <div className="card">
          <div className="eyebrow">Team morale</div>
          <div className="row gap-12 mt-8" style={{ alignItems: "baseline" }}><Score value={cur.metrics.morale ?? null} size={56} /><Delta from={prev?.metrics.morale} to={cur.metrics.morale} /></div>
          <div className="small muted">self-reported, avg</div>
        </div>
      </section>

      <section className="section grid-2">
        <div className="card">
          <div className="row between"><h2 className="h3">Reset rate</h2><span className="eyebrow">% completed</span></div>
          <div className="mt-16"><LineChart ariaLabel="Team reset rate by week" min={0} max={100} ticks={[0, 50, 100]} unit="percent" points={pts((t) => Math.round(t.rate * 100))} /></div>
        </div>
        <div className="card">
          <div className="row between"><h2 className="h3">Average score</h2><span className="eyebrow">/10</span></div>
          <div className="mt-16"><LineChart ariaLabel="Average overall score by week" points={pts((t) => t.avgScore)} /></div>
        </div>
        <div className="card">
          <div className="row between"><h2 className="h3">Team morale</h2><span className="eyebrow">/10</span></div>
          <div className="mt-16"><LineChart ariaLabel="Average morale by week" points={pts((t) => t.metrics.morale ?? null)} /></div>
        </div>
        <div className="card">
          <div className="row between"><h2 className="h3">Execution trend</h2><span className="eyebrow">/10</span></div>
          <div className="mt-16"><LineChart ariaLabel="Average execution by week" points={pts((t) => t.metrics.execution ?? null)} /></div>
        </div>
      </section>

      <section className="section grid-2" style={{ alignItems: "start" }}>
        <div>
          <div className="section-head"><h2 className="h2" style={{ fontSize: 28 }}>Common misses</h2><span className="eyebrow">{ins.missCount} misses</span></div>
          <div className="panel">
            <div className="eyebrow">Was it controllable?</div>
            <div className="row mt-8" style={{ height: 12, borderRadius: 99, overflow: "hidden", gap: 2 }} role="img" aria-label={`Controllable ${ctl.yes}, partially ${ctl.partially}, not ${ctl.no}`}>
              <span style={{ width: `${(ctl.yes / ctlTotal) * 100}%`, background: "var(--accent)", height: "100%" }} />
              <span style={{ width: `${(ctl.partially / ctlTotal) * 100}%`, background: "var(--ink-3)", height: "100%" }} />
              <span style={{ width: `${(ctl.no / ctlTotal) * 100}%`, background: "var(--line-strong)", height: "100%" }} />
            </div>
            <div className="row wrap gap-16 mt-8 small">
              <span><b>{Math.round((ctl.yes / ctlTotal) * 100)}%</b> on us</span>
              <span className="muted"><b>{Math.round((ctl.partially / ctlTotal) * 100)}%</b> partially</span>
              <span className="faint"><b>{Math.round((ctl.no / ctlTotal) * 100)}%</b> out of our hands</span>
            </div>
          </div>
          <Themes themes={ins.missThemes} empty="No repeating misses across the team." />
        </div>
        <div>
          <div className="section-head"><h2 className="h2" style={{ fontSize: 28 }}>Common learnings</h2></div>
          <div className="bars panel">
            {LEARNING_CATEGORIES.map((c) => (
              <div key={c.key} className="bar-row">
                <span>{c.label}</span>
                <div className="bar-track"><span style={{ width: `${((ins.learningCats[c.key] ?? 0) / maxCat) * 100}%` }} /></div>
                <span className="mono small" style={{ textAlign: "right" }}>{ins.learningCats[c.key] ?? 0}</span>
              </div>
            ))}
          </div>
          <Themes themes={ins.learningThemes} empty="Learnings are all over the place — no shared theme yet." />
        </div>
      </section>

      <section className="section grid-2" style={{ alignItems: "start" }}>
        <div>
          <div className="section-head"><h2 className="h2" style={{ fontSize: 28 }}>Priority themes</h2>{ins.priorityWeek && <span className="eyebrow">plans from W{ins.priorityWeek}</span>}</div>
          {ins.priorityThemes.length === 0 ? <p className="muted">No shared focus yet.</p> : (
            <div className="chips">
              {ins.priorityThemes.map((t) => (
                <span key={t.term} className="chip" style={{ cursor: "default", fontSize: 13 + Math.min(t.count, 5) * 2, fontWeight: 600 }} title={t.examples.join("\n")}>
                  {t.term} <span className="faint mono tiny">{t.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="section-head"><h2 className="h2" style={{ fontSize: 28 }}>Unresolved commitments</h2></div>
          {ins.unresolved.length === 0 ? <p className="muted">No unfinished business. 👀</p> : (
            <div className="stack gap-8">
              {ins.unresolved.slice(0, 8).map((u, i) => (
                <Link key={i} href={`/admin/people/${u.userId}`} className="entry row gap-12 between" style={u.streak >= 3 ? { borderColor: "var(--bad)" } : undefined}>
                  <span className="grow"><b>{u.title}</b><span className="small muted"> — {u.name}</span></span>
                  <span className={`pill ${u.streak >= 3 ? "bad" : "mid"}`}>{u.streak} wks</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Themes({ themes, empty }: { themes: Theme[]; empty: string }) {
  if (!themes.length) return <p className="muted mt-16">{empty}</p>;
  return (
    <div className="stack gap-8 mt-16">
      {themes.map((t) => (
        <details key={t.term} className="entry">
          <summary className="row between" style={{ cursor: "pointer", listStyle: "none" }}>
            <b>&ldquo;{t.term}&rdquo;</b>
            <span className="pill">{t.count} resets</span>
          </summary>
          <ul className="small muted" style={{ margin: "10px 0 0", paddingLeft: 18 }}>{t.examples.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </details>
      ))}
    </div>
  );
}
