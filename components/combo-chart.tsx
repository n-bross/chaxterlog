"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type ComboPoint = { key: string; label: string; title: string; u15: number; o15: number; total: number; future?: boolean };

const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const PAD = { top: 12, right: 8, bottom: 26, left: 44 };

// Clean axis steps: 1, 2, 2.5 or 5 times a power of ten, about four gridlines.
function niceMax(max: number) {
  if (max <= 4) return { top: 4, step: 1 };
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * power).find((s) => s >= raw)!;
  return { top: Math.ceil(max / step) * step, step };
}

// One y-axis in visits: columns carry the total, two lines carry U15 and Ü15.
export default function ComboChart({ points, label }: { points: ComboPoint[]; label: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = width && width < 520 ? 220 : 280;
  const plotW = Math.max(0, width - PAD.left - PAD.right), plotH = height - PAD.top - PAD.bottom;
  const { top, step } = niceMax(Math.max(0, ...points.map((p) => p.total)));
  const band = points.length ? plotW / points.length : 0;
  const barW = Math.max(2, Math.min(24, band * 0.62));
  const x = (i: number) => PAD.left + band * (i + 0.5);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.max(1, Math.ceil(44 / Math.max(band, 1)));
  // Lines stop at today: days that have not happened yet are not zero visits.
  const line = (group: "u15" | "o15") => points.filter((p) => !p.future).map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[group]).toFixed(1)}`).join("");
  // Dots only where something was counted; closed days stay a quiet baseline.
  const marked = points.map((p, i) => i).filter((i) => band >= 14 && points[i].total > 0);
  const signature = useMemo(() => points.map((p) => `${p.key}:${p.total}`).join("|"), [points]);

  function pick(clientX: number) {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || !band) return;
    const index = Math.floor((clientX - rect.left - PAD.left) / band);
    setActive(index >= 0 && index < points.length ? index : null);
  }
  const current = active === null ? null : points[active];

  return (
    <figure className="combo-chart" aria-label={label}>
      <div className="combo-legend" aria-hidden="true">
        <span><i className="key-bar" />Gesamt</span>
        <span><i className="key-line key-u15" />U15</span>
        <span><i className="key-line key-o15" />Ü15</span>
      </div>
      <div ref={frame} className="combo-frame" style={{ height }}
        onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${label}: Säulen zeigen die Besuche gesamt, Linien U15 und Ü15. Werte in der Tabelle darunter.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line className="combo-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
                <text className="combo-axis" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{number.format(t)}</text>
              </g>
            ))}
            {active !== null && <rect className="combo-hover" x={PAD.left + band * active} y={PAD.top} width={band} height={plotH} rx={4} />}
            <g key={signature} className="combo-bars">
              {points.map((p, i) => {
                const h = (p.total / top) * plotH;
                if (h <= 0) return null;
                const r = Math.min(4, h, barW / 2), bx = x(i) - barW / 2, by = y(p.total), base = PAD.top + plotH;
                return <path key={p.key} style={{ animationDelay: `${Math.min(i * 12, 360)}ms` }}
                  d={`M${bx},${base}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + barW - r}Q${bx + barW},${by} ${bx + barW},${by + r}V${base}Z`} />;
              })}
            </g>
            <g key={`lines-${signature}`}>
              <path className="combo-line line-u15" d={line("u15")} pathLength={1} />
              <path className="combo-line line-o15" d={line("o15")} pathLength={1} />
              {(active !== null && !marked.includes(active) ? [...marked, active] : marked).map((i) => (
                <g key={i} className="combo-markers">
                  <circle className="dot-u15" cx={x(i)} cy={y(points[i].u15)} r={4} />
                  <circle className="dot-o15" cx={x(i)} cy={y(points[i].o15)} r={4} />
                </g>
              ))}
            </g>
            {points.map((p, i) => (i % labelEvery === 0 ? (
              <text key={p.key} className="combo-axis" x={x(i)} y={height - 8} textAnchor="middle">{p.label}</text>
            ) : null))}
          </svg>
        )}
        {current && (
          <div className="combo-tooltip" role="status" style={{ left: Math.min(Math.max(x(active!), 80), width - 80), top: Math.max(y(current.total) - 8, 56) }}>
            <strong>{current.title}</strong>
            <span><i className="key-bar" />Gesamt <b>{number.format(current.total)}</b></span>
            <span><i className="key-line key-u15" />U15 <b>{number.format(current.u15)}</b></span>
            <span><i className="key-line key-o15" />Ü15 <b>{number.format(current.o15)}</b></span>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th scope="col">Zeitraum</th><th scope="col">Gesamt</th><th scope="col">U15</th><th scope="col">Ü15</th></tr></thead>
        <tbody>{points.map((p) => <tr key={p.key}><th scope="row">{p.title}</th><td>{p.total}</td><td>{p.u15}</td><td>{p.o15}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
