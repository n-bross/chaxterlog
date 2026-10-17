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
