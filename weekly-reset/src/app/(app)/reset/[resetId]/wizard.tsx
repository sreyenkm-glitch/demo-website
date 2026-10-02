"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveResetAction } from "@/app/actions/reset";
import {
  COMMITMENT_STATUS,
  CONTROLLABILITY,
  PRIORITY_LEVELS,
  type ResetPayload,
  WORK_STATUS,
  submissionProblems,
} from "@/lib/reset-types";
import { fmtScore, overallScore, scoreTone } from "@/lib/scoring";
import type { QuestionSet, SectionKey } from "@/lib/settings";

type Category = { key: string; label: string; description: string; weight: number; inverted: boolean; lowLabel: string; highLabel: string };
type Commitment = { id: string; title: string; expectedOutcome: string; kind: "priority" | "non_negotiable"; streak: number; lineageId: string };
type Ctx = {
  prevWeekNumber: number | null;
  prevRatings: Record<string, number>;
  prevCorrections: string[];
  prevDoDifferently: string;
  prevStop: string;
  prevStart: string;
  prevContinue: string;
};

const STEPS: { key: SectionKey | "summary"; num: string; title: string; kicker: string }[] = [
  { key: "week", num: "01", title: "The Week", kicker: "What actually happened?" },
  { key: "wins", num: "02", title: "Wins", kicker: "Take the credit." },
  { key: "misses", num: "03", title: "Misses", kicker: "Be honest. This is for learning, not blame." },
  { key: "learned", num: "04", title: "Learned", kicker: "What's the lesson you'd tell last-Monday-you?" },
  { key: "rate", num: "05", title: "Rate", kicker: "Gut feel. No overthinking." },
  { key: "own", num: "06", title: "Own It", kicker: "Last week you promised. Let's check." },
  { key: "reset", num: "07", title: "Reset", kicker: "What are we changing?" },
  { key: "summary", num: "✓", title: "My Reset", kicker: "Next week starts here." },
];
const SECTION_COUNT = 7;

type SaveState = "saved" | "dirty" | "saving" | "error";

