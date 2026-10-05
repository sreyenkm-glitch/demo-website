import { redirect } from "next/navigation";
import { isEphemeralDemo } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  const s = await getSettings();
  const showDemo = process.env.HIDE_DEMO_LOGINS !== "1";
  return (
    <main className="container narrow" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: 48, paddingBottom: 48 }}>
      <div className="rise">
        <div className="brand" style={{ marginBottom: 40 }}>
          <span className="brand-mark">↻</span> {s.brand.shortName}
        </div>
        <p className="eyebrow">It&apos;s reset day</p>
        <h1 className="h1 mt-8">
          {s.brand.name.replace(/^OBSA\s*/i, "") || s.brand.name}
          <span className="accent-text">.</span>
        </h1>
        <p className="muted mt-16" style={{ fontSize: 18, maxWidth: 440 }}>{s.brand.tagline}</p>
      </div>
      <div className="rise-2 mt-48">
        <LoginForm next={next ?? "/"} />
      </div>
      {isEphemeralDemo() && (
        <div className="rise-3 card flat mt-32 small" style={{ borderColor: "var(--bad)" }} role="note">
          <b>No database connected.</b> This deployment keeps data on each server separately, so you&apos;ll be signed out
          between pages and changes won&apos;t stick. Connect a Turso database in Vercel (Storage → Turso) and redeploy.
        </div>
      )}
      {showDemo && (
        <div className="rise-3 panel mt-32 small">
          <div className="eyebrow">Demo logins · password <span className="mono">reset-day</span></div>
          <div className="mt-8 muted">
            Admin/CEO: <span className="mono">rhea@obsa.team</span>
            <br />
            Team: <span className="mono">kabir@obsa.team</span>, <span className="mono">maya@obsa.team</span> (hasn&apos;t started), <span className="mono">dev@obsa.team</span>
          </div>
        </div>
      )}
    </main>
  );
}
