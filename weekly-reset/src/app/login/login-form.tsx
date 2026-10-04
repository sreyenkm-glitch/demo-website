"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="stack gap-16" style={{ maxWidth: 440 }}>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" defaultValue={state.email} placeholder="you@obsa.team" />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" placeholder="••••••••" />
      </div>
      {state.error && <p className="err" role="alert">{state.error}</p>}
      <button className="btn primary lg block" disabled={pending}>
        {pending ? "Checking…" : <>Start the reset <span className="arrow">→</span></>}
      </button>
    </form>
  );
}