export function ResetWizard(props: {
  resetId: string;
  initial: ResetPayload;
  week: { number: number; range: string; due: string; overdue: boolean; nextWeekEnd: string };
  firstName: string;
  commitments: Commitment[];
  categories: Category[];
  questions: QuestionSet;
  learningCategories: { key: string; label: string }[];
  context: Ctx;
}) {
  const { resetId, week, categories, questions, commitments, context } = props;
  const router = useRouter();
  const [p, setP] = useState<ResetPayload>(props.initial);
  const [step, setStep] = useState(() => {
    const done = new Set(props.initial.sectionsDone);
    const idx = STEPS.findIndex((s) => s.key !== "summary" && !done.has(s.key));
    return idx === -1 ? STEPS.length - 1 : idx;
  });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);
  const [problems, setProblems] = useState<{ section: string; message: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const latest = useRef(p);
  const dirty = useRef(false);
  const inflight = useRef<Promise<unknown> | null>(null);

  const flash = useCallback((msg: string, bad = false) => {
    setToast({ msg, bad });
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const update = useCallback((fn: (prev: ResetPayload) => ResetPayload) => {
    // Keep the ref in lockstep so an immediate save (e.g. "Keep going") never sends a stale snapshot.
    const next = fn(latest.current);
    latest.current = next;
    setP(next);
    dirty.current = true;
    setSaveState("dirty");
  }, []);

  const save = useCallback(async () => {
    if (inflight.current) await inflight.current;
    if (!dirty.current) return true;
    dirty.current = false;
    setSaveState("saving");
    const run = saveResetAction(resetId, latest.current, false);
    inflight.current = run;
    const res = await run.finally(() => (inflight.current = null));
    if (!res.ok) {
      dirty.current = true;
      setSaveState("error");
      flash(res.error, true);
      return false;
    }
    setSaveState(dirty.current ? "dirty" : "saved");
    return true;
  }, [resetId, flash]);

  // Autosave after a pause in typing.
  useEffect(() => {
    if (!dirty.current) return;
    const t = window.setTimeout(() => void save(), 1400);
    return () => window.clearTimeout(t);
  }, [p, save]);

  // Never lose answers by accident.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inflight.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const goto = useCallback(
    (i: number) => {
      setStep(i);
      void save();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [save],
  );

  const current = STEPS[step];
  function next() {
    if (current.key !== "summary" && !p.sectionsDone.includes(current.key))
      update((prev) => ({ ...prev, sectionsDone: [...prev.sectionsDone, current.key] }));
    goto(Math.min(step + 1, STEPS.length - 1));
  }

  async function submit() {
    setSubmitting(true);
    if (inflight.current) await inflight.current;
    const payload = { ...latest.current, sectionsDone: STEPS.filter((s) => s.key !== "summary").map((s) => s.key) };
    const res = await saveResetAction(resetId, payload, true);
    if (!res.ok) {
      setSubmitting(false);
      setProblems(res.problems ?? []);
      flash(res.error, true);
      return;
    }
    dirty.current = false;
    router.push(`/reset/${resetId}/view?done=1`);
    router.refresh();
  }

  const doneCount = p.sectionsDone.filter((s) => STEPS.some((x) => x.key === s && s !== "summary")).length;
  const score = useMemo(() => overallScore(p.ratings, categories), [p.ratings, categories]);
  const custom = (section: SectionKey) => questions.custom.filter((q) => q.section === section);

  const customBlock = (section: SectionKey) =>
    custom(section).map((q) => (
      <div key={q.id} className="field mt-24">
        <label className="label" htmlFor={`cq-${q.id}`}>{q.prompt}</label>
        <textarea
          id={`cq-${q.id}`}
          className="textarea"
          value={p.reflection.customAnswers[q.id] ?? ""}
          onChange={(e) => update((prev) => ({ ...prev, reflection: { ...prev.reflection, customAnswers: { ...prev.reflection.customAnswers, [q.id]: e.target.value } } }))}
        />
      </div>
    ));

  return (
    <div className="wizard-page">
      <div className="wizard-top">
        <div className="container narrow">
          <div className="row between gap-12" style={{ marginBottom: 10 }}>
            <div className="row gap-8 small" style={{ minWidth: 0 }}>
              <Link href="/" className="muted" aria-label="Back to dashboard">✕</Link>
              <span style={{ fontWeight: 700 }}>W{week.number}</span>
              <span className="faint truncate hide-mobile">{week.range}</span>
              <span className={`tiny ${week.overdue ? "err" : "faint"}`}>· {week.due}</span>
            </div>
            <div className="row gap-12">
              <span className={`save-state ${saveState === "error" ? "error" : saveState !== "saved" ? "dirty" : ""}`} aria-live="polite">
                <span className="dot" />
                {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Editing"}
              </span>
              <span className="tiny mono" style={{ fontWeight: 600 }}>{doneCount} / {SECTION_COUNT}</span>
            </div>
          </div>
          <div className="steps" style={{ ["--n" as string]: STEPS.length }} role="tablist" aria-label="Reset sections">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={i === step}
                aria-label={`${s.title}${p.sectionsDone.includes(s.key) ? " (done)" : ""}`}
                className={i === step ? "current" : p.sectionsDone.includes(s.key) ? "done" : ""}
                onClick={() => goto(i)}
              />
            ))}
          </div>
        </div>
      </div>

      <main className="container narrow" style={{ paddingTop: 32 }}>
        <div key={current.key} className="rise">
          <div className="section-num">{current.num === "✓" ? "FINAL" : `SECTION ${current.num}`}</div>
          <h1 className="h1 mt-8" style={{ fontSize: "clamp(44px, 11vw, 76px)" }}>{current.title.toUpperCase()}</h1>
          <p className="muted mt-8" style={{ fontSize: 18 }}>
            {current.key === "summary" ? current.kicker : questions.prompts[current.key as SectionKey] ?? current.kicker}
          </p>
          {current.key !== "summary" && <p className="faint small" style={{ marginTop: -8 }}>{current.kicker}</p>}

          <div className="mt-32">
            {current.key === "week" && (
              <>
                <WeekStep p={p} update={update} commitments={commitments} />
                {customBlock("week")}
              </>
            )}
            {current.key === "wins" && (<><WinsStep p={p} update={update} />{customBlock("wins")}</>)}
            {current.key === "misses" && (<><MissesStep p={p} update={update} context={context} />{customBlock("misses")}</>)}
            {current.key === "learned" && (<><LearnStep p={p} update={update} cats={props.learningCategories} />{customBlock("learned")}</>)}
            {current.key === "rate" && (<><RateStep p={p} update={update} categories={categories} score={score} context={context} />{customBlock("rate")}</>)}
            {current.key === "own" && (
              <>
                <OwnStep p={p} update={update} commitments={commitments} context={context} firstName={props.firstName} flash={flash} weekEnd={week.nextWeekEnd} />
                {customBlock("own")}
              </>
            )}
            {current.key === "reset" && (
              <>
                <ResetStep p={p} update={update} firstName={props.firstName} weekEnd={week.nextWeekEnd} context={context} />
                {customBlock("reset")}
              </>
            )}
            {current.key === "summary" && (
              <SummaryStep
                p={p}
                score={score}
                categories={categories}
                problems={problems.length ? problems : submissionProblems(p, categories.map((c) => c.key))}
                goto={(section) => goto(STEPS.findIndex((s) => s.key === section))}
              />
            )}
          </div>
        </div>
      </main>

      <div className="wizard-bottom">
        <div className="container narrow row gap-12">
          {step > 0 ? (
            <button type="button" className="btn icon" onClick={() => goto(step - 1)} aria-label="Previous section">←</button>
          ) : (
            <button type="button" className="btn sm ghost" onClick={async () => { await save(); flash("Saved. Come back anytime."); router.push("/"); }}>
              Save &amp; exit
            </button>
          )}
          <div className="grow" />
          {current.key === "summary" ? (
            <button type="button" className="btn primary lg" onClick={submit} disabled={submitting}>
              {submitting ? "Locking it in…" : <>SUBMIT RESET <span className="arrow">→</span></>}
            </button>
          ) : (
            <>
              {step > 0 && (
                <button type="button" className="btn sm ghost hide-mobile" onClick={async () => { await save(); router.push("/"); }}>
                  Save &amp; continue later
                </button>
              )}
              <button type="button" className="btn primary lg" onClick={next}>
                {step === STEPS.length - 2 ? "Review my reset" : "Keep going"} <span className="arrow">→</span>
              </button>
            </>
          )}
        </div>
      </div>

      {toast && <div className={`toast ${toast.bad ? "bad" : ""}`} role="status">{toast.msg}</div>}
    </div>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

type StepProps = { p: ResetPayload; update: (fn: (prev: ResetPayload) => ResetPayload) => void };

function patchAt<T>(list: T[], i: number, patch: Partial<T>) {
  return list.map((x, j) => (j === i ? { ...x, ...patch } : x));
}
function removeAt<T>(list: T[], i: number) {
  return list.filter((_, j) => j !== i);
}

function Entry({ children, highlight, onRemove, label }: { children: ReactNode; highlight?: boolean; onRemove: () => void; label: string }) {
  return (
    <div className={`entry ${highlight ? "highlight" : ""}`}>
      <div className="entry-head">
        <div className="grow stack gap-12">{children}</div>
        <button type="button" className="btn icon ghost sm" style={{ minHeight: 36, width: 36 }} onClick={onRemove} aria-label={`Remove ${label}`}>✕</button>
      </div>
    </div>
  );
}

function More({ label, children, open }: { label: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open}>
      <summary className="small muted" style={{ cursor: "pointer", userSelect: "none", padding: "4px 0" }}>{label}</summary>
      <div className="stack gap-12 mt-8">{children}</div>
    </details>
  );
}

function Text({ label, value, onChange, placeholder, multiline, id }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; id: string }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea id={id} className="textarea" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={2} />
      ) : (
        <input id={id} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function Star({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className="star" aria-pressed={on} onClick={onClick} title={label} aria-label={label}>
      {on ? "★" : "☆"}
    </button>
  );
}

/* ─────────────────────────── 01 THE WEEK ─────────────────────────── */

function WeekStep({ p, update, commitments }: StepProps & { commitments: Commitment[] }) {
  const add = (title = "") =>
    update((prev) => ({ ...prev, workItems: [...prev.workItems, { title, description: "", status: "completed", impact: "", link: "" }] }));
  const suggestions = commitments.filter((c) => c.kind === "priority" && !p.workItems.some((w) => w.title === c.title));
  return (
    <div className="stack gap-12">
      {suggestions.length > 0 && (
        <div className="stack gap-8" style={{ marginBottom: 8 }}>
          <span className="eyebrow">From last week&apos;s plan · tap to add</span>
          <div className="quick">
            {suggestions.map((s) => (
              <button key={s.id} type="button" className="chip" onClick={() => add(s.title)}>+ {s.title}</button>
            ))}
          </div>
        </div>
      )}
      {p.workItems.map((w, i) => (
        <Entry key={i} label={w.title || "work item"} onRemove={() => update((prev) => ({ ...prev, workItems: removeAt(prev.workItems, i) }))}>
          <input
            className="input bare"
            aria-label="Task or initiative"
            placeholder="Task / initiative"
            value={w.title}
            autoFocus={!w.title}
            onChange={(e) => update((prev) => ({ ...prev, workItems: patchAt(prev.workItems, i, { title: e.target.value }) }))}
          />
          <div className="chips" role="group" aria-label="Status">
            {(Object.keys(WORK_STATUS) as (keyof typeof WORK_STATUS)[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`chip ${k === "completed" ? "good" : k === "blocked" ? "bad" : k === "in_progress" ? "mid" : ""}`}
                aria-pressed={w.status === k}
                onClick={() => update((prev) => ({ ...prev, workItems: patchAt(prev.workItems, i, { status: k }) }))}
              >
                {WORK_STATUS[k].emoji} {WORK_STATUS[k].label}
              </button>
            ))}
          </div>
          <More label="+ What was done, impact, link" open={!!(w.description || w.impact || w.link)}>
            <Text id={`w-d-${i}`} label="What was done" value={w.description} multiline onChange={(v) => update((prev) => ({ ...prev, workItems: patchAt(prev.workItems, i, { description: v }) }))} />
            <Text id={`w-i-${i}`} label="Impact / outcome" value={w.impact} placeholder="What changed because of it?" onChange={(v) => update((prev) => ({ ...prev, workItems: patchAt(prev.workItems, i, { impact: v }) }))} />
            <Text id={`w-l-${i}`} label="Link (optional)" value={w.link} placeholder="https://" onChange={(v) => update((prev) => ({ ...prev, workItems: patchAt(prev.workItems, i, { link: v }) }))} />
          </More>
        </Entry>
      ))}
      <button type="button" className="add-btn" onClick={() => add()}>+ Add what you worked on</button>
      {p.workItems.length === 0 && <p className="faint small">Start with the thing that took most of your week.</p>}
    </div>
  );
}

