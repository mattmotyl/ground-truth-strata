// Pure logic for the /trends explorer (T3-B7 redesign). JSX-free so it
// stays trivially testable; the renderer files hold only presentation.

import type {
  GroupComparisonRow,
  MetaJson,
  PlatformRateMetric,
  PlatformRateRow,
  TrendBucketRow,
  TrendMeanRow,
  TrendRateRow,
  TrendRow,
  VariableDef,
  LikertBucket,
} from './strata-types';
import { isTrendBucketRow } from './strata-types';
import { waveDateRangeLabel } from './strata-formatters';
import { getPlatformOutcomeComparison } from './strata-data';
import { availableWavesForOutcome } from './compare-adapters';

// ── Labels ────────────────────────────────────────────────────────────

// Item-level label from a meta `construct`: strip the "Domain — " prefix
// where present (e.g. "Social Media Belief — Using…" → "Using…"). When
// there is no em-dash delimiter the construct is already item-level.
export function stripConstructPrefix(
  construct: string | null | undefined,
): string {
  if (!construct) return '';
  const i = construct.indexOf('—');
  return i >= 0 ? construct.slice(i + 1).trim() : construct;
}

// Chart-title slugs for respondent single-line vars. sc001*/ex004* use
// their (full) construct as the title; rate_self gets a clean slug.
const TRENDS_TITLE_SLUGS: Record<string, string> = {
  rate_self: 'Political Ideology',
};

export function respondentTitle(v: VariableDef): string {
  return TRENDS_TITLE_SLUGS[v.variable_name] ?? v.construct ?? v.variable_name;
}

// ── Per-variable display configuration (Y scale + value field) ────────

export type TrendMode = 'rate' | 'mean' | 'bucketed';

export interface TrendVariableConfig {
  mode: TrendMode;
  yDomain: [number, number] | 'fit';
  isPercent: boolean;
  meanDigits: number;
}

const LIKERT_MAX: Record<string, number> = {
  LIKERT_3: 3,
  LIKERT_4: 4,
  LIKERT_5: 5,
  LIKERT_6: 6,
  LIKERT_6_NOMID: 6,
  LIKERT_7: 7,
};

export function trendConfig(
  responseType: string,
  hasBucketRows: boolean,
): TrendVariableConfig {
  if (hasBucketRows) {
    return { mode: 'bucketed', yDomain: [0, 1], isPercent: true, meanDigits: 1 };
  }
  if (responseType === 'BINARY_YESNO') {
    return { mode: 'rate', yDomain: [0, 1], isPercent: true, meanDigits: 1 };
  }
  if (responseType in LIKERT_MAX) {
    return {
      mode: 'mean',
      yDomain: [1, LIKERT_MAX[responseType]],
      isPercent: false,
      meanDigits: 2,
    };
  }
  if (responseType === 'SCALE_0_10') {
    return { mode: 'mean', yDomain: [0, 10], isPercent: false, meanDigits: 2 };
  }
  if (responseType === 'SCALE_0_100') {
    return { mode: 'mean', yDomain: [0, 100], isPercent: false, meanDigits: 1 };
  }
  return { mode: 'mean', yDomain: 'fit', isPercent: false, meanDigits: 1 };
}

// ── Likert band labels (Well-Being % agree framing) ───────────────────
// ls002i is reverse-coded: post-reversal "agree" = does NOT feel
// negative. Relabel so the wellbeing-positive direction reads correctly.

export const BUCKET_BANDS: LikertBucket[] = ['agree', 'neutral', 'disagree'];

export function bandSelectorLabel(variable: string, band: LikertBucket): string {
  if (variable === 'ls002i') {
    if (band === 'agree') return 'Doesn’t feel negative';
    if (band === 'disagree') return 'Feels negative';
    return 'Neutral';
  }
  if (band === 'agree') return 'Agree';
  if (band === 'disagree') return 'Disagree';
  return 'Neutral';
}

