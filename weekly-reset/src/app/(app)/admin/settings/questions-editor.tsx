"use client";

import { useState, useTransition } from "react";
import { type ActionState, applyQuestionsToWeek, saveQuestions } from "@/app/actions/admin";
import type { QuestionSet, SectionKey } from "@/lib/settings";

const LABELS: Record<SectionKey, string> = { week: "01 The Week", wins: "02 Wins", misses: "03 Misses", learned: "04 Learned", rate: "05 Rate", own: "06 Own It", reset: "07 Reset" };

export function QuestionsEditor({ initial, openWeek }: { initial: QuestionSet; openWeek: { id: string; number: number } | null }) {
  const [q, setQ] = useState(initial);
  const [res, setRes] = useState<ActionState | null>(null);
  const [pending, start] = useTransition();
  const sections = Object.keys(LABELS) as SectionKey[];
  return (
    <div className="stack gap-12">
      {sections.map((s) => (
        <div key={s} className="field">
          <label className="label" htmlFor={`q-${s}`}>{LABELS[s]} — prompt</label>
          <input id={`q-${s}`} className="input" value={q.prompts[s]} onChange={(e) => setQ({ ...q, prompts: { ...q.prompts, [s]: e.target.value } })} />
        </div>
      ))}
      <div className="eyebrow mt-16">Extra questions</div>
      {q.custom.length === 0 && <p className="small muted" style={{ margin: 0 }}>None yet. Add a question to any section — answers show up in every reset view.</p>}
      {q.custom.map((c, i) => (
        <div key={c.id} className="entry row gap-8 wrap">
          <select className="select" style={{ width: "auto" }} value={c.section} aria-label="Section" onChange={(e) => setQ({ ...q, custom: q.custom.map((x, j) => (j === i ? { ...x, section: e.target.value as SectionKey } : x)) })}>
            {sections.map((s) => <option key={s} value={s}>{LABELS[s]}</option>)}
          </select>
          <input className="input grow" style={{ minWidth: 200 }} value={c.prompt} aria-label="Question" placeholder="Your question" onChange={(e) => setQ({ ...q, custom: q.custom.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)) })} />
          <button type="button" className="btn sm ghost" aria-label="Remove question" onClick={() => setQ({ ...q, custom: q.custom.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button type="button" className="add-btn" onClick={() => setQ({ ...q, custom: [...q.custom, { id: `q${Date.now().toString(36)}`, section: "reset", prompt: "" }] })}>+ Add a question</button>
      {res?.error && <p className="err">{res.error}</p>}
      {res?.ok && <p className="small" style={{ color: "var(--good)" }}>✓ {res.message}</p>}
      <div className="row gap-8 wrap">
        <button type="button" className="btn primary" disabled={pending} onClick={() => start(async () => setRes(await saveQuestions(q)))}>{pending ? "Saving…" : "Save questions"}</button>
        {openWeek && (
          <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { const r = await saveQuestions(q); setRes(r.error ? r : await applyQuestionsToWeek(openWeek.id)); })}>
            Save &amp; apply to W{openWeek.number}
          </button>
        )}
      </div>
    </div>
  );
}