/* ─────────────────────────── 02 WINS ─────────────────────────── */

function WinsStep({ p, update }: StepProps) {
  const add = () => update((prev) => ({ ...prev, wins: [...prev.wins, { title: "", description: "", impact: "", isBiggestWin: prev.wins.length === 0 }] }));
  const setBiggest = (i: number) => update((prev) => ({ ...prev, wins: prev.wins.map((w, j) => ({ ...w, isBiggestWin: j === i })) }));
  return (
    <div className="stack gap-12">
      {p.wins.map((w, i) => (
        <Entry key={i} label={w.title || "win"} highlight={w.isBiggestWin} onRemove={() => update((prev) => ({ ...prev, wins: removeAt(prev.wins, i) }))}>
          <div className="row gap-8">
            <input className="input bare grow" aria-label="What happened?" placeholder="What happened?" value={w.title} autoFocus={!w.title} onChange={(e) => update((prev) => ({ ...prev, wins: patchAt(prev.wins, i, { title: e.target.value }) }))} />
            <Star on={w.isBiggestWin} onClick={() => setBiggest(i)} label="Biggest win of the week" />
          </div>
          {w.isBiggestWin && <span className="pill accent" style={{ width: "fit-content" }}>★ Biggest win of the week</span>}
          <Text id={`win-d-${i}`} label="Why did it matter?" value={w.description} multiline onChange={(v) => update((prev) => ({ ...prev, wins: patchAt(prev.wins, i, { description: v }) }))} />
          <Text id={`win-m-${i}`} label="Metric / result (optional)" value={w.impact} placeholder="e.g. +310 signups" onChange={(v) => update((prev) => ({ ...prev, wins: patchAt(prev.wins, i, { impact: v }) }))} />
        </Entry>
      ))}
      <button type="button" className="add-btn" onClick={add}>+ Add a win</button>
      {p.wins.length === 0 && <p className="faint small">Small counts. Shipped something? Unblocked someone? That&apos;s a win.</p>}
    </div>
  );
}

