import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container narrow" style={{ minHeight: "80dvh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div className="display" style={{ fontSize: 120 }}>404<span className="accent-text">.</span></div>
      <p className="muted" style={{ fontSize: 18 }}>This page didn&apos;t make it into the reset.</p>
      <div><Link href="/" className="btn primary mt-16">Back home →</Link></div>
    </main>
  );
}
