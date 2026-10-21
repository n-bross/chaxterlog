"use client";

export type BarData = {
  label: string;
  value: number;
  u15?: number;
  o15?: number;
  detail?: string;
};

export type SummaryGraphicData = {
  title: string;
  subtitle: string;
  counts: { u15: number; o15: number; total: number };
  average: number;
  recordedDays: number;
  trendRows: BarData[];
  trendUnitCaption: string;
  weekdays: { label: string; average: number; total: number; days: number }[];
  topDays?: { key: string; total: number; u15: number; o15: number }[];
};

const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function exportSummaryGraphic(data: SummaryGraphicData, filename = "chaxterlog-statistik.png") {
  if (typeof window === "undefined") return;

  const width = 1000;
  // Calculate dynamic height based on rows
  const trendCount = Math.min(data.trendRows.length, 14);
  const height = 680 + Math.max(trendCount, 7) * 36;
  const scale = 2; // Crisp 2x retina

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = "#0c151c";
  ctx.fillRect(0, 0, width, height);

  // Card background helper
  const drawCard = (x: number, y: number, w: number, h: number) => {
    roundRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = "#14222a";
    ctx.fill();
    ctx.strokeStyle = "#223847";
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  // Header Banner
  drawCard(24, 24, width - 48, 86);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("ChaxterLog", 44, 60);

  ctx.fillStyle = "#5dccff";
  ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("· Statistik", 175, 60);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(data.subtitle, 44, 88);

  // Right side of header: date created
  const nowStr = new Date().toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  ctx.fillStyle = "#64748b";
  ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`Export: ${nowStr} Uhr`, width - 44, 72);
  ctx.textAlign = "left";

  // Stat summary row: 4 cards
  const cardY = 126;
  const gap = 14;
  const statCardW = (width - 48 - gap * 3) / 4;
  const statCardH = 84;

  const statsList = [
    { label: "U15 Besuche", val: number.format(data.counts.u15), color: "#38bdf8", sub: "Kinder & Jugendliche" },
    { label: "Ü15 Besuche", val: number.format(data.counts.o15), color: "#fbbf24", sub: "Jugendliche & Erwachsene" },
    { label: "Gesamtbesuche", val: number.format(data.counts.total), color: "#ffffff", sub: `${data.recordedDays} erfasste Tage` },
    { label: "Ø Besuche / Tag", val: number.format(data.average), color: "#34d399", sub: "Durchschnitt" },
  ];

  statsList.forEach((stat, i) => {
    const x = 24 + i * (statCardW + gap);
    drawCard(x, cardY, statCardW, statCardH);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(stat.label, x + 16, cardY + 26);

    ctx.fillStyle = stat.color;
    ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(stat.val, x + 16, cardY + 56);

    ctx.fillStyle = "#64748b";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(stat.sub, x + 16, cardY + 74);
  });

  // Main Section: Besuchsverlauf
  const mainY = 226;
  const mainH = 48 + Math.max(trendCount, 5) * 36;
  drawCard(24, mainY, width - 48, mainH);

  // Section title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("Besuchsverlauf", 44, mainY + 34);

  // Legend
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(width - 230, mainY + 22, 12, 12);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("U15", width - 212, mainY + 33);

  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(width - 150, mainY + 22, 12, 12);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Ü15", width - 132, mainY + 33);

  const displayRows = data.trendRows.slice(-14);
  const maxTrend = Math.max(1, ...displayRows.map((r) => r.value));
  const barStartX = 200;
  const barMaxW = width - 48 - barStartX - 80;

  displayRows.forEach((row, idx) => {
    const rowY = mainY + 54 + idx * 34;

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(row.label, 44, rowY + 16);

    // Track
    const trackH = 14;
    roundRect(ctx, barStartX, rowY + 4, barMaxW, trackH, 4);
    ctx.fillStyle = "#1e2e3b";
    ctx.fill();

    // Bars
    const totalW = Math.max(0, (row.value / maxTrend) * barMaxW);
    if (totalW > 0) {
      const u15Ratio = row.value > 0 ? (row.u15 ?? row.value) / row.value : 0;
      const u15W = totalW * u15Ratio;
      const o15W = totalW - u15W;

      if (u15W > 0) {
        roundRect(ctx, barStartX, rowY + 4, u15W, trackH, o15W > 0 ? 4 : 4);
        ctx.fillStyle = "#38bdf8";
        ctx.fill();
      }
      if (o15W > 0) {
        roundRect(ctx, barStartX + u15W, rowY + 4, o15W, trackH, 4);
        ctx.fillStyle = "#fbbf24";
        ctx.fill();
      }
    }

    ctx.fillStyle = "#f1f5f9";
    ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(number.format(row.value), barStartX + barMaxW + 16, rowY + 16);
  });

  // Bottom Section: Two columns (Wochentage + Top Tage)
  const bottomY = mainY + mainH + gap;
  const colW = (width - 48 - gap) / 2;
  const bottomH = height - bottomY - 32;

  // Left Column: Wochentage
  drawCard(24, bottomY, colW, bottomH);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("Wochentage (Ø Besuche)", 44, bottomY + 34);

  const maxWeekday = Math.max(1, ...data.weekdays.map((w) => w.average));
  const wBarStartX = 140;
  const wBarMaxW = colW - wBarStartX - 60;

  data.weekdays.forEach((w, idx) => {
    const rowY = bottomY + 54 + idx * 30;

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(w.label.slice(0, 2), 44, rowY + 14);

    roundRect(ctx, wBarStartX, rowY + 4, wBarMaxW, 12, 3);
    ctx.fillStyle = "#1e2e3b";
    ctx.fill();

    const wFill = (w.average / maxWeekday) * wBarMaxW;
    if (wFill > 0) {
      roundRect(ctx, wBarStartX, rowY + 4, wFill, 12, 3);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();
    }

    ctx.fillStyle = "#f1f5f9";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(number.format(w.average), wBarStartX + wBarMaxW + 10, rowY + 14);
  });

  // Right Column: Top Tage
  drawCard(24 + colW + gap, bottomY, colW, bottomH);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("Beste Besuchstage", 24 + colW + gap + 20, bottomY + 34);

  const topList = (data.topDays || []).slice(0, 7);
  const maxTop = Math.max(1, ...topList.map((t) => t.total));
  const tBarStartX = 24 + colW + gap + 150;
  const tBarMaxW = colW - 150 - 60;

  topList.forEach((item, idx) => {
    const rowY = bottomY + 54 + idx * 30;
    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(`${medal} ${item.key}`, 24 + colW + gap + 20, rowY + 14);

    roundRect(ctx, tBarStartX, rowY + 4, tBarMaxW, 12, 3);
    ctx.fillStyle = "#1e2e3b";
    ctx.fill();

    const tFill = (item.total / maxTop) * tBarMaxW;
    if (tFill > 0) {
      roundRect(ctx, tBarStartX, rowY + 4, tFill, 12, 3);
      ctx.fillStyle = "#fbbf24";
      ctx.fill();
    }

    ctx.fillStyle = "#f1f5f9";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(number.format(item.total), tBarStartX + tBarMaxW + 10, rowY + 14);
  });

  // Export to Blob and download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}
