// Pure transforms feeding the /platforms report card. Each takes
// already-loaded JSON rows (no fetch) so the section components stay
// testable and the orchestrator owns loading + lazy gating. Adapters are
// added here per sub-commit as each section lands.

import type {
  ConditionalBreakdownRow,
  ConditionalConstruct,
  GroupComparisonRow,
  LikertBucket,
  PlatformDemographicRow,
  PlatformRateMetric,
  PlatformRateRow,
} from './strata-types';
import {
  sortComparisonSeries,
  type ComparisonSeries,
} from './compare-adapters';
import { describeChange, type ChangeDescription } from './strata-formatters';
import type {
  DemographicVarConfig,
  ExperienceItemConfig,
  HabitItemConfig,
  WellbeingItemConfig,
} from './platform-report-labels';

// One point on a single-platform trend line. value/ci are proportions
// (0–1) for rate metrics; a suppressed or absent wave is null so the line
// and its confidence ribbon show a gap rather than dropping to zero.
export interface TrendPoint {
  wave: number;
  waveDates: string;
  value: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  // weighted_se is carried so the §3 W1→W6 trend indicator can apply the
  // significance-aware describeChange() rule. PlatformTrendLine ignores it.
  se: number | null;
  n: number | null;
}

// Single-platform time series for one platform_rates metric, ordered by
// the supplied wave list. Reads continuous rows only (bucket == null) so
// a bucketed metric never double-counts. Missing or suppressed cells
// become null points.
export function platformMetricTrend(
  rows: PlatformRateRow[],
  platformSlug: string,
  metric: PlatformRateMetric,
  waves: number[],
  waveDatesByWave: ReadonlyMap<number, string>,
): TrendPoint[] {
  return waves.map((wave) => {
    const dates = waveDatesByWave.get(wave) ?? '';
    const row = rows.find(
      (r) =>
        r.platform_slug === platformSlug &&
        r.metric === metric &&
        r.wave === wave &&
        (r.bucket ?? null) === null,
    );
    if (!row || row.suppressed) {
      return {
        wave,
        waveDates: dates,
        value: null,
        ciLow: null,
        ciHigh: null,
        se: null,
        n: row?.n ?? null,
      };
    }
    return {
      wave,
      waveDates: dates,
      value: row.weighted_value,
      ciLow: row.weighted_ci_lower,
      ciHigh: row.weighted_ci_upper,
      se: row.weighted_se,
      n: row.n,
    };
  });
}

// =====================================================================
// Multi-wave grouped table (§2 demographics now; §4 wellbeing later).
// A TableGroup is one breakdown variable; its rows are the categories;
// each row carries one cell per wave column so the rendered grid stays
// rectangular regardless of which (category × wave) combinations exist.
// =====================================================================

export interface TableCell {
  wave: number;
  value: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  n: number | null;
  suppressed: boolean;
}

export interface TableRow {
  categoryLabel: string;
  categoryValue: string;
  cells: TableCell[];
}

export interface TableGroup {
  groupingVar: string;
  variableLabel: string;
  rows: TableRow[];
}

// Distinct waves a platform appears in (ascending) — drives the table's
// wave columns. A small platform may have fewer than six.
export function platformDemographicWaves(
  rows: PlatformDemographicRow[],
  platformSlug: string,
): number[] {
  return [
    ...new Set(
      rows.filter((r) => r.platform_slug === platformSlug).map((r) => r.wave),
    ),
  ].sort((a, b) => a - b);
}

// Build the §2 demographics table for one platform: one TableGroup per
// configured variable, rows in the configured category order, cells
// pivoted across the supplied wave columns. A missing or suppressed
// (platform × var × category × wave) combination yields a suppressed
// cell so the grid is rectangular.
export function platformDemographicsToTable(
  rows: PlatformDemographicRow[],
  platformSlug: string,
  varConfigs: ReadonlyArray<DemographicVarConfig>,
  waves: number[],
): TableGroup[] {
  const index = new Map<string, PlatformDemographicRow>();
  for (const r of rows) {
    if (r.platform_slug !== platformSlug) continue;
    index.set(`${r.grouping_var}|${r.group_value}|${r.wave}`, r);
  }
  return varConfigs.map((cfg) => ({
    groupingVar: cfg.groupingVar,
    variableLabel: cfg.label,
    rows: cfg.categories.map((cat) => ({
      categoryLabel: cat.label,
      categoryValue: cat.value,
      cells: waves.map((wave) => {
        const r = index.get(`${cfg.groupingVar}|${cat.value}|${wave}`);
        if (!r || r.suppressed) {
          return {
            wave,
            value: null,
            ciLow: null,
            ciHigh: null,
            n: r?.n ?? null,
            suppressed: true,
          };
        }
        return {
          wave,
          value: r.weighted_value,
          ciLow: r.weighted_ci_lower,
          ciHigh: r.weighted_ci_upper,
          n: r.n,
          suppressed: false,
        };
      }),
    })),
  }));
}

