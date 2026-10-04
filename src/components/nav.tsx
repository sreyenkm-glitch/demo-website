"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; ico: string; match?: (p: string) => boolean };

const member: Item[] = [
  { href: "/", label: "Home", ico: "🏠", match: (p) => p === "/" },
  { href: "/reset", label: "My reset", ico: "↻", match: (p) => p.startsWith("/reset") },
  { href: "/history", label: "History", ico: "📈", match: (p) => p.startsWith("/history") },
  { href: "/compare", label: "Compare", ico: "⇄", match: (p) => p.startsWith("/compare") },
];
const admin: Item[] = [
  { href: "/admin", label: "Team", ico: "👥", match: (p) => p === "/admin" || p.startsWith("/admin/resets") || p.startsWith("/admin/people") },
  { href: "/admin/insights", label: "Insights", ico: "✨" },
  { href: "/admin/weeks", label: "Weeks", ico: "🗓️" },
  { href: "/admin/search", label: "Search", ico: "🔎" },
];

const isActive = (i: Item, p: string) => (i.match ? i.match(p) : p.startsWith(i.href));

export function TopNav({ isAdmin }: { isAdmin: boolean }) {
  const p = usePathname();
  return (
    <nav className="topnav" aria-label="Main">
      {member.map((i) => (
        <Link key={i.href} href={i.href} aria-current={isActive(i, p) ? "page" : undefined}>{i.label}</Link>
      ))}
      {isAdmin && <span className="sep" aria-hidden />}
      {isAdmin && admin.map((i) => (
        <Link key={i.href} href={i.href} aria-current={isActive(i, p) ? "page" : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const p = usePathname();
  if (/^\/reset\/[^/]+$/.test(p) || p === "/reset") return null; // the wizard owns the bottom of the screen
  const items = isAdmin ? [member[0], member[1], admin[0], admin[1], member[2]] : member;
  return (
    <nav className="bottomnav" aria-label="Main">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={isActive(i, p) ? "page" : undefined}>
          <span className="ico" aria-hidden>{i.ico}</span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
