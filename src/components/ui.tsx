import Link from "next/link";
import type { ReactNode } from "react";
import { RESET_STATUS } from "@/lib/reset-types";
import { fmtScore, scoreTone } from "@/lib/scoring";

export function Avatar({ emoji, name, size }: { emoji?: string | null; name: string; size?: "sm" | "lg" }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <span className={`avatar ${size ?? ""}`} aria-hidden title={name}>
      {emoji || <span style={{ fontSize: "0.6em", fontWeight: 700 }}>{initials}</span>}
    </span>
  );
}

export function StatusPill({ status }: { status: keyof typeof RESET_STATUS }) {
  const s = RESET_STATUS[status];
  return (
    <span className={`pill ${s.tone}`}>
      <span className="dot" />
      {s.label}
    </span>
  );
}

export function ReviewFlag({ flag }: { flag: "reviewed" | "needs_attention" | "kudos" | "comment" | null }) {
  if (!flag || flag === "comment") return null;
  if (flag === "kudos") return <span className="pill accent">🔥 Kudos</span>;
  if (flag === "needs_attention") return <span className="pill bad">⚑ Needs attention</span>;
  return <span className="pill good">✓ Reviewed</span>;
}

export function Score({ value, size = 22, suffix = false }: { value: number | null | undefined; size?: number; suffix?: boolean }) {
  return (
    <span className={`score ${scoreTone(value)}`} style={{ fontSize: size }}>
      {fmtScore(value)}
      {suffix && value != null && <span className="faint" style={{ fontSize: size * 0.45, fontWeight: 600 }}>/10</span>}
    </span>
  );
}

export function Delta({ from, to, digits = 1 }: { from: number | null | undefined; to: number | null | undefined; digits?: number }) {
  if (from == null || to == null) return <span className="delta flat">—</span>;
  const d = Math.round((to - from) * 10 ** digits) / 10 ** digits;
  if (d === 0) return <span className="delta flat">= 0</span>;
  return <span className={`delta ${d > 0 ? "up" : "down"}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d).toFixed(digits)}</span>;
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{title}</div>
      {body && <p className="muted mt-8" style={{ margin: "8px auto 0", maxWidth: 380 }}>{body}</p>}
      {action && <div className="mt-24">{action}</div>}
    </div>
  );
}

export function Ring({ pct, size = 120, children }: { pct: number; size?: number; children: ReactNode }) {
  return (
    <div className="ring" style={{ ["--p" as string]: Math.round(pct * 100), ["--size" as string]: `${size}px` }} role="img" aria-label={`${Math.round(pct * 100)}% complete`}>
      <div style={{ textAlign: "center" }}>{children}</div>
    </div>
  );
}

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="row between wrap gap-16 rise" style={{ alignItems: "flex-end" }}>
      <div className="stack gap-8" style={{ minWidth: 0 }}>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="h2">{title}</h1>
        {sub && <p className="muted" style={{ margin: 0 }}>{sub}</p>}
      </div>
      {actions && <div className="row gap-8 wrap">{actions}</div>}
    </header>
  );
}

export function Meter({ value, max = 10 }: { value: number; max?: number }) {
  return (
    <div className="meter" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <span style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="small muted row gap-8" style={{ marginBottom: 20, width: "fit-content" }}>
      ← {children}
    </Link>
  );
}
