// Pure transforms feeding the /platforms report card. Each takes
// already-loaded JSON rows (no fetch) so the section components stay
// testable and the orchestrator owns loading + lazy gating. Adapters are
// added here per sub-commit as each section lands.

import type {
  PlatformDemographicRow,
  PlatformRateMetric,
  PlatformRateRow,
} from './strata-types';
import type { DemographicVarConfig } from './platform-report-labels';

// One point on a single-platform trend line. value/ci are proportions
// (0–1) for rate metrics; a suppressed or absent wave is null so the line
// and its confidence ribbon show a gap rather than dropping to zero.
export interface TrendPoint {
  wave: number;
  waveDates: string;
  value: number | null;
  ciLow: number | null;
  ciHigh: number | null;
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
        n: row?.n ?? null,
      };
    }
    return {
      wave,
      waveDates: dates,
      value: row.weighted_value,
      ciLow: row.weighted_ci_lower,
      ciHigh: row.weighted_ci_upper,
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
