"use client";

import { useTransition } from "react";
import { setThemePref } from "@/app/actions/auth";

export function ThemeToggle() {
  const [, start] = useTransition();
  function set(mode: "light" | "dark" | "system") {
    document.documentElement.dataset.theme = mode;
    start(() => setThemePref(mode));
  }
  return (
    <div className="row gap-4" style={{ padding: "6px 8px" }} role="group" aria-label="Theme">
      {(["light", "dark", "system"] as const).map((m) => (
        <button key={m} type="button" className="chip" style={{ minHeight: 32, padding: "0 10px", fontSize: 12 }} onClick={() => set(m)}>
          {m === "light" ? "☀︎ Light" : m === "dark" ? "☾ Dark" : "Auto"}
        </button>
      ))}
    </div>
  );
}
