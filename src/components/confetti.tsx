"use client";

import { useEffect, useState } from "react";

const COLORS = ["var(--accent)", "var(--ink)", "#ff6b4a", "#9b7bff", "#3de0ff"];

/** Short, tasteful burst. Respects reduced motion (CSS disables the animation). */
export function Confetti() {
  const [pieces, setPieces] = useState<{ left: number; delay: number; color: string; rot: number; w: number }[]>([]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPieces(Array.from({ length: 42 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 0.5, color: COLORS[i % COLORS.length], rot: Math.random() * 360, w: 6 + Math.random() * 6 })));
    const t = window.setTimeout(() => setPieces([]), 2600);
    return () => window.clearTimeout(t);
  }, []);
  if (!pieces.length) return null;
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i key={i} style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, transform: `rotate(${p.rot}deg)`, width: p.w }} />
      ))}
    </div>
  );
}