// =====================================================================
// §5 platform habit/attitude scale (us018a–g, Waves 4–6).
// =====================================================================

// Pivot the seven us018 habit metrics for one (platform × wave × response
// band) into a ranked ComparisonSeries — one datum per habit item, sorted
// descending. `platform_slug` is repurposed as the metric key so
// CompareRankedBar (a generic ranked bar) can render the items as bars;
// `label` is the item's plain-English phrasing.
export function platformHabitsToSeries(
  rows: PlatformRateRow[],
  platformSlug: string,
  wave: number,
  bucket: LikertBucket,
  items: ReadonlyArray<HabitItemConfig>,
): ComparisonSeries {
  const series: ComparisonSeries = items.map((item) => {
    const r = rows.find(
      (row) =>
        row.platform_slug === platformSlug &&
        row.metric === item.metric &&
        row.wave === wave &&
        row.bucket === bucket,
    );
    if (!r || r.suppressed) {
      return {
        platform_slug: item.metric,
        label: item.label,
        value: null,
        ciLow: null,
        ciHigh: null,
        n: r?.n ?? null,
        suppressed: true,
      };
    }
    return {
      platform_slug: item.metric,
      label: item.label,
      value: r.weighted_value,
      ciLow: r.weighted_ci_lower,
      ciHigh: r.weighted_ci_upper,
      n: r.n,
      suppressed: false,
    };
  });
  return sortComparisonSeries(series);
}

// Waves where the platform has at least one non-suppressed us018 bucket
// row for the given response band — drives the §5 wave selector's
// availability (the rest are ghosted). us018 was only asked W4–W6.
export function habitWavesWithData(
  rows: PlatformRateRow[],
  platformSlug: string,
  bucket: LikertBucket,
): number[] {
  const waves = new Set<number>();
  for (const r of rows) {
    if (
      r.platform_slug === platformSlug &&
      r.metric.startsWith('us018') &&
      r.bucket === bucket &&
      !r.suppressed
    ) {
      waves.add(r.wave);
    }
  }
  return [...waves].sort((a, b) => a - b);
}

// =====================================================================
// §3 experience rates over time + conditional follow-up heatmaps.
// =====================================================================

// One experience metric's trend for a platform: the per-wave points
// (for the mini line chart), the latest non-null value (the big number),
// and the W1→W6 significance-aware direction (the ↑/↓/→ indicator).
export interface ExperienceTrend {
  metric: PlatformRateMetric;
  label: string;
  colorIntent: 'warm' | 'cool';
  points: TrendPoint[];
  latestWave: number | null;
  latestValue: number | null;
  trend: ChangeDescription;
}

export function platformExperienceTrends(
  rows: PlatformRateRow[],
  platformSlug: string,
  items: ReadonlyArray<ExperienceItemConfig>,
  waves: number[],
  waveDatesByWave: ReadonlyMap<number, string>,
): ExperienceTrend[] {
  return items.map((item) => {
    const points = platformMetricTrend(
      rows,
      platformSlug,
      item.metric,
      waves,
      waveDatesByWave,
    );
    const withData = points.filter((p) => p.value !== null);
    const first = withData[0] ?? null;
    const last = withData[withData.length - 1] ?? null;
    // Significance-aware direction over the full observed span (first →
    // last wave with data), per strata-formatters.describeChange().
    const trend = describeChange(
      first?.value,
      first?.se,
      last?.value,
      last?.se,
    );
    return {
      metric: item.metric,
      label: item.label,
      colorIntent: item.colorIntent,
      points,
      latestWave: last?.wave ?? null,
      latestValue: last?.value ?? null,
      trend,
    };
  });
}

// A single-platform conditional-breakdown heatmap: response options as
// rows, waves as columns, % of affected users per cell. `max` is the
// largest non-null value across all cells, used to scale the warm color
// ramp.
export interface HeatmapTableRow {
  optionLabel: string;
  cells: TableCell[];
}

export interface HeatmapTable {
  options: HeatmapTableRow[];
  waves: number[];
  max: number;
}

// Waves a (platform × construct) appears in, ascending — drives the
// follow-up heatmap's columns.
export function conditionalWavesForConstruct(
  rows: ConditionalBreakdownRow[],
  platformSlug: string,
  construct: ConditionalConstruct,
): number[] {
  return [
    ...new Set(
      rows
        .filter(
          (r) =>
            r.platform_slug === platformSlug && r.construct === construct,
        )
        .map((r) => r.wave),
    ),
  ].sort((a, b) => a - b);
}