/* ─────────────────────────── 03 MISSES ─────────────────────────── */

function MissesStep({ p, update, context }: StepProps & { context: Ctx }) {
  const add = () =>
    update((prev) => ({ ...prev, misses: [...prev.misses, { title: "", description: "", reason: "", controllability: "partially", correction: "", isBiggestMiss: prev.misses.length === 0 }] }));
  const setBiggest = (i: number) => update((prev) => ({ ...prev, misses: prev.misses.map((m, j) => ({ ...m, isBiggestMiss: j === i })) }));
  return (
    <div className="stack gap-12">
      {context.prevCorrections.length > 0 && (
        <div className="callout small" style={{ marginBottom: 8 }}>
          <span className="eyebrow">Last week you said you&apos;d change</span>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }} className="muted">
            {context.prevCorrections.slice(0, 3).map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}
      {p.misses.map((m, i) => (
        <Entry key={i} label={m.title || "miss"} highlight={m.isBiggestMiss} onRemove={() => update((prev) => ({ ...prev, misses: removeAt(prev.misses, i) }))}>
          <div className="row gap-8">
            <input className="input bare grow" aria-label="What went wrong?" placeholder="What went wrong?" value={m.title} autoFocus={!m.title} onChange={(e) => update((prev) => ({ ...prev, misses: patchAt(prev.misses, i, { title: e.target.value }) }))} />
            <Star on={m.isBiggestMiss} onClick={() => setBiggest(i)} label="Biggest miss" />
          </div>
          <Text id={`m-r-${i}`} label="Why?" value={m.reason} multiline onChange={(v) => update((prev) => ({ ...prev, misses: patchAt(prev.misses, i, { reason: v }) }))} />
          <div className="field">
            <span className="label">Was it controllable?</span>
            <div className="chips" role="group" aria-label="Was it controllable?">
              {(Object.keys(CONTROLLABILITY) as (keyof typeof CONTROLLABILITY)[]).map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={m.controllability === k} onClick={() => update((prev) => ({ ...prev, misses: patchAt(prev.misses, i, { controllability: k }) }))}>
                  {CONTROLLABILITY[k]}
                </button>
              ))}
            </div>
          </div>
          <Text id={`m-c-${i}`} label="What should change next week?" value={m.correction} onChange={(v) => update((prev) => ({ ...prev, misses: patchAt(prev.misses, i, { correction: v }) }))} />
        </Entry>
      ))}
      <button type="button" className="add-btn" onClick={add}>+ Add a miss</button>
      {p.misses.length === 0 && <p className="faint small">Clean week? Rare, but respect. Otherwise — name it so we can fix it.</p>}
    </div>
  );
}

