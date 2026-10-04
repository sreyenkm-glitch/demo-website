import Link from "next/link";
import { Avatar, Empty, PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { fmtRange } from "@/lib/dates";
import { search } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark style={{ background: "var(--accent)", color: "var(--accent-ink)", borderRadius: 4, padding: "0 2px" }}>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const res = q.length >= 2 ? await search(q) : null;
  const total = res ? res.people.length + res.weeks.length + res.groups.reduce((a, g) => a + g.rows.length, 0) : 0;
  return (
    <main className="container page">
      <PageHead eyebrow="Search" title="Find anything, any week" />
      <form action="/admin/search" className="row gap-8 mt-24" role="search">
        <input name="q" className="input" defaultValue={q} placeholder="Try “referral”, “onboarding”, “Kabir”, “40”…" autoFocus aria-label="Search" style={{ fontSize: 18, minHeight: 56 }} />
        <button className="btn primary" style={{ minHeight: 56 }}>Search</button>
      </form>
      {!res ? (
        <p className="muted mt-24">People, weeks, work, wins, misses, learnings, commitments, priorities.</p>
      ) : total === 0 ? (
        <div className="mt-32"><Empty title="Nothing matched." body={`No reset mentions “${q}”. Yet.`} /></div>
      ) : (
        <div className="stack gap-32 mt-32">
          <p className="small muted" style={{ margin: 0 }}>{total} results for “{q}”</p>
          {res.people.length > 0 && (
            <section>
              <div className="eyebrow" style={{ marginBottom: 8 }}>People</div>
              <div className="row wrap gap-8">
                {res.people.map((p) => (
                  <Link key={p.id} href={`/admin/people/${p.id}`} className="card tight link row gap-12"><Avatar emoji={p.avatar} name={p.name} size="sm" /><span><b><Mark text={p.name} q={q} /></b><span className="tiny muted"> · {p.department}</span></span></Link>
                ))}
              </div>
            </section>
          )}
          {res.weeks.length > 0 && (
            <section>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Weeks</div>
              <div className="row wrap gap-8">
                {res.weeks.map((w) => <Link key={w.id} href={`/admin?week=${w.id}`} className="chip">W{w.weekNumber} · {fmtRange(w.startDate, w.endDate)}</Link>)}
              </div>
            </section>
          )}
          {res.groups.filter((g) => g.rows.length).map((g) => (
            <section key={g.key}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>{g.label} · {g.rows.length}</div>
              <div className="stack gap-8">
                {g.rows.map((r, i) => (
                  <Link key={i} href={`/admin/resets/${r.resetId}`} className="entry row gap-12" style={{ alignItems: "flex-start" }}>
                    <span className="mono small faint" style={{ width: 40 }}>W{r.weekNumber}</span>
                    <span className="grow">
                      <b><Mark text={r.text} q={q} /></b>
                      {r.detail && <span className="small muted clamp2"><Mark text={r.detail} q={q} /></span>}
                    </span>
                    <span className="small muted">{r.name}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
