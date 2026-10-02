"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { type ActionState, addReview } from "@/app/actions/admin";

const OPTIONS = [
  { key: "reviewed", label: "✓ Reviewed", cls: "good" },
  { key: "kudos", label: "🔥 Kudos", cls: "accent" },
  { key: "needs_attention", label: "⚑ Needs attention", cls: "bad" },
  { key: "comment", label: "💬 Just comment", cls: "" },
] as const;

export function ReviewForm({ resetId, submitted }: { resetId: string; submitted: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addReview, {});
  const [kind, setKind] = useState<string>(submitted ? "reviewed" : "comment");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="stack gap-12">
      <input type="hidden" name="resetId" value={resetId} />
      <input type="hidden" name="reviewStatus" value={kind} />
      <div className="chips" role="group" aria-label="Review type">
        {OPTIONS.filter((o) => submitted || o.key === "comment").map((o) => (
          <button key={o.key} type="button" className={`chip ${o.cls}`} aria-pressed={kind === o.key} onClick={() => setKind(o.key)}>{o.label}</button>
        ))}
      </div>
      <textarea name="comment" className="textarea" placeholder={kind === "kudos" ? "What made this great?" : kind === "needs_attention" ? "What should we talk about? Keep it human." : "Your note (optional when marking reviewed)"} aria-label="Comment" />
      {state.error && <p className="err">{state.error}</p>}
      {state.ok && <p className="small" style={{ color: "var(--good)", margin: 0 }}>✓ {state.message}</p>}
      <button className="btn primary" disabled={pending}>{pending ? "Sending…" : kind === "comment" ? "Send comment" : "Lock in review →"}</button>
    </form>
  );
}
