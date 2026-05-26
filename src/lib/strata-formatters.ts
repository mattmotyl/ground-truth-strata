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

// Parses meta.json's `waves[].dates` like "March 2 - May 7, 2023" or
// "November 6, 2023 - February 18, 2024" into a compact axis label
// "Mar '23". Falls back to the wave number if parsing fails.
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT_BY_NAME = new Map<string, string>(
  MONTH_NAMES.map((m) => [m, m.slice(0, 3)]),
);

export function shortWaveLabel(
  wave: number,
  dates: string | null | undefined,
): string {
  if (!dates) return `W${wave}`;
  // Find the FIRST month name in the string — that's the wave start month.
  let startMonth: string | null = null;
  for (const m of MONTH_NAMES) {
    if (dates.startsWith(m + ' ')) {
      startMonth = m;
      break;
    }
  }
  if (!startMonth) return `W${wave}`;
  // Find the year associated with the start month: if the dates string
  // spans years (e.g., "November 6, 2023 - February 18, 2024"), the
  // year right after the start-month date is the one we want.
  const startMonthIdx = dates.indexOf(startMonth);
  const segmentAfterStart = dates.slice(startMonthIdx);
  const startYearMatch = segmentAfterStart.match(/\b(\d{4})\b/);
  if (!startYearMatch) return `W${wave}`;
  const shortMonth = MONTH_SHORT_BY_NAME.get(startMonth) ?? startMonth;
  const shortYear = startYearMatch[1].slice(2);
  return `${shortMonth} '${shortYear}`;
}

// Parses meta.json's `waves[].dates` like "March 2 - May 7, 2023" or
// "November 6, 2023 - February 18, 2024" into start/end month and year
// components, plus a sameYear flag.
interface WaveDateParts {
  startMonth: string;
  startYear: string;
  endMonth: string;
  endYear: string;
  sameYear: boolean;
}

function parseWaveDates(dates: string): WaveDateParts | null {
  // Match: "Month1 D[, Y1] - Month2 D, Y2"  (hyphen-minus or en-dash)
  const re =
    /^([A-Z][a-z]+)\s+\d+(?:,\s*(\d{4}))?\s*[-–]\s*([A-Z][a-z]+)\s+\d+,\s*(\d{4})$/;
  const m = dates.match(re);
  if (!m) return null;
  const [, mon1, year1, mon2, year2] = m;
  const startYear = year1 ?? year2;
  return {
    startMonth: mon1.slice(0, 3),
    startYear,
    endMonth: mon2.slice(0, 3),
    endYear: year2,
    sameYear: startYear === year2,
  };
}

// Compact wave label for X-axis ticks: "Mar–May '23" (single-year) or
// "Nov '23–Feb '24" (cross-year). Falls back to the raw string if the
// dates field doesn't parse.
export function waveDateRangeLabel(
  dates: string | null | undefined,
): string {
  if (!dates) return '';
  const parts = parseWaveDates(dates);
  if (!parts) return dates;
  const startYY = parts.startYear.slice(2);
  const endYY = parts.endYear.slice(2);
  if (parts.sameYear) {
    return `${parts.startMonth}–${parts.endMonth} '${startYY}`;
  }
  return `${parts.startMonth} '${startYY}–${parts.endMonth} '${endYY}`;
}

// Three-line stack for table column headers. Returns { months, year }
// where:
//   months = "Mar–May" or "Nov–Feb"
//   year   = "'23"     or "'23–'24"
export function waveTableHeader(
  dates: string | null | undefined,
): { months: string; year: string } {
  if (!dates) return { months: '', year: '' };
  const parts = parseWaveDates(dates);
  if (!parts) return { months: '', year: '' };
  const startYY = parts.startYear.slice(2);
  const endYY = parts.endYear.slice(2);
  const months = `${parts.startMonth}–${parts.endMonth}`;
  const year = parts.sameYear ? `'${startYY}` : `'${startYY}–'${endYY}`;
  return { months, year };
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
