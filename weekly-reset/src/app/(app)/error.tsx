"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="container narrow page">
      <div className="empty">
        <div className="big">Something glitched.</div>
        <p className="muted">{error.message || "Unexpected error."} Your saved answers are safe.</p>
        <button className="btn primary mt-16" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
