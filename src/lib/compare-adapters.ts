// /compare view-model layer (T3-B-Compare).
//
// Every /compare theme reads a different precomputed file with a
// different row shape (platform_rates.json for Themes A/B,
// group_comparisons.json for Theme C, platform_demographics.json for
// Theme D). To keep the chart component dumb, each theme has an adapter
// that normalizes its rows into one shared shape — ComparisonSeries —
// which CompareRankedBar renders without knowing the source.
//
// Part 1 implements the platform_rates adapter (Themes A + B). The
// Theme C / Theme D adapters arrive in Part 2.

import type {
  LikertBucket,
  PlatformRateMetric,
  PlatformRateRow,
} from './strata-types';

// One bar's worth of normalized data. `value` / `ciLow` / `ciHigh` are
// null when the cell is suppressed (n < 30) — the chart renders these
// as an explicit "suppressed" marker rather than a zero-height bar.
export interface ComparisonDatum {
  platform_slug: string;
  label: string;
  value: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  n: number | null;
  suppressed: boolean;
}

export type ComparisonSeries = ComparisonDatum[];

// Ranked-bar sort: descending by value, suppressed rows sink to the
// bottom, ties broken alphabetically by label. Shared by every adapter
// so all /compare charts rank consistently.
export function sortComparisonSeries(
  series: ComparisonSeries,
): ComparisonSeries {
  return [...series].sort((a, b) => {
    const av = a.suppressed ? -Infinity : a.value ?? -Infinity;
    const bv = b.suppressed ? -Infinity : b.value ?? -Infinity;
    if (av !== bv) return bv - av;
    return a.label.localeCompare(b.label);
  });
}

// Does a platform_rates row match the requested bucket selector?
//   bucket === null  → continuous rows only (Theme A rate rows, and the
//                       us018 continuous mean rows we never display)
//   bucket === 'agree' | 'disagree' | 'neutral' → that bucket row only
function matchesBucket(
  row: PlatformRateRow,
  bucket: LikertBucket | null,
): boolean {
  if (bucket === null) return (row.bucket ?? null) === null;
  return row.bucket === bucket;
}

// Adapter for Themes A & B — both read platform_rates.json.
//   Theme A: bucket = null      (nux_rate / bftw_rate / mcxn_rate /
//                                useful_rate — % of users reporting)
//   Theme B: bucket = responseType ('agree' | 'disagree') on a
//            us018a-g metric (share of users in that Likert band)
export function platformRatesToSeries(
  rows: PlatformRateRow[],
  metric: PlatformRateMetric,
  wave: number,
  bucket: LikertBucket | null,
  platformsSet: ReadonlySet<string>,
  labelBySlug: ReadonlyMap<string, string>,
): ComparisonSeries {
  const series: ComparisonSeries = rows
    .filter(
      (r) =>
        r.metric === metric &&
        r.wave === wave &&
        platformsSet.has(r.platform_slug) &&
        matchesBucket(r, bucket),
    )
    .map((r) => ({
      platform_slug: r.platform_slug,
      label: labelBySlug.get(r.platform_slug) ?? r.platform_label,
      value: r.suppressed ? null : r.weighted_value,
      ciLow: r.suppressed ? null : r.weighted_ci_lower,
      ciHigh: r.suppressed ? null : r.weighted_ci_upper,
      n: r.n,
      suppressed: r.suppressed,
    }));
  return sortComparisonSeries(series);
}

// Magnitude color helpers — shared by CompareRankedBar (bar fills) and
// CompareExplorer (Numbers-block swatches) so the two always agree.
// The scale max is bound to the visible CI envelope so colors stretch
// usefully across the displayed bars regardless of axis zoom.
export function comparisonColorScaleMax(series: ComparisonSeries): number {
  const highs = series
    .filter((d) => !d.suppressed && d.ciHigh != null)
    .map((d) => d.ciHigh as number);
  return Math.max(0.05, ...(highs.length ? highs : [0.05]));
}

export function magnitudeColor(
  value: number,
  maxValue: number,
  scale: readonly string[],
): string {
  if (maxValue <= 0) return scale[0];
  const fraction = Math.max(0, Math.min(1, value / maxValue));
  const bin = Math.min(scale.length - 1, Math.floor(fraction * scale.length));
  return scale[bin];
}

// Waves for which a (metric, bucket) selection has rows. Drives the
// wave selector so it only offers waves the chosen question was asked
// in — e.g. Theme B's us018a-g rows exist for W4-W6 only, so the
// selector naturally gates to those waves without a hardcoded list.
export function availableWavesForMetric(
  rows: PlatformRateRow[],
  metric: PlatformRateMetric,
  bucket: LikertBucket | null,
): number[] {
  const set = new Set<number>();
  for (const r of rows) {
    if (r.metric !== metric) continue;
    if (matchesBucket(r, bucket)) set.add(r.wave);
  }
  return [...set].sort((a, b) => a - b);
}
