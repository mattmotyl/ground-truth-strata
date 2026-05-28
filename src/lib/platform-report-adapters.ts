// Pure transforms feeding the /platforms report card. Each takes
// already-loaded JSON rows (no fetch) so the section components stay
// testable and the orchestrator owns loading + lazy gating. Adapters are
// added here per sub-commit as each section lands.

import type { PlatformRateMetric, PlatformRateRow } from './strata-types';

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
