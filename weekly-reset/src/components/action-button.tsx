"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import type { ActionState } from "@/app/actions/admin";

/** Button that runs a bound server action, confirms if asked, and shows the outcome as a toast. */
export function ActionButton({ action, children, confirm, className = "btn sm" }: { action: () => Promise<ActionState>; children: ReactNode; confirm?: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<ActionState | null>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const res = await action();
            setToast(res);
            router.refresh();
            window.setTimeout(() => setToast(null), 2800);
          });
        }}
      >
        {pending ? "…" : children}
      </button>
      {toast && (toast.message || toast.error) && <div className={`toast ${toast.error ? "bad" : ""}`} role="status">{toast.error ?? toast.message}</div>}
    </>
  );
}
