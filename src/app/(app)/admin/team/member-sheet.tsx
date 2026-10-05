"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { type ActionState, saveMember } from "@/app/actions/admin";

export type MemberRow = { id: string; name: string; email: string; role: "admin" | "member"; title: string | null; department: string | null; avatar: string | null };

const EMOJI = ["🚀", "🎨", "⚡", "✍️", "🛠️", "🌀", "🤝", "🦄", "🔥", "🧠", "🌱", "🎯", "🐙", "🪐"];

export function MemberSheet({ member, departments, trigger }: { member?: MemberRow; departments: string[]; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(saveMember, {});
  const [avatar, setAvatar] = useState(member?.avatar ?? "🌱");
  useEffect(() => {
    if (state.ok) { setOpen(false); router.refresh(); }
  }, [state, router]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <>
          <div className="sheet-backdrop" onClick={() => setOpen(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label={member ? `Edit ${member.name}` : "Add team member"}>
            <div className="grabber" />
            <h2 className="h3" style={{ fontSize: 24 }}>{member ? `Edit ${member.name.split(" ")[0]}` : "Add to the team"}</h2>
            <form action={action} className="stack gap-12 mt-16">
              {member && <input type="hidden" name="id" value={member.id} />}
              <input type="hidden" name="avatar" value={avatar} />
              <div className="quick" aria-label="Avatar">
                {EMOJI.map((e) => (
                  <button key={e} type="button" className="star" aria-pressed={avatar === e} onClick={() => setAvatar(e)}>{e}</button>
                ))}
              </div>
              <div className="field"><label className="label" htmlFor="m-name">Name</label><input id="m-name" name="name" className="input" defaultValue={member?.name} required /></div>
              <div className="field"><label className="label" htmlFor="m-email">Email</label><input id="m-email" name="email" type="email" className="input" defaultValue={member?.email} required /></div>
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="field"><label className="label" htmlFor="m-title">Title</label><input id="m-title" name="title" className="input" defaultValue={member?.title ?? ""} /></div>
                <div className="field">
                  <label className="label" htmlFor="m-dept">Department</label>
                  <select id="m-dept" name="department" className="select" defaultValue={member?.department ?? ""}>
                    <option value="">—</option>
                    {departments.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="m-role">Role</label>
                <select id="m-role" name="role" className="select" defaultValue={member?.role ?? "member"}>
                  <option value="member">Team member</option>
                  <option value="admin">Admin / CEO</option>
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="m-pw">{member ? "New password (leave blank to keep)" : "Starting password"}</label>
                <input id="m-pw" name="password" type="password" className="input" autoComplete="new-password" minLength={member ? undefined : 8} placeholder="8+ characters" />
              </div>
              {state.error && <p className="err" role="alert">{state.error}</p>}
              <div className="row gap-8 mt-8">
                <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
                <div className="grow" />
                <button className="btn primary" disabled={pending}>{pending ? "Saving…" : member ? "Save this" : "Add them →"}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