export function platformConditionalHeatmap(
  rows: ConditionalBreakdownRow[],
  platformSlug: string,
  construct: ConditionalConstruct,
  waves: number[],
): HeatmapTable {
  const forCP = rows.filter(
    (r) => r.platform_slug === platformSlug && r.construct === construct,
  );
  // Distinct options, ordered by option_index.
  const optIndex = new Map<string, number>();
  for (const r of forCP) {
    if (!optIndex.has(r.option_label)) optIndex.set(r.option_label, r.option_index);
  }
  const options = [...optIndex.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label);

  const cellIndex = new Map<string, ConditionalBreakdownRow>();
  for (const r of forCP) cellIndex.set(`${r.option_label}|${r.wave}`, r);

  let max = 0;
  const rowsOut: HeatmapTableRow[] = options.map((opt) => ({
    optionLabel: opt,
    cells: waves.map((wave) => {
      const r = cellIndex.get(`${opt}|${wave}`);
      if (!r || r.suppressed) {
        return {
          wave,
          value: null,
          ciLow: null,
          ciHigh: null,
          n: r?.n ?? null,
          suppressed: true,
        };
      }
      if (r.weighted_value !== null && r.weighted_value > max) {
        max = r.weighted_value;
      }
      return {
        wave,
        value: r.weighted_value,
        ciLow: r.weighted_ci_lower,
        ciHigh: r.weighted_ci_upper,
        n: r.n,
        suppressed: false,
      };
    }),
  }));

  return { options: rowsOut, waves, max };
}

// =====================================================================
// §4 wellbeing outcomes among a platform's users (group_comparisons.json,
// grouping_var platform_user_<slug>, group "User").
// =====================================================================

// Distinct waves present for a platform's wellbeing rows, ascending —
// drives the §4 table columns. ls002 spans W1–6; ex003_lonely only
// W2/5/6 (no rows elsewhere → blank cells, not suppression).
export function wellbeingWaves(
  rows: GroupComparisonRow[],
  platformSlug: string,
): number[] {
  const gv = `platform_user_${platformSlug}`;
  const waves = new Set<number>();
  for (const r of rows) {
    if (r.grouping_var === gv && r.group === 'User') waves.add(r.wave);
  }
  return [...waves].sort((a, b) => a - b);
}

// Build the §4 wellbeing table. Emits the same TableGroup[] the
// WithinVariableTable consumes — binary outcomes get Lonely / Not lonely
// sub-rows (the latter the complement of the rate, CI flipped); bucketed
// ls002 items get Agrees / Neutral / Disagrees, relabeled for the
// reverse-coded item (ls002i) to the wellbeing-positive framing.
export function platformWellbeingTable(
  rows: GroupComparisonRow[],
  platformSlug: string,
  items: ReadonlyArray<WellbeingItemConfig>,
  waves: number[],
): TableGroup[] {
  const gv = `platform_user_${platformSlug}`;
  const idx = new Map<string, GroupComparisonRow>();
  for (const r of rows) {
    if (r.grouping_var !== gv || r.group !== 'User') continue;
    idx.set(`${r.outcome}|${r.bucket ?? '_'}|${r.wave}`, r);
  }

  const cell = (
    r: GroupComparisonRow | undefined,
    wave: number,
    complement = false,
  ): TableCell => {
    if (!r || r.suppressed || r.weighted_value === null) {
      return {
        wave,
        value: null,
        ciLow: null,
        ciHigh: null,
        n: r?.n ?? null,
        suppressed: true,
      };
    }
    if (complement) {
      return {
        wave,
        value: 1 - r.weighted_value,
        // Complement of [lo, hi] is [1 - hi, 1 - lo].
        ciLow: r.weighted_ci_upper !== null ? 1 - r.weighted_ci_upper : null,
        ciHigh: r.weighted_ci_lower !== null ? 1 - r.weighted_ci_lower : null,
        n: r.n,
        suppressed: false,
      };
    }
    return {
      wave,
      value: r.weighted_value,
      ciLow: r.weighted_ci_lower,
      ciHigh: r.weighted_ci_upper,
      n: r.n,
      suppressed: false,
    };
  };

  return items.map((item) => {
    if (item.kind === 'binary') {
      return {
        groupingVar: item.outcome,
        variableLabel: item.label,
        rows: [
          {
            categoryLabel: 'Lonely',
            categoryValue: 'lonely',
            cells: waves.map((w) => cell(idx.get(`${item.outcome}|_|${w}`), w)),
          },
          {
            categoryLabel: 'Not lonely',
            categoryValue: 'not_lonely',
            cells: waves.map((w) =>
              cell(idx.get(`${item.outcome}|_|${w}`), w, true),
            ),
          },
        ],
      };
    }
    const order: ReadonlyArray<{ bucket: LikertBucket; label: string }> =
      item.reverseCoded
        ? [
            { bucket: 'agree', label: 'Doesn’t feel negative' },
            { bucket: 'neutral', label: 'Neutral' },
            { bucket: 'disagree', label: 'Feels negative' },
          ]
        : [
            { bucket: 'agree', label: 'Agrees' },
            { bucket: 'neutral', label: 'Neutral' },
            { bucket: 'disagree', label: 'Disagrees' },
          ];
    return {
      groupingVar: item.outcome,
      variableLabel: item.label,
      rows: order.map((o) => ({
        categoryLabel: o.label,
        categoryValue: o.bucket,
        cells: waves.map((w) =>
          cell(idx.get(`${item.outcome}|${o.bucket}|${w}`), w),
        ),
      })),
    };
  });
}
