"use client";

import { useActionState, useMemo, useState } from "react";
import { type ActionState, createWeek } from "@/app/actions/admin";

type Member = { id: string; name: string; department: string | null; avatar: string | null };

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function NewWeekForm({ defaults, members, carry }: { defaults: { weekNumber: number; year: number; startDate: string; endDate: string; deadline: string }; members: Member[]; carry: { prevWeek: number | null; commitments: number; openLoops: number } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createWeek, {});
  const [deadlineLocal, setDeadlineLocal] = useState(() => toLocalInput(defaults.deadline));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(members.map((m) => m.id)));
  const deadlineIso = useMemo(() => {
    const d = new Date(deadlineLocal);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }, [deadlineLocal]);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <form action={action} className="stack gap-16">
      <div className="grid-2" style={{ gap: 12 }}>
        <div className="field"><label className="label" htmlFor="wn">Week number</label><input id="wn" name="weekNumber" type="number" min={1} max={53} className="input" defaultValue={defaults.weekNumber} required /></div>
        <div className="field"><label className="label" htmlFor="yr">Year</label><input id="yr" name="year" type="number" className="input" defaultValue={defaults.year} required /></div>
        <div className="field"><label className="label" htmlFor="sd">Start date</label><input id="sd" name="startDate" type="date" className="input" defaultValue={defaults.startDate} required /></div>
        <div className="field"><label className="label" htmlFor="ed">End date</label><input id="ed" name="endDate" type="date" className="input" defaultValue={defaults.endDate} required /></div>
      </div>
      <div className="field">
        <label className="label" htmlFor="dl">Submission deadline <span className="faint">(your local time)</span></label>
        <input id="dl" type="datetime-local" className="input" value={deadlineLocal} onChange={(e) => setDeadlineLocal(e.target.value)} required />
        <input type="hidden" name="deadline" value={deadlineIso} />
      </div>
      <div className="field">
        <span className="label">Team members included · {selected.size}</span>
        <div className="chips">
          {members.map((m) => (
            <label key={m.id} className={`chip ${selected.has(m.id) ? "on" : ""}`}>
              <input type="checkbox" name="memberIds" value={m.id} checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="sr-only" />
              {m.avatar} {m.name}
            </label>
          ))}
        </div>
      </div>
      <label className="row gap-12" style={{ cursor: "pointer" }}>
        <input type="checkbox" name="lockPrevious" className="checkbox" />
        <span>Lock {carry.prevWeek ? `week ${carry.prevWeek}` : "the previous week"} now <span className="faint small">(late submissions stop)</span></span>
      </label>
      <div className="panel small">
        <b>↻ Carry forward:</b> {carry.commitments} priorities &amp; non-negotiables from last week become commitments to review
        {carry.openLoops > 0 && <> · <span style={{ color: "var(--bad)" }}>{carry.openLoops} open loops</span> carried 2+ weeks</>}. Questions use your current settings.
      </div>
      {state.error && <p className="err" role="alert">{state.error}</p>}
      <button className="btn primary lg" disabled={pending || !deadlineIso || selected.size === 0}>{pending ? "Starting…" : <>START NEW RESET <span className="arrow">→</span></>}</button>
    </form>
  );
}
