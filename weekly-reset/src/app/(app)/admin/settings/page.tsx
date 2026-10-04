import { PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getCurrentWeek } from "@/lib/resets";
import { ACCENTS, getRatingCategories, getSettings } from "@/lib/settings";
import { GeneralForm } from "./general-form";
import { QuestionsEditor } from "./questions-editor";
import { RatingsEditor } from "./ratings-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const [s, cats, week] = await Promise.all([getSettings(), getRatingCategories(true), getCurrentWeek()]);
  return (
    <main className="container page">
      <PageHead eyebrow="Admin settings" title="Tune the ritual" sub="Brand, rhythm, what gets rated, and what gets asked." />
      <div className="grid-2 mt-32" style={{ alignItems: "start" }}>
        <section>
          <h2 className="h3" style={{ marginBottom: 12 }}>General</h2>
          <GeneralForm s={s} accents={Object.entries(ACCENTS).map(([key, a]) => ({ key, label: a.label, value: a.value }))} />
        </section>
        <section className="stack gap-48">
          <div>
            <h2 className="h3">Rating categories &amp; weights</h2>
            <p className="small muted" style={{ marginTop: 4 }}>Overall score = weighted average. &ldquo;Higher = worse&rdquo; metrics are flipped before weighting. Saving recalculates every stored score.</p>
            <div className="mt-16"><RatingsEditor initial={cats.map(({ key, label, description, weight, inverted, lowLabel, highLabel, active }) => ({ key, label, description, weight, inverted, lowLabel, highLabel, active }))} /></div>
          </div>
          <div>
            <h2 className="h3">Reset questions</h2>
            <p className="small muted" style={{ marginTop: 4 }}>Each week snapshots the questions when it starts, so history keeps the wording people actually answered.</p>
            <div className="mt-16"><QuestionsEditor initial={s.questions} openWeek={week && week.status === "open" ? { id: week.id, number: week.weekNumber } : null} /></div>
          </div>
        </section>
      </div>
    </main>
  );
}
