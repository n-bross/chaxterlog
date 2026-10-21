// Quote every cell, neutralize spreadsheet formulas, and keep UTF-8 umlauts in Excel.
export function csv(rows: unknown[][]): string {
  const cell = (value: unknown) => {
    let text = value == null ? "" : String(value);
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return "\ufeff" + rows.map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}
export function validDay(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

// Month by month for reports: opening days are days with at least one counted visit.
export function monthlyRows(days: { date: string; u15: number; o15: number }[]): (string | number)[][] {
  const months = new Map<string, { days: number; u15: number; o15: number }>();
  for (const day of days) {
    if (day.u15 + day.o15 === 0) continue;
    const month = months.get(day.date.slice(0, 7)) ?? { days: 0, u15: 0, o15: 0 };
    months.set(day.date.slice(0, 7), { days: month.days + 1, u15: month.u15 + day.u15, o15: month.o15 + day.o15 });
  }
  return [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => {
    const total = value.u15 + value.o15;
    return [month, value.days, value.u15, value.o15, total, (Math.round((total / value.days) * 10) / 10).toLocaleString("de-DE")];
  });
}
