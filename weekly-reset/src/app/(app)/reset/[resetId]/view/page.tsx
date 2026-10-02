import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Confetti } from "@/components/confetti";
import { ResetReadout, ReviewThread } from "@/components/reset-readout";
import { StatusPill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtRange } from "@/lib/dates";
import { editState, loadResetDetail } from "@/lib/resets";
import { getRatingCategories, getSettings } from "@/lib/settings";
import { ReopenButton } from "./reopen-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "My reset" };

export default async function ResetView({ params, searchParams }: { params: Promise<{ resetId: string }>; searchParams: Promise<{ done?: string }> }) {
  const { resetId } = await params;
  const { done } = await searchParams;
  const user = await requireUser();
  const d = await loadResetDetail(resetId);
  if (!d) notFound();
  if (d.reset.userId !== user.id) {
    if (user.role === "admin") redirect(`/admin/resets/${resetId}`);
    notFound();
  }
  const state = editState(d.reset, d.week);
  if (state.canEdit) redirect(`/reset/${resetId}`);
  const [categories, settings] = await Promise.all([getRatingCategories(), getSettings()]);
  const celebrate = done === "1" && (d.reset.status === "submitted" || d.reset.status === "reviewed");

  return (
    <main className="container narrow page">
      {celebrate ? (
        <>
          <Confetti />
          <div className="complete-hero">
            <div className="stamp display" style={{ fontSize: "clamp(56px, 14vw, 104px)" }}>
              RESET<br /><span className="accent-text">COMPLETE.</span>
            </div>
            <p className="muted mt-24" style={{ fontSize: 18 }}>Week {d.week.weekNumber} is in the books. Next week starts here.</p>
            <div className="row gap-12 mt-24" style={{ justifyContent: "center" }}>
              <Link href="/" className="btn primary">Back to home</Link>
              <Link href="/history" className="btn">See my trend</Link>
            </div>
          </div>
          <hr className="divider mt-32" />
        </>
      ) : (
        <header className="rise">
          <Link href="/history" className="small muted">← History</Link>
          <div className="eyebrow mt-24">Week {d.week.weekNumber} · {fmtRange(d.week.startDate, d.week.endDate)}</div>
          <h1 className="h1 mt-8">MY RESET.</h1>
          <div className="row wrap gap-12 mt-16">
            <StatusPill status={d.reset.status} />
            {state.reason && <span className="small muted">{state.reason}</span>}
            {state.canReopen && <ReopenButton resetId={resetId} />}
          </div>
        </header>
      )}

      {d.reviews.length > 0 && (
        <section className="section" style={{ marginTop: 40 }}>
          <h2 className="h3" style={{ marginBottom: 12 }}>Feedback</h2>
          <ReviewThread reviews={d.reviews} />
        </section>
      )}

      <ResetReadout d={d} categories={categories} questions={settings.questions} />
    </main>
  );
}
