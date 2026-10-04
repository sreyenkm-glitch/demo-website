import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { markNotificationsRead } from "@/app/actions/notifications";
import { Avatar } from "@/components/ui";
import { BottomNav, TopNav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/dates";
import { getSettings } from "@/lib/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();
  const notes = await db.query.notifications.findMany({
    where: eq(schema.notifications.userId, user.id),
    orderBy: desc(schema.notifications.createdAt),
    limit: 6,
  });
  const unread = await db.$count(schema.notifications, and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  const isAdmin = user.role === "admin";
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link href="/" className="brand" aria-label={`${settings.brand.name} home`}>
            <span className="brand-mark">↻</span>
            <span>{settings.brand.shortName}<span className="faint hide-mobile" style={{ fontWeight: 600 }}> · reset</span></span>
          </Link>
          <TopNav isAdmin={isAdmin} />
          <div className="grow" />
          <details className="menu">
            <summary className="btn icon ghost" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`} style={{ position: "relative" }}>
              🔔
              {unread > 0 && <span style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 99, background: "var(--accent)", boxShadow: "0 0 0 2px var(--bg)" }} />}
            </summary>
            <div className="menu-pop" style={{ width: 320 }}>
              <div className="row between" style={{ padding: "6px 12px" }}>
                <span className="eyebrow">Inbox</span>
                {unread > 0 && (
                  <form action={markNotificationsRead}>
                    <button className="tiny muted" style={{ padding: 0, width: "auto" }}>Mark all read</button>
                  </form>
                )}
              </div>
              {notes.length === 0 && <p className="small muted" style={{ padding: "8px 12px" }}>Quiet week. Nothing to see. 🤫</p>}
              {notes.map((n) => (
                <Link key={n.id} href={n.href ?? "/"} style={{ alignItems: "flex-start", opacity: n.readAt ? 0.6 : 1 }}>
                  <span>{n.kind === "review" ? "💬" : n.kind === "nudge" ? "👀" : n.kind === "reminder" ? "⏰" : "↻"}</span>
                  <span className="stack">
                    <span style={{ fontWeight: 600 }}>{n.title}</span>
                    {n.body && <span className="tiny muted clamp2">{n.body}</span>}
                    <span className="tiny faint">{timeAgo(n.createdAt)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </details>
          <details className="menu">
            <summary aria-label="Account menu" className="row gap-8" style={{ cursor: "pointer" }}>
              <Avatar emoji={user.avatar} name={user.name} size="sm" />
            </summary>
            <div className="menu-pop">
              <div style={{ padding: "8px 12px" }}>
                <div style={{ fontWeight: 700 }}>{user.name}</div>
                <div className="tiny muted">{user.title ?? user.department} · {isAdmin ? "Admin" : "Team"}</div>
              </div>
              <hr className="divider" style={{ margin: "6px 0" }} />
              <Link href="/history">📈 My history</Link>
              {isAdmin && <Link href="/admin/team">👥 Team members</Link>}
              {isAdmin && <Link href="/admin/settings">⚙️ Settings</Link>}
              {isAdmin && <Link href="/admin/search">🔎 Search</Link>}
              <ThemeToggle />
              <hr className="divider" style={{ margin: "6px 0" }} />
              <form action={logout}>
                <button type="submit">↩ Sign out</button>
              </form>
            </div>
          </details>
        </div>
      </header>
      {children}
      <BottomNav isAdmin={isAdmin} />
    </>
  );
}