/* ─────────────────────────── 04 LEARNED ─────────────────────────── */

function LearnStep({ p, update, cats }: StepProps & { cats: { key: string; label: string }[] }) {
  const add = (category: string) => update((prev) => ({ ...prev, learnings: [...prev.learnings, { category, content: "", isBiggest: prev.learnings.length === 0 }] }));
  return (
    <div className="stack gap-12">
      <div className="stack gap-8">
        <span className="eyebrow">Add a learning about…</span>
        <div className="chips">
          {cats.map((c) => (
            <button key={c.key} type="button" className="chip" onClick={() => add(c.key)}>+ {c.label}</button>
          ))}
        </div>
      </div>
      {p.learnings.map((l, i) => (
        <Entry key={i} label="learning" highlight={l.isBiggest} onRemove={() => update((prev) => ({ ...prev, learnings: removeAt(prev.learnings, i) }))}>
          <div className="row gap-8 between">
            <select className="select" style={{ width: "auto", minHeight: 36, padding: "4px 10px", fontSize: 14 }} value={l.category} aria-label="Category" onChange={(e) => update((prev) => ({ ...prev, learnings: patchAt(prev.learnings, i, { category: e.target.value }) }))}>
              {cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <Star on={l.isBiggest} onClick={() => update((prev) => ({ ...prev, learnings: prev.learnings.map((x, j) => ({ ...x, isBiggest: j === i })) }))} label="Biggest learning" />
          </div>
          <textarea className="textarea" aria-label="What did you learn?" autoFocus={!l.content} placeholder="This week taught me…" value={l.content} onChange={(e) => update((prev) => ({ ...prev, learnings: patchAt(prev.learnings, i, { content: e.target.value }) }))} />
        </Entry>
      ))}
      {p.learnings.length === 0 && <p className="faint small">One sentence is plenty. The best ones sound obvious in hindsight.</p>}
    </div>
  );
}

/* ─────────────────────────── 05 RATE ─────────────────────────── */

function RateStep({ p, update, categories, score, context }: StepProps & { categories: Category[]; score: number | null; context: Ctx }) {
  return (
    <div>
      <div className="card row between" style={{ position: "sticky", top: 140, zIndex: 5 }}>
        <div>
          <div className="eyebrow">Overall · weighted</div>
          <div className="small muted">{Object.keys(p.ratings).length} / {categories.length} rated</div>
        </div>
        <div className={`score ${scoreTone(score)}`} style={{ fontSize: 48 }}>{fmtScore(score)}</div>
      </div>
      <div className="mt-16">
        {categories.map((c) => {
          const v = p.ratings[c.key];
          const set = typeof v === "number";
          const prev = context.prevRatings[c.key];
          return (
            <div key={c.key} className="slider-row">
              <div className="row between gap-12">
                <div className="grow">
                  <label htmlFor={`r-${c.key}`} className="h3" style={{ fontSize: 22 }}>{c.label}</label>
                  {c.inverted && <span className="pill" style={{ marginLeft: 8 }}>self-check</span>}
                  <p className="small muted" style={{ margin: "2px 0 0" }}>{c.description}</p>
                </div>
                <div className={`num slider-val ${set ? "" : "faint"}`}>{set ? v : "–"}</div>
              </div>
              <input
                id={`r-${c.key}`}
                type="range"
                min={1}
                max={10}
                step={1}
                className={`range ${set ? "" : "unset"}`}
                value={set ? v : 5}
                style={{ ["--fill" as string]: `${(((set ? v : 5) - 1) / 9) * 100}%` }}
                onChange={(e) => update((prev) => ({ ...prev, ratings: { ...prev.ratings, [c.key]: Number(e.target.value) } }))}
                onClick={(e) => !set && update((prev) => ({ ...prev, ratings: { ...prev.ratings, [c.key]: Number((e.target as HTMLInputElement).value) } }))}
                aria-valuetext={set ? `${v} of 10` : "not rated"}
              />
              <div className="row between tiny faint">
                <span>1 · {c.lowLabel}</span>
                {prev != null && <span>last week: {prev}</span>}
                <span>{c.highLabel} · 10</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="tiny faint mt-16">Scores are weighted by what the team decided matters most. Self-checks count in reverse — owning a gap never drags you down more than hiding it would.</p>
    </div>
  );
}

/* ─────────────────────────── 06 OWN IT ─────────────────────────── */

function OwnStep({ p, update, commitments, context, firstName, flash, weekEnd }: StepProps & { commitments: Commitment[]; context: Ctx; firstName: string; flash: (m: string, bad?: boolean) => void; weekEnd: string }) {
  const stateOf = (id: string) => p.commitments.find((c) => c.id === id);
  const patch = (id: string, change: Partial<ResetPayload["commitments"][number]>) =>
    update((prev) => ({ ...prev, commitments: prev.commitments.map((c) => (c.id === id ? { ...c, ...change } : c)) }));

  function toggleCarry(c: Commitment, on: boolean) {
    if (on && p.priorities.length >= 3 && !p.priorities.some((x) => x.carriedFromCommitmentId === c.id)) {
      flash("Top 3 is full — drop one in Reset first.", true);
      return;
    }
    update((prev) => {
      const priorities = on
        ? prev.priorities.some((x) => x.carriedFromCommitmentId === c.id)
          ? prev.priorities
          : [{ title: c.title, expectedOutcome: c.expectedOutcome, owner: firstName, deadline: plusDays(weekEnd, 5), priorityLevel: "p0" as const, lineageId: c.lineageId, carriedFromCommitmentId: c.id }, ...prev.priorities].slice(0, 3)
        : prev.priorities.filter((x) => x.carriedFromCommitmentId !== c.id);
      return { ...prev, priorities, commitments: prev.commitments.map((x) => (x.id === c.id ? { ...x, carriedForward: on } : x)) };
    });
    if (on) flash("Carried forward into next week ↻");
  }

  return (
    <div className="stack gap-12">
      {commitments.length === 0 && (
        <div className="empty">
          <div className="big">No unfinished business. 👀</div>
          <p className="muted">{context.prevWeekNumber ? "Last week's reset didn't set priorities." : "This is your first reset — the loop starts with what you commit to today."}</p>
        </div>
      )}
      {commitments.map((c) => {
        const s = stateOf(c.id);
        if (!s) return null;
        const missed = s.status === "partial" || s.status === "not_completed";
        return (
          <div key={c.id} className={`entry ${c.streak >= 2 ? "highlight" : ""}`} style={c.streak >= 2 ? { borderColor: "var(--bad)", boxShadow: "0 0 0 3px var(--bad-bg)" } : undefined}>
            <div className="row gap-8" style={{ alignItems: "flex-start" }}>
              <span>{c.kind === "non_negotiable" ? "🔒" : "◎"}</span>
              <div className="grow">
                <div style={{ fontWeight: 700, fontSize: 18 }}>{c.title}</div>
                {c.expectedOutcome && <div className="small muted">Outcome: {c.expectedOutcome}</div>}
                {c.kind === "non_negotiable" && <div className="tiny faint">Your non-negotiable</div>}
              </div>
            </div>
            {c.streak >= 2 && (
              <p className="small" style={{ color: "var(--bad)", fontWeight: 600, margin: "10px 0 0" }}>
                ⚠ This has stayed incomplete for {c.streak} consecutive weeks. Kill it, shrink it, or unblock it.
              </p>
            )}
            <div className="chips mt-16" role="group" aria-label={`Status of ${c.title}`}>
              {(Object.keys(COMMITMENT_STATUS) as (keyof typeof COMMITMENT_STATUS)[]).map((k) => (
                <button key={k} type="button" className={`chip ${COMMITMENT_STATUS[k].tone}`} aria-pressed={s.status === k} onClick={() => {
                  patch(c.id, { status: k });
                  if (k === "completed" && s.carriedForward) toggleCarry(c, false);
                }}>
                  {k === "completed" ? "✓ " : k === "partial" ? "◐ " : "✕ "}{COMMITMENT_STATUS[k].label}
                </button>
              ))}
            </div>
            {missed && (
              <div className="stack gap-12 mt-16">
                <Text id={`c-r-${c.id}`} label="Why?" value={s.reason} placeholder="Honest answer, no essay." onChange={(v) => patch(c.id, { reason: v })} />
                <Text id={`c-n-${c.id}`} label="Next action" value={s.nextAction} placeholder="The smallest next step" onChange={(v) => patch(c.id, { nextAction: v })} />
                {c.kind === "priority" && (
                  <label className="row gap-12" style={{ cursor: "pointer" }}>
                    <input type="checkbox" className="checkbox" checked={s.carriedForward} onChange={(e) => toggleCarry(c, e.target.checked)} />
                    <span><b>Carry forward</b> <span className="muted small">— add to next week&apos;s top 3</span></span>
                  </label>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div className="field mt-24">
        <label className="label" htmlFor="do-diff" style={{ fontSize: 16, color: "var(--ink)" }}>What will you do differently this week?</label>
        {context.prevDoDifferently && <span className="tiny faint">Last week: “{context.prevDoDifferently}”</span>}
        <textarea id="do-diff" className="textarea" value={p.reflection.doDifferently} placeholder="One concrete change." onChange={(e) => update((prev) => ({ ...prev, reflection: { ...prev.reflection, doDifferently: e.target.value } }))} />
      </div>
    </div>
  );
}

function plusDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ─────────────────────────── 07 RESET ─────────────────────────── */

function ResetStep({ p, update, firstName, weekEnd, context }: StepProps & { firstName: string; weekEnd: string; context: Ctx }) {
  const r = p.reflection;
  const setR = (k: keyof ResetPayload["reflection"], v: string) => update((prev) => ({ ...prev, reflection: { ...prev.reflection, [k]: v } }));
  const addPriority = () =>
    update((prev) => ({
      ...prev,
      priorities: [...prev.priorities, { title: "", expectedOutcome: "", owner: firstName, deadline: plusDays(weekEnd, 5), priorityLevel: (["p0", "p1", "p2"] as const)[Math.min(prev.priorities.length, 2)], lineageId: null, carriedFromCommitmentId: null }],
    }));
  const dropPriority = (i: number) =>
    update((prev) => {
      const gone = prev.priorities[i];
      return {
        ...prev,
        priorities: removeAt(prev.priorities, i),
        commitments: gone?.carriedFromCommitmentId ? prev.commitments.map((c) => (c.id === gone.carriedFromCommitmentId ? { ...c, carriedForward: false } : c)) : prev.commitments,
      };
    });
  return (
    <div className="stack gap-24">
      <div className="field">
        <label className="label" htmlFor="reset-refl">If you could reset this week and do it again, what would you change?</label>
        <textarea id="reset-refl" className="textarea" value={r.resetReflection} onChange={(e) => setR("resetReflection", e.target.value)} placeholder="I'd…" />
      </div>

      <div>
        <div className="section-head" style={{ marginBottom: 12 }}>
          <h2 className="h3" style={{ fontSize: 24 }}>Top 3 for next week</h2>
          <span className="mono small faint">{p.priorities.length} / 3</span>
        </div>
        <div className="stack gap-12">
          {p.priorities.map((pr, i) => (
            <Entry key={i} label={pr.title || "priority"} onRemove={() => dropPriority(i)}>
              <div className="row gap-8">
                <span className="num accent-text" style={{ fontSize: 28 }}>{i + 1}</span>
                <input className="input bare grow" aria-label={`Priority ${i + 1}`} placeholder="Priority" value={pr.title} autoFocus={!pr.title} onChange={(e) => update((prev) => ({ ...prev, priorities: patchAt(prev.priorities, i, { title: e.target.value }) }))} />
              </div>
              {pr.carriedFromCommitmentId && <span className="pill mid" style={{ width: "fit-content" }}>↻ Carried forward</span>}
              <Text id={`p-o-${i}`} label="Expected outcome" value={pr.expectedOutcome} placeholder="Done looks like…" onChange={(v) => update((prev) => ({ ...prev, priorities: patchAt(prev.priorities, i, { expectedOutcome: v }) }))} />
              <div className="chips" role="group" aria-label="Priority level">
                {(Object.keys(PRIORITY_LEVELS) as (keyof typeof PRIORITY_LEVELS)[]).map((k) => (
                  <button key={k} type="button" className={`chip ${k === "p0" ? "accent" : ""}`} aria-pressed={pr.priorityLevel === k} onClick={() => update((prev) => ({ ...prev, priorities: patchAt(prev.priorities, i, { priorityLevel: k }) }))}>
                    {PRIORITY_LEVELS[k]}
                  </button>
                ))}
              </div>
              <div className="grid-2" style={{ gap: 12 }}>
                <Text id={`p-ow-${i}`} label="Owner" value={pr.owner} onChange={(v) => update((prev) => ({ ...prev, priorities: patchAt(prev.priorities, i, { owner: v }) }))} />
                <div className="field">
                  <label className="label" htmlFor={`p-dl-${i}`}>Deadline</label>
                  <input id={`p-dl-${i}`} type="date" className="input" value={pr.deadline} onChange={(e) => update((prev) => ({ ...prev, priorities: patchAt(prev.priorities, i, { deadline: e.target.value }) }))} />
                </div>
              </div>
            </Entry>
          ))}
          {p.priorities.length < 3 && <button type="button" className="add-btn" onClick={addPriority}>+ Add priority</button>}
        </div>
      </div>

      <div className="grid-3">
        {([
          ["stop", "One thing I will STOP", "🛑", context.prevStop],
          ["start", "One thing I will START", "🟢", context.prevStart],
          ["continue", "One thing I will CONTINUE", "🔁", context.prevContinue],
        ] as const).map(([k, label, ico, prev]) => (
          <div key={k} className="card tight flat">
            <label className="eyebrow" htmlFor={`ssc-${k}`}>{ico} {label}</label>
            <input id={`ssc-${k}`} className="input bare mt-8" style={{ fontSize: 18 }} value={r[k]} placeholder="…" onChange={(e) => setR(k, e.target.value)} />
            {prev && <div className="tiny faint">last week: {prev}</div>}
          </div>
        ))}
      </div>

      <div className="nn">
        <label className="eyebrow" htmlFor="nn" style={{ color: "color-mix(in oklab, var(--bg) 60%, transparent)" }}>My one non-negotiable for next week</label>
        <input id="nn" className="input bare mt-8" value={r.nonNegotiable} placeholder="No matter what, I will…" onChange={(e) => setR("nonNegotiable", e.target.value)} />
      </div>
    </div>
  );
}

/* ─────────────────────────── MY RESET (summary) ─────────────────────────── */

function SummaryStep({ p, score, categories, problems, goto }: { p: ResetPayload; score: number | null; categories: Category[]; problems: { section: string; message: string }[]; goto: (s: string) => void }) {
  const bigWin = p.wins.find((w) => w.isBiggestWin) ?? p.wins[0];
  const bigMiss = p.misses.find((m) => m.isBiggestMiss) ?? p.misses[0];
  const bigLearn = p.learnings.find((l) => l.isBiggest) ?? p.learnings[0];
  const Row = ({ k, children, section }: { k: string; children: ReactNode; section: string }) => (
    <div className="kv">
      <div className="eyebrow" style={{ paddingTop: 3 }}>{k}</div>
      <button type="button" onClick={() => goto(section)} style={{ all: "unset", cursor: "pointer", display: "block" }} title="Edit">{children}</button>
    </div>
  );
  const none = <span className="faint">— tap to add</span>;
  return (
    <div className="stack gap-24">
      {problems.length > 0 && (
        <div className="card flat" style={{ borderColor: "var(--bad)" }}>
          <div style={{ fontWeight: 700 }}>Almost there.</div>
          <ul className="stack gap-4" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {problems.map((x, i) => (
              <li key={i}><button type="button" className="hl" style={{ all: "unset", cursor: "pointer", textDecoration: "underline" }} onClick={() => goto(x.section)}>{x.message}</button></li>
            ))}
          </ul>
        </div>
      )}
      <div className="my-reset">
        <div className="row between">
          <span className="eyebrow">My reset</span>
          <span className={`score ${scoreTone(score)}`} style={{ fontSize: 40 }}>{fmtScore(score)}</span>
        </div>
        <div className="mt-16">
          <Row k="Biggest win" section="wins">{bigWin ? <b>{bigWin.title}</b> : none}</Row>
          <Row k="Biggest miss" section="misses">{bigMiss ? <b>{bigMiss.title}</b> : none}</Row>
          <Row k="Biggest learning" section="learned">{bigLearn ? bigLearn.content : none}</Row>
          <Row k="Self-rating" section="rate">
            <span className="row wrap gap-8">
              {categories.map((c) => (
                <span key={c.key} className="pill">{c.label} <b>{p.ratings[c.key] ?? "–"}</b></span>
              ))}
            </span>
          </Row>
          <Row k="Top 3" section="reset">
            {p.priorities.length ? (
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {p.priorities.map((x, i) => <li key={i}><b>{x.title}</b> <span className="faint small">{x.priorityLevel.toUpperCase()}</span></li>)}
              </ol>
            ) : none}
          </Row>
          <Row k="Stop" section="reset">{p.reflection.stop || none}</Row>
          <Row k="Start" section="reset">{p.reflection.start || none}</Row>
          <Row k="Continue" section="reset">{p.reflection.continue || none}</Row>
        </div>
        <div className="nn mt-16">
          <div className="eyebrow" style={{ color: "color-mix(in oklab, var(--bg) 60%, transparent)" }}>Non-negotiable</div>
          <div className="h3 mt-8" style={{ fontSize: 24 }}>{p.reflection.nonNegotiable || <span style={{ opacity: 0.5 }}>Not set yet</span>}</div>
        </div>
      </div>
      <p className="display" style={{ fontSize: 40, textAlign: "center", margin: "16px 0 0" }}>I&apos;m reset.</p>
    </div>
  );
}
