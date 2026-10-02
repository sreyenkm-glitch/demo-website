import type { ReactNode } from "react";
import { fmtShort } from "@/lib/dates";
import type { ResetDetail } from "@/lib/resets";
import { COMMITMENT_STATUS, CONTROLLABILITY, PRIORITY_LEVELS, WORK_STATUS } from "@/lib/reset-types";
import type { QuestionSet } from "@/lib/settings";
import { LEARNING_CATEGORIES } from "@/lib/settings";
import { Meter, Score } from "./ui";

type Cat = { key: string; label: string; inverted: boolean };

function Block({ num, title, children, empty }: { num: string; title: string; children: ReactNode; empty?: boolean }) {
  return (
    <section className="section" style={{ marginTop: 44 }}>
      <div className="row gap-12" style={{ alignItems: "baseline", marginBottom: 14 }}>
        <span className="section-num">{num}</span>
        <h2 className="h2" style={{ fontSize: 28 }}>{title}</h2>
      </div>
      {empty ? <p className="faint">Nothing logged.</p> : children}
    </section>
  );
}

export function ResetReadout({ d, categories, questions }: { d: ResetDetail; categories: Cat[]; questions?: QuestionSet | null }) {
  const allCats = [...categories, ...Object.keys(d.ratings).filter((k) => !categories.some((c) => c.key === k)).map((k) => ({ key: k, label: k, inverted: false }))];
  const custom: Record<string, string> = d.reflection ? JSON.parse(d.reflection.customAnswers) : {};
  const learnLabel = (k: string) => LEARNING_CATEGORIES.find((c) => c.key === k)?.label ?? k;
  return (
    <div>
      <section className="grid-2 mt-32">
        <div className="card">
          <div className="eyebrow">Overall</div>
          <div className="mt-8"><Score value={d.reset.overallScore} size={72} suffix /></div>
          <p className="small muted" style={{ marginBottom: 0 }}>Weighted self-score</p>
        </div>
        <div className="card">
          <div className="stack gap-12">
            {allCats.map((c) => {
              const v = d.ratings[c.key];
              return (
                <div key={c.key} className="row gap-12">
                  <span className="small" style={{ width: 120, flex: "none" }}>{c.label}{c.inverted && <span className="faint"> ↓</span>}</span>
                  <div className="grow"><Meter value={v ?? 0} /></div>
                  <span className="mono small" style={{ width: 22, textAlign: "right" }}>{v ?? "–"}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Block num="01" title="The Week" empty={!d.workItems.length}>
        <div className="stack gap-12">
          {d.workItems.map((w) => (
            <div key={w.id} className="entry">
              <div className="row between gap-12 wrap">
                <b style={{ fontSize: 17 }}>{w.title}</b>
                <span className={`pill ${w.status === "completed" ? "good" : w.status === "blocked" ? "bad" : w.status === "in_progress" ? "mid" : ""}`}>{WORK_STATUS[w.status].emoji} {WORK_STATUS[w.status].label}</span>
              </div>
              {w.description && <p className="muted small" style={{ margin: "6px 0 0" }}>{w.description}</p>}
              {w.impact && <p className="small" style={{ margin: "6px 0 0" }}>→ {w.impact}</p>}
              {w.link && <a className="small hl" href={w.link} target="_blank" rel="noreferrer noopener">{w.link.replace(/^https?:\/\//, "").slice(0, 60)}</a>}
            </div>
          ))}
        </div>
      </Block>

      <Block num="02" title="Wins" empty={!d.wins.length}>
        <div className="stack gap-12">
          {d.wins.map((w) => (
            <div key={w.id} className={`entry ${w.isBiggestWin ? "highlight" : ""}`}>
              <div className="row between gap-12 wrap">
                <b style={{ fontSize: 17 }}>{w.isBiggestWin && "★ "}{w.title}</b>
                {w.impact && <span className="pill accent">{w.impact}</span>}
              </div>
              {w.description && <p className="muted small" style={{ margin: "6px 0 0" }}>{w.description}</p>}
            </div>
          ))}
        </div>
      </Block>

      <Block num="03" title="Misses" empty={!d.misses.length}>
        <div className="stack gap-12">
          {d.misses.map((m) => (
            <div key={m.id} className="entry">
              <div className="row between gap-12 wrap">
                <b style={{ fontSize: 17 }}>{m.isBiggestMiss && "◆ "}{m.title}</b>
                <span className="pill">{CONTROLLABILITY[m.controllability]}</span>
              </div>
              {m.reason && <p className="muted small" style={{ margin: "6px 0 0" }}>Why: {m.reason}</p>}
              {m.correction && <p className="small" style={{ margin: "6px 0 0" }}>Change → <b>{m.correction}</b></p>}
            </div>
          ))}
        </div>
      </Block>

      <Block num="04" title="Learned" empty={!d.learnings.length}>
        <div className="stack gap-12">
          {d.learnings.map((l) => (
            <div key={l.id} className={`entry ${l.isBiggest ? "highlight" : ""}`}>
              <span className="eyebrow">{learnLabel(l.category)}</span>
              <p style={{ margin: "6px 0 0", fontSize: 17 }}>{l.content}</p>
            </div>
          ))}
        </div>
      </Block>

      <Block num="06" title="Own It" empty={!d.commitments.length && !d.reflection?.doDifferently}>
        <div className="stack gap-12">
          {d.commitments.map((c) => (
            <div key={c.id} className="entry">
              <div className="row between gap-12 wrap">
                <b>{c.kind === "non_negotiable" ? "🔒 " : ""}{c.title}</b>
                {c.status ? (
                  <span className={`pill ${COMMITMENT_STATUS[c.status].tone}`}>{COMMITMENT_STATUS[c.status].label}</span>
                ) : (
                  <span className="pill idle">Not reviewed</span>
                )}
              </div>
              {c.streak >= 2 && c.status !== "completed" && (
                <p className="small" style={{ color: "var(--bad)", fontWeight: 600, margin: "8px 0 0" }}>
                  ⚠ Incomplete {c.streak + (c.status ? 1 : 0)} consecutive weeks.
                </p>
              )}
              {c.reason && <p className="muted small" style={{ margin: "6px 0 0" }}>Why: {c.reason}</p>}
              {c.nextAction && <p className="small" style={{ margin: "6px 0 0" }}>Next → {c.nextAction}</p>}
              {c.carriedForward && <span className="pill mid mt-8">↻ Carried forward</span>}
            </div>
          ))}
          {d.reflection?.doDifferently && (
            <div className="callout"><span className="eyebrow">Doing differently</span><p style={{ margin: "4px 0 0" }}>{d.reflection.doDifferently}</p></div>
          )}
        </div>
      </Block>

      <Block num="07" title="Reset" empty={!d.reflection && !d.priorities.length}>
        {d.reflection?.resetReflection && <p style={{ fontSize: 18, marginTop: 0 }}>&ldquo;{d.reflection.resetReflection}&rdquo;</p>}
        <div className="stack gap-12">
          {d.priorities.map((p, i) => (
            <div key={p.id} className="entry row gap-16" style={{ alignItems: "flex-start" }}>
              <span className="num accent-text" style={{ fontSize: 32 }}>{i + 1}</span>
              <div className="grow">
                <div className="row between wrap gap-8">
                  <b style={{ fontSize: 17 }}>{p.title}</b>
                  <span className="pill">{PRIORITY_LEVELS[p.priorityLevel]}</span>
                </div>
                {p.expectedOutcome && <p className="muted small" style={{ margin: "4px 0 0" }}>{p.expectedOutcome}</p>}
                <p className="tiny faint" style={{ margin: "4px 0 0" }}>
                  {p.owner && <>Owner {p.owner}</>}
                  {p.deadline && <> · due {fmtShort(p.deadline)}</>}
                  {p.carriedFromCommitmentId && <> · ↻ carried forward</>}
                </p>
              </div>
            </div>
          ))}
        </div>
        {d.reflection && (
          <div className="grid-3 mt-16">
            {([["🛑 Stop", d.reflection.stop], ["🟢 Start", d.reflection.start], ["🔁 Continue", d.reflection.continue]] as const).map(([k, v]) => (
              <div key={k} className="card tight flat"><div className="eyebrow">{k}</div><div className="mt-8" style={{ fontWeight: 600 }}>{v || <span className="faint">—</span>}</div></div>
            ))}
          </div>
        )}
        {d.reflection?.nonNegotiable && (
          <div className="nn mt-16">
            <div className="eyebrow" style={{ color: "color-mix(in oklab, var(--bg) 60%, transparent)" }}>Non-negotiable</div>
            <div className="h3 mt-8" style={{ fontSize: 26 }}>{d.reflection.nonNegotiable}</div>
          </div>
        )}
      </Block>

      {questions && questions.custom.length > 0 && Object.keys(custom).length > 0 && (
        <Block num="+" title="Extra questions">
          <div className="stack gap-12">
            {questions.custom.filter((q) => custom[q.id]).map((q) => (
              <div key={q.id} className="entry"><span className="eyebrow">{q.prompt}</span><p style={{ margin: "6px 0 0" }}>{custom[q.id]}</p></div>
            ))}
          </div>
        </Block>
      )}
    </div>
  );
}

export function ReviewThread({ reviews }: { reviews: ResetDetail["reviews"] }) {
  if (!reviews.length) return <p className="muted">No feedback yet.</p>;
  return (
    <div className="stack gap-12">
      {reviews.map((r) => (
        <div key={r.id} className="entry">
          <div className="row between gap-8 wrap">
            <span className="small" style={{ fontWeight: 700 }}>{r.reviewerName}</span>
            <span className={`pill ${r.reviewStatus === "kudos" ? "accent" : r.reviewStatus === "needs_attention" ? "bad" : r.reviewStatus === "reviewed" ? "good" : ""}`}>
              {r.reviewStatus === "kudos" ? "🔥 Kudos" : r.reviewStatus === "needs_attention" ? "⚑ Needs attention" : r.reviewStatus === "reviewed" ? "✓ Reviewed" : "💬 Comment"}
            </span>
          </div>
          {r.comment && <p style={{ margin: "8px 0 0" }}>{r.comment}</p>}
          <div className="tiny faint mt-8">{new Date(r.reviewedAt).toUTCString().slice(0, 16)}</div>
        </div>
      ))}
    </div>
  );
}
