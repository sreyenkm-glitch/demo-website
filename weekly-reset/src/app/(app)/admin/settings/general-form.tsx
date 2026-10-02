"use client";

import { useActionState } from "react";
import { type ActionState, saveBrandAndSchedule } from "@/app/actions/admin";
import type { AppSettings } from "@/lib/settings";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function GeneralForm({ s, accents }: { s: AppSettings; accents: { key: string; label: string; value: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveBrandAndSchedule, {});
  return (
    <form action={action} className="stack gap-24">
      <fieldset className="card stack gap-12" style={{ margin: 0 }}>
        <legend className="eyebrow" style={{ padding: "0 6px" }}>Brand</legend>
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field"><label className="label" htmlFor="bn">Product name</label><input id="bn" name="brandName" className="input" defaultValue={s.brand.name} required /></div>
          <div className="field"><label className="label" htmlFor="sn">Short name (nav)</label><input id="sn" name="shortName" className="input" defaultValue={s.brand.shortName} required /></div>
        </div>
        <div className="field"><label className="label" htmlFor="tl">Tagline</label><input id="tl" name="tagline" className="input" defaultValue={s.brand.tagline} /></div>
      </fieldset>

      <fieldset className="card stack gap-12" style={{ margin: 0 }}>
        <legend className="eyebrow" style={{ padding: "0 6px" }}>Rhythm</legend>
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field">
            <label className="label" htmlFor="wsd">Week starts on</label>
            <select id="wsd" name="weekStartDay" className="select" defaultValue={s.schedule.weekStartDay}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
          </div>
          <div className="field">
            <label className="label" htmlFor="tz">Timezone</label>
            <input id="tz" name="timezone" className="input" defaultValue={s.schedule.timezone} placeholder="e.g. Asia/Kolkata" />
          </div>
          <div className="field">
            <label className="label" htmlFor="dod">Default deadline (days after start)</label>
            <input id="dod" name="deadlineOffsetDays" type="number" min={0} max={13} className="input" defaultValue={s.schedule.deadlineOffsetDays} />
          </div>
          <div className="field">
            <label className="label" htmlFor="dt">Deadline time</label>
            <input id="dt" name="deadlineTime" type="time" className="input" defaultValue={s.schedule.deadlineTime} />
          </div>
        </div>
      </fieldset>

      <fieldset className="card stack gap-12" style={{ margin: 0 }}>
        <legend className="eyebrow" style={{ padding: "0 6px" }}>Theme</legend>
        <div className="chips" role="radiogroup" aria-label="Accent">
          {accents.map((a) => (
            <label key={a.key} className="chip" style={{ gap: 8 }}>
              <input type="radio" name="accent" value={a.key} defaultChecked={s.theme.accent === a.key} />
              <span style={{ width: 16, height: 16, borderRadius: 99, background: a.value, display: "inline-block" }} />
              {a.label}
            </label>
          ))}
        </div>
        <div className="field">
          <label className="label" htmlFor="mode">Default mode</label>
          <select id="mode" name="mode" className="select" defaultValue={s.theme.mode}>
            <option value="dark">Dark</option><option value="light">Light</option><option value="system">Follow device</option>
          </select>
        </div>
      </fieldset>

      <fieldset className="card stack gap-12" style={{ margin: 0 }}>
        <legend className="eyebrow" style={{ padding: "0 6px" }}>Departments</legend>
        <textarea name="departments" className="textarea" defaultValue={s.departments.join("\n")} rows={5} aria-label="Departments, one per line" />
        <span className="tiny faint">One per line.</span>
      </fieldset>

      {state.error && <p className="err" role="alert">{state.error}</p>}
      {state.ok && <p className="small" style={{ color: "var(--good)" }}>✓ {state.message}</p>}
      <button className="btn primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Saving…" : "Save this"}</button>
    </form>
  );
}
