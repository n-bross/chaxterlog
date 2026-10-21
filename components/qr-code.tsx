"use client";
import { useMemo } from "react";
import { encode } from "uqr";

// Plain SVG modules with a quiet-zone border, so any camera reads it on screen or on paper.
export function qrSvg(text: string) {
  const { data, size } = encode(text, { ecc: "M", border: 2 });
  const path = data.flatMap((row, y) => row.map((dark, x) => (dark ? `M${x},${y}h1v1h-1z` : ""))).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#111"/></svg>`;
}

export default function QrCode({ text, label }: { text: string; label: string }) {
  const svg = useMemo(() => qrSvg(text), [text]);
  return <img className="qr-code" alt={label} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} />;
}