export function bandValueLabel(variable: string, band: LikertBucket): string {
  if (variable === 'ls002i') {
    if (band === 'agree') return '% who don’t feel negative';
    if (band === 'disagree') return '% who feel negative';
    return '% neutral';
  }
  if (band === 'agree') return '% who agree';
  if (band === 'disagree') return '% who disagree';
  return '% neutral';
}

// ── Respondent single-series builder (trends.json) ────────────────────

export interface TrendPoint {
  wave: number;
  waveLabel: string;
  waveDates: string;
  value: number | null;
  ciLo: number | null;
  ciHi: number | null;
  n: number | null;
  se: number | null;
}

function matchesMode(
  row: TrendRow,
  mode: TrendMode,
  band: LikertBucket,
): boolean {
  if (mode === 'bucketed') {
    return isTrendBucketRow(row) && row.bucket === band;
  }
  if (isTrendBucketRow(row)) return false;
  return row.metric_type === (mode === 'rate' ? 'rate' : 'mean');
}

function pointValue(row: TrendRow, mode: TrendMode): number | null {
  if (mode === 'bucketed') return (row as TrendBucketRow).weighted_value;
  if (mode === 'rate') return (row as TrendRateRow).weighted_prop;
  return (row as TrendMeanRow).weighted_mean;
}

export function buildRespondentSeries(
  rows: TrendRow[],
  variable: string,
  mode: TrendMode,
  band: LikertBucket,
  meta: MetaJson,
): TrendPoint[] {
  const waveDates = new Map(meta.waves.map((w) => [w.wave, w.dates]));
  const byWave = new Map<number, TrendRow>();
  for (const r of rows) {
    if (r.variable_name !== variable) continue;
    if (!matchesMode(r, mode, band)) continue;
    byWave.set(r.wave, r);
  }
  return [...byWave.keys()]
    .sort((a, b) => a - b)
    .map((wave) => {
      const r = byWave.get(wave)!;
      const dates = waveDates.get(wave) ?? '';
      const suppressed = r.suppressed;
      return {
        wave,
        waveLabel: waveDateRangeLabel(dates),
        waveDates: dates,
        value: suppressed ? null : pointValue(r, mode),
        ciLo: suppressed ? null : r.weighted_ci_lower,
        ciHi: suppressed ? null : r.weighted_ci_upper,
        n: r.n,
        se: suppressed ? null : r.weighted_se,
      };
    });
}

// ── Multi-line fan data (wide-by-key) ─────────────────────────────────
// One row per wave; per-key value + ci + n columns so suppressed cells
// become gaps. Keys are platform slugs (platform charts) or variable
// names (paired attitude charts).

export interface PlatformFanDatum {
  wave: number;
  waveLabel: string;
  waveDates: string;
  [k: string]: number | string | null;
}

export function buildPlatformFanData(
  rows: PlatformRateRow[],
  meta: MetaJson,
  visibleSlugs: string[],
): PlatformFanDatum[] {
  const waveDates = new Map(meta.waves.map((w) => [w.wave, w.dates]));
  const waves = [...new Set(rows.map((r) => r.wave))].sort((a, b) => a - b);
  return waves.map((wave) => {
    const dates = waveDates.get(wave) ?? '';
    const datum: PlatformFanDatum = {
      wave,
      waveLabel: waveDateRangeLabel(dates),
      waveDates: dates,
    };
    for (const slug of visibleSlugs) {
      const row = rows.find(
        (r) => r.wave === wave && r.platform_slug === slug,
      );
      if (!row || row.suppressed) {
        datum[slug] = null;
        datum[`${slug}_ci_lo`] = null;
        datum[`${slug}_ci_hi`] = null;
        datum[`${slug}_n`] = null;
        continue;
      }
      datum[slug] = row.weighted_value;
      datum[`${slug}_ci_lo`] = row.weighted_ci_lower;
      datum[`${slug}_ci_hi`] = row.weighted_ci_upper;
      datum[`${slug}_n`] = row.n;
    }
    return datum;
  });
}

