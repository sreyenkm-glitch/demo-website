import Link from "next/link";
import { LineChart } from "./line-chart";
import { Avatar, Delta, Empty, Score, StatusPill } from "./ui";
import { fmtRange } from "@/lib/dates";
import { isDone, userHistory } from "@/lib/queries";
import { getRatingCategories } from "@/lib/settings";
import { extractThemes } from "@/lib/themes";

const CHART_METRICS = ["work", "efficiency", "morale", "ownership", "execution"];

export async function PersonHistory({ user, viewer }: { user: { id: string; name: string; avatar: string | null; title: string | null; department: string | null }; viewer: "self" | "admin" }) {
  const [h, cats] = await Promise.all([userHistory(user.id), getRatingCategories()]);
  const done = h.resets.filter((r) => isDone(r.status));
  const chrono = [...h.resets].reverse();
  const latest = done[0];
  const before = done[1];
  const avg = done.length ? done.reduce((a, r) => a + (r.score ?? 0), 0) / done.length : null;
  const resetLink = (id: string) => (viewer === "admin" ? `/admin/resets/${id}` : `/reset/${id}/view`);
  const missThemes = extractThemes(h.misses.map((m) => ({ text: `${m.title} ${m.reason}`, label: `W${m.weekNumber}: ${m.title}` })), 5);
  const recurringWins = extractThemes(h.wins.map((w) => ({ text: `${w.title} ${w.description}`, label: `W${w.weekNumber}: ${w.title}` })), 4);
  const learnThemes = extractThemes(h.learnings.map((l) => ({ text: l.content, label: `W${l.weekNumber}: ${l.content}` })), 4);

  if (!h.resets.length) {
    return <Empty title="Nothing here yet." body="Your first reset starts the loop." action={viewer === "self" ? <Link href="/reset" className="btn primary">Start reset →</Link> : undefined} />;
  }

  return (
    <div>
      <header className="row wrap gap-16 between rise" style={{ alignItems: "flex-end" }}>
        <div className="row gap-16">
          <Avatar emoji={user.avatar} name={user.name} size="lg" />
          <div>
            <div className="eyebrow">{viewer === "self" ? "My history" : "History"} · {done.length} resets</div>
            <h1 className="h2 mt-8">{user.name}</h1>
            <div className="small muted">{user.title ?? user.department}</div>
          </div>
        </div>
        <div className="row gap-8">
          <Link className="btn sm" href={`/compare${viewer === "admin" ? `?user=${user.id}` : ""}`}>⇄ Compare weeks</Link>
          <a className="btn sm" href={`/api/export?type=person&userId=${user.id}`}>⬇ CSV</a>
        </div>
      </header>

      <section className="grid-3 mt-32">
        <div className="card">
          <div className="eyebrow">Latest</div>
          <div className="mt-8"><Score value={latest?.score} size={56} /></div>
          <div className="small muted row gap-8">W{latest?.weekNumber ?? "—"} <Delta from={before?.score} to={latest?.score} /></div>
        </div>
        <div className="card">
          <div className="eyebrow">Average</div>
          <div className="mt-8"><Score value={avg == null ? null : Math.round(avg * 10) / 10} size={56} /></div>
          <div className="small muted">across {done.length} weeks</div>
        </div>
        <div className="card">
          <div className="eyebrow">Open loops</div>
          <div className="num mt-8" style={{ fontSize: 56, color: h.unfinished.some((u) => u.streak >= 3) ? "var(--bad)" : undefined }}>{h.unfinished.length}</div>
          <div className="small muted">unfinished commitments</div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h3" style={{ fontSize: 24 }}>Overall score</h2><span className="eyebrow">weekly · /10</span></div>
        <div className="card">
          <LineChart ariaLabel={`${user.name} overall score by week`} points={chrono.map((r) => ({ label: `W${r.weekNumber}`, value: isDone(r.status) ? r.score : null, hint: isDone(r.status) ? undefined : "no reset" }))} height={200} />
        </div>
        <div className="grid-3 mt-16">
          {cats.filter((c) => CHART_METRICS.includes(c.key)).map((c) => (
            <div key={c.key} className="card tight">
              <div className="row between">
                <span style={{ fontWeight: 700 }}>{c.label}</span>
                <span className="mono small">{latest ? h.ratings.get(latest.id)?.[c.key] ?? "–" : "–"}</span>
              </div>
              <div className="mt-8">
                <LineChart compact ariaLabel={`${c.label} by week`} min={1} max={10} height={110} points={chrono.map((r) => ({ label: `W${r.weekNumber}`, value: isDone(r.status) ? h.ratings.get(r.id)?.[c.key] ?? null : null }))} unit="int" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section grid-2" style={{ alignItems: "start" }}>
        <div>
          <div className="section-head"><h2 className="h3" style={{ fontSize: 24 }}>Week by week</h2></div>
          <div className="stack gap-8">
            {h.resets.map((r) => (
              <Link key={r.id} href={resetLink(r.id)} className="card tight link row gap-16">
                <div style={{ width: 84 }}>
                  <div className="num" style={{ fontSize: 28 }}>W{r.weekNumber}</div>
                  <div className="tiny faint">{fmtRange(r.startDate, r.endDate)}</div>
                </div>
                <div className="grow"><StatusPill status={r.status} /></div>
                <Score value={isDone(r.status) ? r.score : null} size={28} />
              </Link>
            ))}
          </div>
        </div>
        <div className="stack gap-24">
          <div>
            <div className="section-head"><h2 className="h3" style={{ fontSize: 24 }}>Unfinished commitments</h2></div>
            {h.unfinished.length === 0 ? (
              <p className="muted">No unfinished business. 👀</p>
            ) : (
              <div className="stack gap-8">
                {h.unfinished.slice(0, 8).map((u, i) => (
                  <div key={i} className="entry" style={u.streak >= 3 ? { borderColor: "var(--bad)" } : undefined}>
                    <b>{u.title}</b>
                    <div className="small muted mt-8">
                      {u.streak >= 2 ? <span style={{ color: "var(--bad)", fontWeight: 600 }}>Incomplete {u.streak} consecutive weeks</span> : <>Last reviewed W{u.lastWeek} · {u.lastStatus === "partial" ? "partly done" : "not done"}</>}
                      <span className="faint"> · weeks {u.weeks.map((w) => `W${w}`).join(", ")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Recurring title="Recurring misses" themes={missThemes} empty="No repeating misses. Each week, new mistakes — that's growth." />
          <Recurring title="Recurring wins" themes={recurringWins} empty="Wins vary week to week." />
          <Recurring title="Recurring learnings" themes={learnThemes} empty="Not enough learnings yet to spot a pattern." />
        </div>
      </section>

      {h.reviews.length > 0 && (
        <section className="section">
          <div className="section-head"><h2 className="h3" style={{ fontSize: 24 }}>Feedback</h2></div>
          <div className="grid-2">
            {h.reviews.slice(0, 6).map((r, i) => (
              <div key={i} className="card tight flat">
                <div className="row between"><span className="eyebrow">{r.reviewer}</span><span>{r.status === "kudos" ? "🔥" : r.status === "needs_attention" ? "⚑" : "💬"}</span></div>
                <p style={{ margin: "8px 0 0" }}>{r.comment}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Recurring({ title, themes, empty }: { title: string; themes: { term: string; count: number; examples: string[] }[]; empty: string }) {
  return (
    <div>
      <div className="section-head" style={{ marginBottom: 10 }}><h2 className="h3">{title}</h2></div>
      {themes.length === 0 ? (
        <p className="small muted">{empty}</p>
      ) : (
        <div className="stack gap-8">
          {themes.map((t) => (
            <details key={t.term} className="panel">
              <summary className="row between" style={{ cursor: "pointer", listStyle: "none" }}>
                <b>&ldquo;{t.term}&rdquo;</b><span className="pill">{t.count}×</span>
              </summary>
              <ul className="small muted" style={{ margin: "8px 0 0", paddingLeft: 18 }}>{t.examples.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
