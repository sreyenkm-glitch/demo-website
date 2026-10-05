"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reopenResetAction } from "@/app/actions/reset";

export function ReopenButton({ resetId }: { resetId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button
        className="btn sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await reopenResetAction(resetId);
          if (!res.ok) { setErr(res.error ?? "Couldn't reopen."); setBusy(false); return; }
          router.push(`/reset/${resetId}`);
        }}
      >
        ✎ Edit reset
      </button>
      {err && <span className="err">{err}</span>}
    </>
  );
}
