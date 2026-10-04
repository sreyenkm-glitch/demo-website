"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateWeekDeadline } from "@/app/actions/admin";

export function DeadlineEditor({ weekId, deadline }: { weekId: string; deadline: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(() => {
    const d = new Date(deadline);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [pending, start] = useTransition();
  if (!open) return <button type="button" className="btn sm ghost" onClick={() => setOpen(true)}>✎ Deadline</button>;
  return (
    <span className="row gap-8">
      <input type="datetime-local" className="input" style={{ minHeight: 36, padding: "4px 8px", width: "auto" }} value={val} onChange={(e) => setVal(e.target.value)} aria-label="New deadline" />
      <button type="button" className="btn sm primary" disabled={pending} onClick={() => start(async () => { await updateWeekDeadline(weekId, new Date(val).toISOString()); setOpen(false); router.refresh(); })}>Save</button>
    </span>
  );
}
