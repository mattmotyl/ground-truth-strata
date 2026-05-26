// Shared formatters for chart axis labels, tooltips, THE NUMBERS blocks,
// CSV exports, and citation strings. Centralized so every chart family
// renders n / pct / CI / wave / weighting the same way.

export function formatPercent(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value === null || value === undefined) return '—';
  return value.toFixed(digits);
}

export function formatN(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString();
}

export function formatCI(
  lo: number | null | undefined,
  hi: number | null | undefined,
  formatter: (v: number | null | undefined) => string = formatPercent,
): string {
  if (lo === null || lo === undefined || hi === null || hi === undefined) {
    return '';
  }
  return `[${formatter(lo)}, ${formatter(hi)}]`;
}

export function formatWaveLabel(
  wave: number,
  dates?: string | null,
): string {
  if (dates) return `W${wave} · ${dates}`;
  return `W${wave}`;
}

// Compact CSV-safe representation of a value. Used by CSV downloads —
// `value === null` becomes empty cell to match spreadsheet conventions.
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCSV(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','));
  }
  return lines.join('\n');
}

export function downloadBlob(
  content: string | Blob,
  filename: string,
  mimeType = 'text/plain',
): void {
  const blob =
    typeof content === 'string'
      ? new Blob([content], { type: mimeType })
      : content;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