// ── Well-Being: synthesize PlatformRateRow[] from group_comparisons ───
// The platform-split wellbeing outcomes live in group_comparisons.json
// under grouping_var "platform_user_<slug>", group "User". Reshaping them
// into the PlatformRateRow shape lets the Well-Being chart reuse the same
// fan builder + PlatformWaveTable as the platform-experience chart.
// getPlatformOutcomeComparison handles slug derivation + none/something_
// else exclusion; availableWavesForOutcome gates the waves.
export function buildOutcomeRateRows(
  groupRows: GroupComparisonRow[],
  outcome: string,
  bucket: LikertBucket | null,
  meta: MetaJson,
): PlatformRateRow[] {
  const labelBySlug = new Map(meta.platforms.map((p) => [p.slug, p.label]));
  const rows: PlatformRateRow[] = [];
  for (const wave of availableWavesForOutcome(groupRows, outcome, bucket)) {
    for (const d of getPlatformOutcomeComparison(
      groupRows,
      outcome,
      wave,
      bucket,
    )) {
      rows.push({
        platform_slug: d.platform_slug,
        platform_code: 0,
        platform_label: labelBySlug.get(d.platform_slug) ?? d.platform_slug,
        wave,
        // Synthetic rows are never keyed by `metric` downstream (the fan
        // builder + table read value/ci/n only); the cast satisfies the
        // PlatformRateRow type without widening the metric union.
        metric: outcome as PlatformRateMetric,
        metric_type: 'rate',
        source_variable: outcome,
        n: d.n,
        weighted_value: d.weighted_value,
        weighted_se: d.weighted_se,
        weighted_ci_lower: d.weighted_ci_lower,
        weighted_ci_upper: d.weighted_ci_upper,
        weighted_n_eff: d.weighted_n_eff,
        suppressed: d.suppressed,
      });
    }
  }
  return rows;
}

// ── Paired attitude series (two trends.json mean vars on one chart) ───

// Evenly-spaced Y-axis ticks across a domain — never let Recharts
// auto-calculate (which produced unequal intervals like 0,3,6,9,10 on a
// 0–10 scale). Picks a "nice" step (1/2/5 × 10^n) targeting ~6 ticks; on
// clean full-scale domains this lands exactly on the endpoints
// (e.g. [0,10] → 0,2,4,6,8,10; [1,5] → 1,2,3,4,5; [0,100] → 0,20,…,100).
export function axisTicks([lo, hi]: [number, number]): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const rawStep = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const start = Math.ceil((lo - 1e-9) / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + 1e-9; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks.length ? ticks : [lo, hi];
}

export function buildPairedSeries(
  rows: TrendRow[],
  v1: string,
  v2: string,
  meta: MetaJson,
): PlatformFanDatum[] {
  const waveDates = new Map(meta.waves.map((w) => [w.wave, w.dates]));
  const waves = [
    ...new Set(
      rows
        .filter((r) => r.variable_name === v1 || r.variable_name === v2)
        .map((r) => r.wave),
    ),
  ].sort((a, b) => a - b);
  return waves.map((wave) => {
    const dates = waveDates.get(wave) ?? '';
    const datum: PlatformFanDatum = {
      wave,
      waveLabel: waveDateRangeLabel(dates),
      waveDates: dates,
    };
    for (const v of [v1, v2]) {
      const row = rows.find(
        (r) =>
          r.variable_name === v &&
          r.wave === wave &&
          r.metric_type === 'mean' &&
          !isTrendBucketRow(r),
      );
      if (!row || row.suppressed) {
        datum[v] = null;
        datum[`${v}_ci_lo`] = null;
        datum[`${v}_ci_hi`] = null;
        datum[`${v}_n`] = null;
        continue;
      }
      datum[v] = (row as TrendMeanRow).weighted_mean;
      datum[`${v}_ci_lo`] = row.weighted_ci_lower;
      datum[`${v}_ci_hi`] = row.weighted_ci_upper;
      datum[`${v}_n`] = row.n;
    }
    return datum;
  });
}
