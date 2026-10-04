export default function Loading() {
  return (
    <main className="container page" aria-busy="true">
      <div className="stack gap-16">
        <div style={{ height: 14, width: 120, borderRadius: 8, background: "var(--surface-2)" }} />
        <div style={{ height: 72, width: "60%", borderRadius: 16, background: "var(--surface-2)", animation: "pulse 1.4s infinite" }} />
        <div className="grid-4 mt-24">{[0, 1, 2, 3].map((i) => <div key={i} className="card" style={{ height: 120 }} />)}</div>
      </div>
    </main>
  );
}
