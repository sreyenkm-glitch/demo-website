"use client";

import { useId, useRef, useState } from "react";

export type Point = { label: string; value: number | null; hint?: string };

/**
 * Single-series line chart with crosshair tooltip. One series per chart by design —
 * multiple metrics are shown as small multiples, never on a shared/dual axis.
 */
export function LineChart({
  points,
  min = 0,
  max = 10,
  height = 180,
  unit = "score",
  ariaLabel,
  ticks = [0, 5, 10],
  compact = false,
}: {
  points: Point[];
  min?: number;
  max?: number;
  height?: number;
  /** Serializable formatting (functions can't cross the server→client boundary). */
  unit?: "score" | "percent" | "int";
  ariaLabel: string;
  ticks?: number[];
  compact?: boolean;
}) {
  const format = (v: number) => (unit === "percent" ? `${Math.round(v)}%` : unit === "int" ? String(Math.round(v)) : v.toFixed(1));
  const W = 600;
  const H = height;
  const pad = compact ? { l: 4, r: 4, t: 10, b: 6 } : { l: 28, r: 12, t: 14, b: 26 };
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const gid = useId().replace(/:/g, "");
  const n = points.length;
  const x = (i: number) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (H - pad.t - pad.b);

  // Break the line at gaps (weeks without data).
  const segments: string[] = [];
  let cur = "";
  points.forEach((p, i) => {
    if (p.value == null) {
      if (cur) segments.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  if (cur) segments.push(cur);
  const valid = points.map((p, i) => ({ ...p, i })).filter((p) => p.value != null) as (Point & { i: number; value: number })[];
  const area =
    valid.length > 1
      ? `M${x(valid[0].i)},${y(valid[0].value)} ` + valid.slice(1).map((p) => `L${x(p.i)},${y(p.value)}`).join(" ") + ` L${x(valid[valid.length - 1].i)},${H - pad.b} L${x(valid[0].i)},${H - pad.b} Z`
      : "";
  const last = valid[valid.length - 1];

  function onMove(e: React.PointerEvent) {
    const svg = ref.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - px);
      if (d < bd) { bd = d; best = i; }
    }
    setHover(best);
  }

  const hp = hover != null ? points[hover] : null;
  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        preserveAspectRatio="none"
        style={{ height: compact ? height * 0.5 : undefined, touchAction: "pan-y" }}
      >
        <defs>
          <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {!compact && (
          <g className="grid">
            {ticks.map((t) => (
              <line key={t} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        )}
        {area && <path d={area} fill={`url(#g${gid})`} />}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--ink-3)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        {/* invisible wide hit area */}
        <rect x={0} y={0} width={W} height={H} fill="transparent" />
      </svg>
      {/* Markers in HTML so they stay round despite preserveAspectRatio=none */}
      {valid.map((p) => (
        <span
          key={p.i}
          aria-hidden
          style={{
            position: "absolute",
            left: `${(x(p.i) / W) * 100}%`,
            top: compact ? `${(y(p.value) / H) * 100}%` : `${(y(p.value) / H) * 100}%`,
            width: hover === p.i || p === last ? 11 : 7,
            height: hover === p.i || p === last ? 11 : 7,
            borderRadius: 99,
            background: p === last ? "var(--accent)" : "var(--surface)",
            border: "2px solid var(--accent)",
            transform: "translate(-50%,-50%)",
            boxShadow: "0 0 0 2px var(--surface)",
            pointerEvents: "none",
            transition: "width .15s, height .15s",
          }}
        />
      ))}
      {!compact && (
        <>
          {ticks.map((t) => (
            <span key={t} className="mono faint" style={{ position: "absolute", left: 0, top: `${(y(t) / H) * 100}%`, transform: "translateY(-50%)", fontSize: 10 }}>{t}</span>
          ))}
          <div style={{ position: "relative", height: 18, marginTop: -18 }}>
            {points.map((p, i) => (
              <span key={i} className="mono faint" style={{ position: "absolute", left: `${(x(i) / W) * 100}%`, transform: "translateX(-50%)", fontSize: 10, whiteSpace: "nowrap" }}>
                {p.label}
              </span>
            ))}
          </div>
        </>
      )}
      {hp && (
        <div className="chart-tip" style={{ left: `${(x(hover!) / W) * 100}%`, top: hp.value != null ? `${(y(hp.value) / H) * 100}%` : "40%" }}>
          {hp.label} · {hp.value != null ? format(hp.value) : "no data"}
          {hp.hint && <span style={{ opacity: 0.7, fontWeight: 500 }}> · {hp.hint}</span>}
        </div>
      )}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}><th>{p.label}</th><td>{p.value != null ? format(p.value) : "no data"}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
