import { and, desc, eq, lt } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResetReadout, ReviewThread } from "@/components/reset-readout";
import { Avatar, BackLink, Delta, StatusPill } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtRange } from "@/lib/dates";
import { weekRoster } from "@/lib/queries";
import { loadResetDetail } from "@/lib/resets";
import { getRatingCategories, getSettings } from "@/lib/settings";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

export default async function AdminResetPage({ params }: { params: Promise<{ resetId: string }> }) {
  await requireAdmin();
  const { resetId } = await params;
  const d = await loadResetDetail(resetId);
  if (!d) notFound();
  const [categories, settings, roster] = await Promise.all([getRatingCategories(), getSettings(), weekRoster(d.week.id)]);
  const idx = roster.findIndex((r) => r.resetId === resetId);
  const prevPerson = roster[(idx - 1 + roster.length) % roster.length];
  const nextPerson = roster[(idx + 1) % roster.length];
  const prevReset = await db.query.weeklyResets.findFirst({
    where: and(eq(schema.weeklyResets.userId, d.user.id), lt(schema.weeklyResets.startDate, d.reset.startDate)),
    orderBy: desc(schema.weeklyResets.startDate),
  });
  const prevRatings = prevReset ? Object.fromEntries((await db.query.ratings.findMany({ where: eq(schema.ratings.resetId, prevReset.id) })).map((r) => [r.metric, r.score])) : {};
  const submitted = d.reset.status === "submitted" || d.reset.status === "reviewed";
  const empty = d.reset.status === "not_started";

  return (
    <main className="container page">
      <BackLink href={`/admin?week=${d.week.id}`}>Week {d.week.weekNumber} team</BackLink>
      <header className="row wrap gap-16 between rise" style={{ alignItems: "flex-end" }}>
        <div className="row gap-16">
          <Avatar emoji={d.user.avatar} name={d.user.name} size="lg" />
          <div>
            <div className="eyebrow">W{d.week.weekNumber} · {fmtRange(d.week.startDate, d.week.endDate)}</div>
            <h1 className="h2 mt-8">{d.user.name}</h1>
            <div className="row gap-8 mt-8 wrap">
              <StatusPill status={d.reset.status} />
              <span className="small muted">{d.user.title ?? d.user.department}</span>
              {d.reset.submittedAt && <span className="small faint">submitted {fmtDateTime(d.reset.submittedAt, settings.schedule.timezone)}</span>}
            </div>
          </div>
        </div>
        <div className="row gap-8 wrap">
          {roster.length > 1 && <Link className="btn sm" href={`/admin/resets/${prevPerson.resetId}`} aria-label={`Previous: ${prevPerson.name}`}>← {prevPerson.name.split(" ")[0]}</Link>}
          {roster.length > 1 && <Link className="btn sm" href={`/admin/resets/${nextPerson.resetId}`} aria-label={`Next: ${nextPerson.name}`}>{nextPerson.name.split(" ")[0]} →</Link>}
          <Link className="btn sm" href={`/admin/people/${d.user.id}`}>History</Link>
          <a className="btn sm" href={`/api/export?type=person&userId=${d.user.id}`}>⬇ CSV</a>
        </div>
      </header>

      <div className="grid-2 mt-32" style={{ alignItems: "start" }}>
        <section className="card">
          <h2 className="h3">Review</h2>
          <p className="small muted" style={{ marginTop: 4 }}>{submitted ? "Mark it, add context, keep it human." : "Not submitted yet — you can leave a comment."}</p>
          <div className="mt-16"><ReviewForm resetId={d.reset.id} submitted={submitted} /></div>
        </section>
        <section>
          <h2 className="h3" style={{ marginBottom: 12 }}>Thread</h2>
          <ReviewThread reviews={d.reviews} />
          {prevReset && Object.keys(d.ratings).length > 0 && (
            <div className="card flat mt-24">
              <div className="eyebrow">vs W{prevReset.weekNumber}</div>
              <div className="row wrap gap-8 mt-8">
                <span className="pill">Overall {d.reset.overallScore?.toFixed(1) ?? "–"} <Delta from={prevReset.overallScore} to={d.reset.overallScore} /></span>
                {categories.map((c) => (
                  <span key={c.key} className="pill">{c.label} {d.ratings[c.key] ?? "–"} <Delta from={c.inverted ? (prevRatings[c.key] != null ? -prevRatings[c.key] : null) : prevRatings[c.key]} to={c.inverted ? (d.ratings[c.key] != null ? -d.ratings[c.key] : null) : d.ratings[c.key]} digits={0} /></span>
                ))}
              </div>
              <Link href={`/compare?user=${d.user.id}&a=${prevReset.weekId}&b=${d.week.id}`} className="small hl mt-8" style={{ display: "inline-block" }}>Full comparison →</Link>
            </div>
          )}
        </section>
      </div>

      {empty ? (
        <div className="empty mt-48"><div className="big">Hasn&apos;t started yet.</div><p className="muted">Commitments carried from last week are waiting for them.</p></div>
      ) : (
        <ResetReadout d={d} categories={categories} questions={settings.questions} />
      )}
    </main>
  );
}
