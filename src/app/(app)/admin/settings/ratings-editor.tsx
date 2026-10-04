"use client";

import { useState, useTransition } from "react";
import { type ActionState, saveRatingCategories } from "@/app/actions/admin";

type Cat = { key: string; label: string; description: string; weight: number; inverted: boolean; lowLabel: string; highLabel: string; active: boolean };

export function RatingsEditor({ initial }: { initial: Cat[] }) {
  const [cats, setCats] = useState(initial);
  const [res, setRes] = useState<ActionState | null>(null);
  const [pending, start] = useTransition();
  const totalWeight = cats.filter((c) => c.active).reduce((a, c) => a + c.weight, 0) || 1;
  const set = (i: number, patch: Partial<Cat>) => setCats((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, d: number) => setCats((cs) => { const n = [...cs]; const [x] = n.splice(i, 1); n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x); return n; });
  return (
    <div className="stack gap-12">
      {cats.map((c, i) => (
        <div key={i} className="entry" style={{ opacity: c.active ? 1 : 0.5 }}>
          <div className="row gap-8 wrap">
            <input className="input bare grow" style={{ minWidth: 140 }} value={c.label} aria-label="Label" onChange={(e) => set(i, { label: e.target.value })} />
            <span className="mono tiny faint">{c.key}</span>
            <button type="button" className="btn sm ghost" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className="btn sm ghost" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
          </div>
          <input className="input mt-8" value={c.description} aria-label="Description" onChange={(e) => set(i, { description: e.target.value })} />
          <div className="row gap-16 wrap mt-8">
            <label className="row gap-8 small" style={{ flex: "1 1 220px" }}>
              Weight
              <input type="range" className="range" min={0} max={3} step={0.25} value={c.weight} style={{ ["--fill" as string]: `${(c.weight / 3) * 100}%` }} onChange={(e) => set(i, { weight: Number(e.target.value) })} />
              <span className="mono" style={{ width: 90 }}>{c.weight.toFixed(2)} · {c.active ? Math.round((c.weight / totalWeight) * 100) : 0}%</span>
            </label>
            <label className="row gap-8 small"><input type="checkbox" className="checkbox" checked={c.inverted} onChange={(e) => set(i, { inverted: e.target.checked })} /> Higher = worse</label>
            <label className="row gap-8 small"><input type="checkbox" className="checkbox" checked={c.active} onChange={(e) => set(i, { active: e.target.checked })} /> Active</label>
          </div>
          <div className="grid-2 mt-8" style={{ gap: 8 }}>
            <input className="input" value={c.lowLabel} aria-label="Low label" placeholder="Low label (1)" onChange={(e) => set(i, { lowLabel: e.target.value })} />
            <input className="input" value={c.highLabel} aria-label="High label" placeholder="High label (10)" onChange={(e) => set(i, { highLabel: e.target.value })} />
          </div>
        </div>
      ))}
      <button type="button" className="add-btn" onClick={() => setCats((cs) => [...cs, { key: `metric_${cs.length + 1}`, label: "New metric", description: "", weight: 1, inverted: false, lowLabel: "Low", highLabel: "High", active: true }])}>+ Add rating category</button>
      {res?.error && <p className="err">{res.error}</p>}
      {res?.ok && <p className="small" style={{ color: "var(--good)" }}>✓ {res.message}</p>}
      <button type="button" className="btn primary" style={{ alignSelf: "flex-start" }} disabled={pending} onClick={() => start(async () => setRes(await saveRatingCategories(cats)))}>
        {pending ? "Saving…" : "Save weights & recalc scores"}
      </button>
    </div>
  );
}
