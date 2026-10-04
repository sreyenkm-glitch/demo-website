import Link from "next/link";
import { setMemberActive } from "@/app/actions/admin";
import { ActionButton } from "@/components/action-button";
import { Avatar, PageHead } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { MemberSheet } from "./member-sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team members" };

export default async function TeamPage() {
  const me = await requireAdmin();
  const [users, settings] = await Promise.all([db.query.users.findMany({ orderBy: schema.users.name }), getSettings()]);
  const active = users.filter((u) => u.active);
  const inactive = users.filter((u) => !u.active);
  const row = (u: (typeof users)[number]) => (
    <div key={u.id} className="card tight row gap-16 wrap" style={{ opacity: u.active ? 1 : 0.55 }}>
      <Avatar emoji={u.avatar} name={u.name} />
      <div className="grow" style={{ minWidth: 160 }}>
        <div className="row gap-8"><b>{u.name}</b>{u.role === "admin" && <span className="pill accent">Admin</span>}</div>
        <div className="small muted">{u.title ?? "—"} · {u.department ?? "No team"} · <span className="mono tiny">{u.email}</span></div>
      </div>
      <div className="row gap-8">
        <Link href={`/admin/people/${u.id}`} className="btn sm ghost">History</Link>
        <MemberSheet member={{ id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, department: u.department, avatar: u.avatar }} departments={settings.departments} trigger={<button className="btn sm">Edit</button>} />
        {u.id !== me.id && (
          u.active
            ? <ActionButton action={setMemberActive.bind(null, u.id, false)} confirm={`Deactivate ${u.name}? They can't sign in, but history stays.`} className="btn sm ghost danger">Deactivate</ActionButton>
            : <ActionButton action={setMemberActive.bind(null, u.id, true)} className="btn sm ghost">Reactivate</ActionButton>
        )}
      </div>
    </div>
  );
  return (
    <main className="container page">
      <PageHead
        eyebrow={`Team · ${active.length} active`}
        title="The people who reset"
        actions={<MemberSheet departments={settings.departments} trigger={<button className="btn primary">+ Add member</button>} />}
      />
      <div className="stack gap-8 mt-32">{active.map(row)}</div>
      {inactive.length > 0 && (
        <>
          <h2 className="h3 mt-48" style={{ marginBottom: 12 }}>Inactive</h2>
          <div className="stack gap-8">{inactive.map(row)}</div>
        </>
      )}
    </main>
  );
}
