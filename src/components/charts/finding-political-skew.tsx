'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  usePlotArea,
  XAxis,
  YAxis,
} from 'recharts';
import {
  loadGroupComparisons,
  loadMeta,
  loadQuestionTexts,
  loadTrends,
  type QuestionTextsJson,
} from '@/lib/strata-data';
import type {
  GroupComparisonRow,
  MetaJson,
  TrendRow,
} from '@/lib/strata-types';
import { CHART_FONTS, STRATA_PALETTES } from '@/lib/strata-charts';
import {
  describeChange,
  formatCI,
  formatN,
  formatNumber,
  fullWaveLabel,
  waveDateRangeLabel,
} from '@/lib/strata-formatters';
import {
  formatSurveyQuestion,
  surveyQuestionFor,
} from '@/lib/strata-survey';
import {
  DEFAULT_CHART_PLATFORMS,
  PlatformMultiselect,
} from './platform-multiselect';
import { StrataChartFrame } from './strata-chart-frame';

// =====================================================================
// Finding 07 — Which platforms are most politically skewed?
//
// PHASE4_UI_SPEC.md described a stacked horizontal bar showing
// liberal/moderate/conservative composition of each platform's user
// base. The precomputed group_comparisons.json does not currently
// expose the (platform user x political ideology group) cross — only mean
// ideology scores (rate_self) by platform_user_<slug>. We reframe the
// finding to use that available signal: a DIVERGING horizontal bar
// of each platform's mean self-rated ideology relative to the
// national mean, color-coded with the political palette (blue =
// liberal direction, purple = near mid, red = conservative
// direction). Same question, defensible with the data we actually
// have.
//
// Significance check: a platform is described as "skewed" only when
// |platformMean - nationalMean| > 1.96 * sqrt(SE_p^2 + SE_nat^2).
// Otherwise it is "indistinguishable from the national average".
// =====================================================================

const OUTCOME = 'rate_self';
const NATIONAL_VAR = 'rate_self';
// T2-8 (revised handoff): minimum n for a platform's bar to appear in
// the chart. Below this floor the estimate is too noisy to compare
// reliably against the national mean. Threshold revised from 200 → 100
// after Matt's review — n>=100 is still defensible while keeping
// more platforms on screen.
const SMALL_N_FOR_CHART = 100;

interface ChartDatum {
  platform_slug: string;
  platformLabel: string;
  skew: number;
  skewErr: [number, number];
  platformMean: number;
  platformSE: number;
  platformCI: [number, number];
  nationalMean: number;
  n: number | null;
  significant: boolean;
}

// All-waves data shape (T2-3). One row per platform with one
// {skew, skewErr, n, significant, platformMean, nationalMean} per
// available wave so the tooltip can read both the per-bar skew and
// the underlying means.
type AllWavesDatum = {
  platform_slug: string;
  platformLabel: string;
} & {
  [K in
    | `w${number}_skew`
    | `w${number}_n`
    | `w${number}_platformMean`
    | `w${number}_nationalMean`]?: number | null;
} & {
  [K in `w${number}_skewErr`]?: [number, number] | null;
} & {
  [K in `w${number}_significant`]?: boolean;
};

interface BarTooltipProps {
  active?: boolean;
  payload?: readonly {
    payload?: unknown;
  }[];
}

function PoliticalTooltip({ active, payload }: BarTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as ChartDatum | undefined;
  if (!datum) return null;
  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">{datum.platformLabel}</div>
      <div className="text-ink">
        Mean ideology: {formatNumber(datum.platformMean, 1)}{' '}
        <span className="text-slate">
          {formatCI(datum.platformCI[0], datum.platformCI[1], (v) =>
            formatNumber(v, 1),
          )}
        </span>
      </div>
      <div className="text-slate">
        Skew vs national ({formatNumber(datum.nationalMean, 1)}):{' '}
        {datum.skew > 0 ? '+' : ''}
        {formatNumber(datum.skew, 1)}{' '}
        {datum.significant ? '(meaningful)' : '(within MOE)'}
      </div>
      <div className="text-slate">
        n = {datum.n !== null ? formatN(datum.n) : '—'} users
      </div>
    </div>
  );
}

// All-waves tooltip: list per-wave skew + n + significance for the
// hovered platform so a reader sees the full per-wave trajectory.
interface AllWavesPoliticalTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  waves: readonly number[];
}
function AllWavesPoliticalTooltip({
  active,
  payload,
  waves,
}: AllWavesPoliticalTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as AllWavesDatum | undefined;
  if (!datum) return null;
  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">{datum.platformLabel}</div>
      <ul className="space-y-0.5">
        {waves.map((w) => {
          const skew = datum[`w${w}_skew`];
          const mean = datum[`w${w}_platformMean`];
          const nat = datum[`w${w}_nationalMean`];
          const n = datum[`w${w}_n`];
          const sig = datum[`w${w}_significant`];
          if (typeof skew !== 'number') {
            return (
              <li key={w} className="flex items-baseline gap-2">
                <span className="text-slate w-14">Wave {w}</span>
                <span className="text-slate">— (n &lt; {SMALL_N_FOR_CHART})</span>
              </li>
            );
          }
          return (
            <li key={w} className="flex items-baseline gap-2 flex-wrap">
              <span className="text-slate w-14">Wave {w}</span>
              <span className="text-ink">
                {skew > 0 ? '+' : ''}
                {formatNumber(skew, 1)}
              </span>
              <span className="text-slate">
                ({typeof mean === 'number' ? formatNumber(mean, 1) : '—'} vs nat{' '}
                {typeof nat === 'number' ? formatNumber(nat, 1) : '—'})
              </span>
              {typeof n === 'number' ? (
                <span className="text-slate">n={formatN(n)}</span>
              ) : null}
              <span className="text-slate">
                {sig ? '· meaningful' : '· within MOE'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Horizontal axis-break zig-zag drawn ON the X-axis line (the bottom
// edge of the plot area), just inside the Y-axis origin. Signals that
// the diverging axis has been clipped — full +/-50 range is not shown.
function BrokenXAxisIndicator({ visible }: { visible: boolean }) {
  const plotArea = usePlotArea();
  if (!visible || !plotArea) return null;
  const xBaseline = plotArea.x;
  const yBaseline = plotArea.y + plotArea.height;
  return (
    <g
      aria-label="X axis is zoomed (broken axis indicator)"
      transform={`translate(${xBaseline + 2}, ${yBaseline})`}
    >
      <rect x={-1} y={-5} width={22} height={10} fill="#F6F3EE" />
      <path
        d="M 0 0 L 4 -4 L 8 4 L 12 -4 L 16 4 L 20 0"
        stroke="#605A6B"
        strokeWidth="1.5"
        fill="none"
      />
    </g>
  );
}

export function FindingPoliticalSkew() {
  const [groupRows, setGroupRows] = useState<GroupComparisonRow[] | null>(null);
  const [trendsRows, setTrendsRows] = useState<TrendRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [questionTexts, setQuestionTexts] =
    useState<QuestionTextsJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [selectedWave, setSelectedWave] = useState<number>(6);
  // Platform multiselect — filters the diverging bars. Numbers table
  // stays whole-truth (all platforms x all waves).
  const [chartPlatforms, setChartPlatforms] = useState<string[]>(
    () => [...DEFAULT_CHART_PLATFORMS],
  );
  const toggleChartPlatform = (slug: string) => {
    setChartPlatforms((curr) => {
      if (curr.includes(slug)) return curr.filter((s) => s !== slug);
      return [...curr, slug];
    });
  };
  const resetChartPlatforms = () =>
    setChartPlatforms([...DEFAULT_CHART_PLATFORMS]);
  // X-axis zoom (T2-2 + T2-6). The political-ideology scale (rate_self)
  // runs 0-100; the diverging axis here is (platform mean - national
  // mean), so the full possible range is symmetric +/-50 — but in
  // practice U.S. national mean sits near 50 and platform means stay
  // within +/-15, so default to +/-50 and let users zoom in.
  const [xMode, setXMode] =
    useState<'full' | 'fit' | 'custom'>('full');
  const [customAbs, setCustomAbs] = useState<number>(15);
  // T2-3: single (default, per-wave snapshot) vs all (grouped diverging
  // bar — one bar per wave per platform). All-waves mode color-codes
  // bars by wave, not by significance; the tooltip still surfaces
  // significance per bar.
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([
      loadGroupComparisons(),
      loadTrends(),
      loadMeta(),
      loadQuestionTexts(),
    ])
      .then(([gc, trends, m, qt]) => {
        const platformGroupings = new Set(
          m.platforms.map((p) => `platform_user_${p.slug}`),
        );
        setGroupRows(
          gc.filter(
            (r) =>
              platformGroupings.has(r.grouping_var) &&
              r.outcome === OUTCOME &&
              r.group === 'User',
          ),
        );
        setTrendsRows(trends.filter((r) => r.variable_name === NATIONAL_VAR));
        setMeta(m);
        setQuestionTexts(qt);
      })
      .catch(setError);
  }, []);

  const availableWaves = useMemo(() => {
    if (!groupRows) return [] as number[];
    return [...new Set(groupRows.map((r) => r.wave))].sort((a, b) => a - b);
  }, [groupRows]);
  const effectiveWave =
    availableWaves.length === 0
      ? selectedWave
      : availableWaves.includes(selectedWave)
        ? selectedWave
        : availableWaves[availableWaves.length - 1];

  const platformLabelBySlug = useMemo(() => {
    if (!meta) return new Map<string, string>();
    return new Map(meta.platforms.map((p) => [p.slug, p.label]));
  }, [meta]);

  // Pull the national mean ideology for the selected wave from trends.
  const nationalRow = useMemo(() => {
    if (!trendsRows) return null;
    return (
      trendsRows.find(
        (r) => r.metric_type === 'mean' && r.wave === effectiveWave,
      ) ?? null
    );
  }, [trendsRows, effectiveWave]);

  const chartPlatformsSet = useMemo(
    () => new Set(chartPlatforms),
    [chartPlatforms],
  );

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!groupRows || !nationalRow) return [];
    if (nationalRow.metric_type !== 'mean') return [];
    const natMean = nationalRow.weighted_mean ?? null;
    const natSE = nationalRow.weighted_se ?? null;
    if (natMean === null || natSE === null) return [];
    const waveRows = groupRows.filter((r) => {
      if (r.wave !== effectiveWave) return false;
      if (r.suppressed) return false;
      const slug = r.grouping_var.replace(/^platform_user_/, '');
      if (!chartPlatformsSet.has(slug)) return false;
      // T2-7: drop chart rows with n < SMALL_N_FOR_CHART so small-n
      // platforms like Bluesky (n=41) don't dominate the visual
      // hierarchy with extreme but unreliable estimates. They still
      // appear in the Numbers table below, flagged.
      if ((r.n ?? 0) < SMALL_N_FOR_CHART) return false;
      return true;
    });
    const data: ChartDatum[] = [];
    for (const r of waveRows) {
      const mean = r.weighted_value ?? null;
      const se = r.weighted_se ?? null;
      const lo = r.weighted_ci_lower ?? null;
      const hi = r.weighted_ci_upper ?? null;
      if (mean === null || se === null || lo === null || hi === null) {
        continue;
      }
      const skew = mean - natMean;
      const pooled = Math.sqrt(se * se + natSE * natSE);
      const significant = Math.abs(skew) > 1.96 * pooled;
      const slug = r.grouping_var.replace(/^platform_user_/, '');
      data.push({
        platform_slug: slug,
        platformLabel: platformLabelBySlug.get(slug) ?? slug,
        skew,
        // ErrorBar on a diverging bar: half-width = 1.96 * SE_platform
        skewErr: [1.96 * se, 1.96 * se],
        platformMean: mean,
        platformSE: se,
        platformCI: [lo, hi],
        nationalMean: natMean,
        n: r.n,
        significant,
      });
    }
    // Sort: most liberal (lowest mean / largest negative skew) at the top.
    data.sort((a, b) => a.skew - b.skew);
    return data;
  }, [
    groupRows,
    nationalRow,
    effectiveWave,
    platformLabelBySlug,
    chartPlatformsSet,
  ]);

  // National row per wave (used by the all-waves grouped view).
  const nationalRowByWave = useMemo(() => {
    if (!trendsRows) return new Map<number, TrendRow>();
    const m = new Map<number, TrendRow>();
    for (const r of trendsRows) {
      if (r.metric_type === 'mean') m.set(r.wave, r);
    }
    return m;
  }, [trendsRows]);

  // All-waves chart data: one row per selected platform with per-wave
  // skew + CI + n + significance. Sorted by the latest available wave's
  // skew ascending (most liberal at top), same convention as the
  // single-wave chart.
  const allWavesChartData = useMemo<AllWavesDatum[]>(() => {
    if (!groupRows || availableWaves.length === 0) return [];
    const slugs = [...chartPlatforms];
    const rowsBySlug = new Map<string, AllWavesDatum>();
    for (const slug of slugs) {
      rowsBySlug.set(slug, {
        platform_slug: slug,
        platformLabel: platformLabelBySlug.get(slug) ?? slug,
      });
    }
    for (const wave of availableWaves) {
      const nat = nationalRowByWave.get(wave);
      if (!nat || nat.metric_type !== 'mean') continue;
      const natMean = nat.weighted_mean ?? null;
      const natSE = nat.weighted_se ?? null;
      if (natMean === null || natSE === null) continue;
      for (const slug of slugs) {
        const r = groupRows.find(
          (gr) =>
            gr.grouping_var === `platform_user_${slug}` &&
            gr.wave === wave &&
            gr.group === 'User',
        );
        const datum = rowsBySlug.get(slug)!;
        if (!r || r.suppressed || (r.n ?? 0) < SMALL_N_FOR_CHART) {
          datum[`w${wave}_skew`] = null;
          datum[`w${wave}_skewErr`] = null;
          datum[`w${wave}_n`] = r?.n ?? null;
          datum[`w${wave}_platformMean`] = null;
          datum[`w${wave}_nationalMean`] = natMean;
          datum[`w${wave}_significant`] = false;
          continue;
        }
        const mean = r.weighted_value ?? null;
        const se = r.weighted_se ?? null;
        if (mean === null || se === null) {
          datum[`w${wave}_skew`] = null;
          datum[`w${wave}_skewErr`] = null;
          datum[`w${wave}_n`] = r.n;
          datum[`w${wave}_platformMean`] = null;
          datum[`w${wave}_nationalMean`] = natMean;
          datum[`w${wave}_significant`] = false;
          continue;
        }
        const skew = mean - natMean;
        const pooled = Math.sqrt(se * se + natSE * natSE);
        datum[`w${wave}_skew`] = skew;
        datum[`w${wave}_skewErr`] = [1.96 * se, 1.96 * se];
        datum[`w${wave}_n`] = r.n;
        datum[`w${wave}_platformMean`] = mean;
        datum[`w${wave}_nationalMean`] = natMean;
        datum[`w${wave}_significant`] = Math.abs(skew) > 1.96 * pooled;
      }
    }
    const data = [...rowsBySlug.values()];
    data.sort((a, b) => {
      const waves = [...availableWaves].reverse();
      for (const w of waves) {
        const av = a[`w${w}_skew`];
        const bv = b[`w${w}_skew`];
        if (typeof av === 'number' && typeof bv === 'number') {
          return av - bv;
        }
      }
      return (a.platformLabel ?? '').localeCompare(b.platformLabel ?? '');
    });
    return data;
  }, [
    groupRows,
    chartPlatforms,
    availableWaves,
    nationalRowByWave,
    platformLabelBySlug,
  ]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load political-composition data: {error.message}</p>
      </div>
    );
  }
  if (!groupRows || !trendsRows || !meta) {
    return (
      <div
        className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Loading political-composition data…
      </div>
    );
  }

  const palette = STRATA_PALETTES.political;
  const colorForSkew = (skew: number, significant: boolean): string => {
    if (!significant) return palette.moderate;
    return skew < 0 ? palette.liberal : palette.conservative;
  };
  const selectedWaveDates =
    meta.waves.find((w) => w.wave === effectiveWave)?.dates ?? '';

  // X-axis domain (T2-2 + T2-6). Always symmetric around 0 so the
  // diverging effect reads cleanly. Full possible range is +/-50
  // (since rate_self runs 0-100 and the axis is platform mean minus
  // national mean). Fit mode hugs the visible CI envelope; custom
  // mode lets the user set |max|.
  const xMax: number = (() => {
    if (xMode === 'full') return 50;
    if (xMode === 'custom') {
      const v = Math.max(1, Math.min(50, customAbs));
      return v;
    }
    const fitAbs = Math.max(
      5,
      ...chartData.map((d) => Math.abs(d.skew) + d.skewErr[1] + 1),
    );
    return Math.min(50, Math.ceil(fitAbs / 5) * 5);
  })();
  const isZoomed = xMode !== 'full';

  // Build the auto-interpretation.
  const significant = chartData.filter((d) => d.significant);
  const liberalSkewed = significant
    .filter((d) => d.skew < 0)
    .sort((a, b) => a.skew - b.skew)
    .slice(0, 3);
  const conservativeSkewed = significant
    .filter((d) => d.skew > 0)
    .sort((a, b) => b.skew - a.skew)
    .slice(0, 3);
  const liberalSentence =
    liberalSkewed.length > 0
      ? `Platforms whose users skew measurably liberal (mean ideology below the national mean of ${formatNumber(
          chartData[0]?.nationalMean ?? 50,
          1,
        )}) include ${liberalSkewed
          .map(
            (d) =>
              `${d.platformLabel} (${formatNumber(d.platformMean, 1)})`,
          )
          .join(', ')}.`
      : 'No platforms show user bases that skew measurably liberal relative to the national mean.';
  const conservativeSentence =
    conservativeSkewed.length > 0
      ? `Platforms whose users skew measurably conservative include ${conservativeSkewed
          .map(
            (d) =>
              `${d.platformLabel} (${formatNumber(d.platformMean, 1)})`,
          )
          .join(', ')}.`
      : 'No platforms show user bases that skew measurably conservative relative to the national mean.';
  const nonSignificantCount = chartData.length - significant.length;
  const nonSigSentence =
    nonSignificantCount > 0
      ? `The remaining ${nonSignificantCount} platform${nonSignificantCount === 1 ? '' : 's'} show mean ideology scores indistinguishable from the national mean at the 95% level.`
      : '';

  // Wave-to-wave shift for the previously-skewed platforms (per the
  // describeChange rule) — only call out platforms whose mean changed
  // significantly between the earliest available wave and the
  // selected wave.
  const earliestWave = availableWaves[0];
  const waveShiftSentences: string[] = [];
  if (
    earliestWave !== undefined &&
    earliestWave !== effectiveWave &&
    groupRows
  ) {
    for (const d of chartData) {
      const earlierRow = groupRows.find(
        (r) =>
          r.grouping_var === `platform_user_${d.platform_slug}` &&
          r.wave === earliestWave &&
          r.group === 'User' &&
          !r.suppressed,
      );
      if (!earlierRow) continue;
      const ev = earlierRow.weighted_value ?? null;
      const ese = earlierRow.weighted_se ?? null;
      // T2-8: use the platform's weighted_se directly from
      // group_comparisons.json rather than back-computing SE from
      // CI width. Avoids floating-point drift and matches the SE
      // basis used everywhere else (error bars, color-significance).
      const verdict = describeChange(
        ev,
        ese,
        d.platformMean,
        d.platformSE,
      );
      if (verdict !== 'stable' && ev !== null) {
        const dir = verdict === 'increased' ? 'more conservative' : 'more liberal';
        waveShiftSentences.push(
          `${d.platformLabel}'s user base has shifted ${dir} between Wave ${earliestWave} (${formatNumber(ev, 1)}) and Wave ${effectiveWave} (${formatNumber(d.platformMean, 1)}) at the 95% level.`,
        );
      }
    }
  }

  const interpretationText = [
    liberalSentence,
    conservativeSentence,
    nonSigSentence,
    waveShiftSentences.length > 0 ? waveShiftSentences.join(' ') : '',
    'Error bars on the chart represent the platform-user 95% CI; significance is checked against the national mean using the pooled standard error.',
  ]
    .filter(Boolean)
    .join(' ');

  const csvHeaders = [
    'platform_slug',
    'wave',
    'wave_dates',
    'weighted_mean_ideology',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'n',
    'weighted_n_eff',
    'suppressed',
  ];
  const csvRows: unknown[][] = groupRows.map((r) => [
    r.grouping_var.replace(/^platform_user_/, ''),
    r.wave,
    meta.waves.find((w) => w.wave === r.wave)?.dates ?? '',
    r.weighted_value,
    r.weighted_ci_lower,
    r.weighted_ci_upper,
    r.n,
    r.weighted_n_eff,
    r.suppressed,
  ]);

  const barHeight = 26;
  const singleWaveHeight = Math.max(260, chartData.length * barHeight + 60);
  // All-waves: each platform's band holds N bars side-by-side.
  // ~12px per bar + ~14px between platforms.
  const allWavesHeight = Math.max(
    320,
    allWavesChartData.length *
      (availableWaves.length * 12 + 14) +
      80,
  );

  const waveColor = (wave: number): string => {
    const idx = availableWaves.indexOf(wave);
    const palette = STRATA_PALETTES.qualitative8;
    return palette[Math.max(0, idx) % palette.length];
  };

  const singleWaveChart = (
    <ResponsiveContainer width="100%" height={singleWaveHeight}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 16, right: 32, bottom: 16, left: 8 }}
      >
        <CartesianGrid
          stroke="#E7E1EC"
          strokeDasharray="3 3"
          horizontal={false}
        />
        <XAxis
          type="number"
          domain={[-xMax, xMax]}
          allowDataOverflow
          tickFormatter={(v) => (v as number).toString()}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
          label={{
            value: `Mean ideology − national mean (${formatNumber(
              chartData[0]?.nationalMean ?? 50,
              1,
            )})  ·  liberal ←   → conservative`,
            position: 'insideBottom',
            offset: -8,
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fill: '#605A6B',
            },
          }}
        />
        <YAxis
          dataKey="platformLabel"
          type="category"
          width={120}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
        />
        <Tooltip
          cursor={{ fill: '#E7E1EC', opacity: 0.4 }}
          content={(props) => <PoliticalTooltip {...props} />}
        />
        <ReferenceLine x={0} stroke="#18161F" />
        <Bar
          dataKey="skew"
          radius={[2, 2, 2, 2]}
          isAnimationActive={false}
        >
          {chartData.map((d) => (
            <Cell
              key={d.platform_slug}
              fill={colorForSkew(d.skew, d.significant)}
            />
          ))}
          <ErrorBar
            dataKey="skewErr"
            direction="x"
            width={4}
            stroke="#605A6B"
            strokeWidth={1}
          />
        </Bar>
        <BrokenXAxisIndicator visible={isZoomed} />
      </BarChart>
    </ResponsiveContainer>
  );

  // All-waves grouped diverging bar. Bars colored by wave
  // (qualitative8); significance flagged in the tooltip rather than
  // via fill, since wave-coding is the primary axis of comparison
  // in this view.
  const allWavesChart = (
    <ResponsiveContainer width="100%" height={allWavesHeight}>
      <BarChart
        data={allWavesChartData}
        layout="vertical"
        margin={{ top: 16, right: 32, bottom: 24, left: 8 }}
        barGap={1}
        barCategoryGap="20%"
      >
        <CartesianGrid
          stroke="#E7E1EC"
          strokeDasharray="3 3"
          horizontal={false}
        />
        <XAxis
          type="number"
          domain={[-xMax, xMax]}
          allowDataOverflow
          tickFormatter={(v) => (v as number).toString()}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
          label={{
            value:
              'Mean ideology − national mean (per wave)  ·  liberal ←   → conservative',
            position: 'insideBottom',
            offset: -10,
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fill: '#605A6B',
            },
          }}
        />
        <YAxis
          dataKey="platformLabel"
          type="category"
          width={120}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
        />
        <Tooltip
          cursor={{ fill: '#E7E1EC', opacity: 0.4 }}
          content={(props) => (
            <AllWavesPoliticalTooltip
              {...props}
              waves={availableWaves}
            />
          )}
        />
        <ReferenceLine x={0} stroke="#18161F" />
        {availableWaves.map((w) => (
          <Bar
            key={w}
            dataKey={`w${w}_skew`}
            name={`Wave ${w}`}
            fill={waveColor(w)}
            radius={[2, 2, 2, 2]}
            isAnimationActive={false}
          >
            <ErrorBar
              dataKey={`w${w}_skewErr`}
              direction="x"
              width={3}
              stroke="#605A6B"
              strokeWidth={1}
            />
          </Bar>
        ))}
        <BrokenXAxisIndicator visible={isZoomed} />
      </BarChart>
    </ResponsiveContainer>
  );

  const allWavesLegend = (
    <div
      className="flex items-center justify-center gap-4 flex-wrap text-xs mt-2"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {availableWaves.map((w) => {
        const dates =
          meta.waves.find((mw) => mw.wave === w)?.dates ?? '';
        return (
          <span key={w} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: waveColor(w) }}
            />
            <span className="text-ink">Wave {w}</span>
            <span className="text-slate">{waveDateRangeLabel(dates)}</span>
          </span>
        );
      })}
    </div>
  );

  const chart =
    viewMode === 'all' ? (
      <>
        {allWavesChart}
        {allWavesLegend}
      </>
    ) : (
      singleWaveChart
    );

  const waveSelector = (
    <div className="space-y-2">
      <p
        className="text-xs text-slate uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Wave
      </p>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="sr-only">Select wave</legend>
        {availableWaves.map((w) => {
          const dates =
            meta.waves.find((mw) => mw.wave === w)?.dates ?? '';
          return (
            <label
              key={w}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name="political-wave"
                value={w}
                checked={effectiveWave === w}
                onChange={() => setSelectedWave(w)}
                className="accent-plum"
              />
              <span
                className={
                  effectiveWave === w ? 'text-ink' : 'text-slate'
                }
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {fullWaveLabel(w, dates)}
              </span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );

  // Swatch lookup so the multiselect shows each visible platform with
  // the same color its bar uses in the chart (blue/purple/red for
  // liberal/moderate/conservative; gray-ish for within-MOE).
  const swatchBySlug = new Map<string, string>();
  for (const d of chartData) {
    swatchBySlug.set(d.platform_slug, colorForSkew(d.skew, d.significant));
  }

  const xAxisControls = (
    <div className="space-y-2">
      <p
        className="text-xs text-slate uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        X axis
      </p>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="sr-only">X axis zoom mode</legend>
        {(['full', 'fit', 'custom'] as const).map((mode) => (
          <label
            key={mode}
            className="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="radio"
              name="political-x-mode"
              value={mode}
              checked={xMode === mode}
              onChange={() => setXMode(mode)}
              className="accent-plum"
            />
            <span
              className={xMode === mode ? 'text-ink' : 'text-slate'}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {mode === 'full'
                ? 'Full range (−50 to +50)'
                : mode === 'fit'
                  ? 'Fit to data'
                  : 'Custom |max|'}
            </span>
          </label>
        ))}
      </fieldset>
      {xMode === 'custom' ? (
        <div
          className="pt-1"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <label className="flex flex-col gap-1 text-xs text-slate">
            |max|
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={customAbs}
              onChange={(e) => setCustomAbs(Number(e.target.value))}
              className="rounded border border-mist px-2 py-1 text-ink bg-paper"
            />
          </label>
        </div>
      ) : null}
    </div>
  );

  const viewModeToggle = (
    <div className="space-y-2">
      <p
        className="text-xs text-slate uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        View
      </p>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="sr-only">Chart view mode</legend>
        {(['single', 'all'] as const).map((mode) => (
          <label
            key={mode}
            className="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="radio"
              name="political-view-mode"
              value={mode}
              checked={viewMode === mode}
              onChange={() => setViewMode(mode)}
              className="accent-plum"
            />
            <span
              className={viewMode === mode ? 'text-ink' : 'text-slate'}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {mode === 'single' ? 'Single wave' : 'All waves'}
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );

  const controlsAside = (
    <div className="space-y-5">
      <PlatformMultiselect
        platforms={meta.platforms}
        selected={chartPlatforms}
        onToggle={toggleChartPlatform}
        onReset={resetChartPlatforms}
        swatchBySlug={swatchBySlug}
      />
      {viewModeToggle}
      {viewMode === 'single' ? waveSelector : null}
      {xAxisControls}
    </div>
  );

  const chartFooter = isZoomed ? (
    <div
      className="flex items-center justify-between gap-3 flex-wrap text-xs"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <span className="text-slate">
        Note: X axis is zoomed. Full range (−50 to +50) not shown.
      </span>
      <button
        type="button"
        onClick={() => setXMode('full')}
        className="text-mulberry hover:text-plum underline-offset-2 hover:underline"
      >
        Reset to full range
      </button>
    </div>
  ) : null;

  // Numbers: simple table of platform x wave mean ideology. Stays
  // whole-truth — every platform with a political-ideology row, not
  // just the multiselect's current chart selection.
  const allWaves = [...availableWaves];
  const allTablePlatforms = meta.platforms
    .map((p) => p.slug)
    .filter((slug) =>
      groupRows.some(
        (gr) => gr.grouping_var === `platform_user_${slug}`,
      ),
    );

  // T2-7: each table cell carries both the value and the cell's n so
  // we can render n<200 cells with a visible flag (italic + small
  // "n=XX" badge) without dropping them from the table.
  const SMALL_N = SMALL_N_FOR_CHART;
  const tableRows = allTablePlatforms.map((slug) => {
    const label = platformLabelBySlug.get(slug) ?? slug;
    const waveCells = allWaves.map((w) => {
      const r = groupRows.find(
        (gr) =>
          gr.grouping_var === `platform_user_${slug}` &&
          gr.wave === w &&
          gr.group === 'User',
      );
      if (!r || r.suppressed) return { v: null, n: null, smallN: false };
      const v = r.weighted_value ?? null;
      const n = r.n ?? null;
      return { v, n, smallN: n !== null && n < SMALL_N };
    });
    return { slug, label, waveCells };
  });

  // T2-7: platforms the user selected (or which would appear) but
  // were dropped from the chart at n<SMALL_N in the selected wave.
  const excludedFromChart: { label: string; n: number }[] = [];
  for (const slug of chartPlatforms) {
    const r = groupRows.find(
      (gr) =>
        gr.grouping_var === `platform_user_${slug}` &&
        gr.wave === effectiveWave &&
        gr.group === 'User' &&
        !gr.suppressed,
    );
    if (r && (r.n ?? 0) < SMALL_N) {
      excludedFromChart.push({
        label: platformLabelBySlug.get(slug) ?? slug,
        n: r.n ?? 0,
      });
    }
  }
  const excludedFromChartNote =
    excludedFromChart.length > 0
      ? ` Excluded from chart at n < ${SMALL_N} in Wave ${effectiveWave}: ${excludedFromChart
          .map((e) => `${e.label} (n=${e.n})`)
          .join(', ')}.`
      : '';

  const numbers = (
    <>
      <div className="overflow-x-auto">
        <table
          className="text-xs w-full border-collapse"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <thead>
            <tr className="text-slate border-b border-mist">
              <th className="text-left font-normal py-2 pr-2 pl-2">
                Platform
              </th>
              {allWaves.map((w) => (
                <th
                  key={w}
                  className="text-right font-normal py-2 px-2"
                >
                  Wave {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr key={row.slug} className="border-b border-mist/60">
                <th
                  scope="row"
                  className="text-left font-normal py-1.5 pr-2 pl-2 text-ink"
                >
                  {row.label}
                </th>
                {row.waveCells.map((cell, i) => (
                  <td
                    key={i}
                    className={
                      'text-right py-1.5 px-2 text-ink tabular-nums ' +
                      (cell.smallN ? 'italic text-slate' : '')
                    }
                    title={
                      cell.smallN
                        ? `n = ${cell.n} (below n=${SMALL_N} reliability floor)`
                        : undefined
                    }
                  >
                    {typeof cell.v === 'number' ? (
                      <>
                        {formatNumber(cell.v, 1)}
                        {cell.smallN ? (
                          <sup className="ml-0.5 text-slate">†</sup>
                        ) : null}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p
        className="text-xs text-slate italic mt-3"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Values are mean political-ideology self-rating (0 = very
        liberal, 100 = very conservative). National mean for the
        selected wave is{' '}
        {formatNumber(chartData[0]?.nationalMean ?? 50, 1)}.
      </p>
      <p
        className="text-xs text-slate italic mt-1"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <sup>†</sup> All numbers with this symbol are based on a small
        sample size (n &lt; {SMALL_N}) in that wave and should be
        interpreted with caution. They are excluded from the chart but
        kept in the table for reference. Hover any flagged cell for
        its exact n.
      </p>
    </>
  );

  const surveyQuestion = formatSurveyQuestion(
    surveyQuestionFor(OUTCOME, questionTexts, meta),
  );

  return (
    <StrataChartFrame
      eyebrow="Finding 07 · Platform comparison"
      title="Which platforms are most politically skewed?"
      surveyQuestion={surveyQuestion || undefined}
      subtitle={
        viewMode === 'all'
          ? `Mean self-reported political ideology (0 = very liberal, 100 = very conservative) of each platform's U.S. adult user base, plotted per wave as a divergence from that wave's national mean. Bars are color-coded by wave so a viewer can read each platform's trajectory across Wave ${Math.min(...availableWaves)}–Wave ${Math.max(...availableWaves)} at a glance. Hover any bar for the per-wave value and whether it is statistically meaningful.`
          : `Mean self-reported political ideology (0 = very liberal, 100 = very conservative) of each platform's ${fullWaveLabel(effectiveWave, selectedWaveDates)} U.S. adult user base, plotted as a divergence from the national mean of ${formatNumber(
              chartData[0]?.nationalMean ?? 50,
              1,
            )}. The original spec called for a liberal/moderate/conservative composition stack, but the (platform user × ideology group) cross is not yet precomputed; mean ideology by user base is the closest available signal. Bars are colored blue when the user base is measurably liberal of the national mean, red when measurably conservative, and purple when within the 95% margin of error.`
      }
      chart={chart}
      chartRef={chartRef}
      controls={controlsAside}
      chartFooter={chartFooter}
      customNumbers={numbers}
      isPlaceholderInterpretation
      interpretation={interpretationText}
      methodologyFootnote={`Source: UAS panel Wave ${Math.min(...availableWaves)}–Wave ${Math.max(...availableWaves)} (UAS514–UAS519). Weighted estimates. Significance vs. the national mean uses pooled SE (sqrt(SE_p² + SE_nat²)); a platform is colored as "skewed" only if |platform mean − national mean| > 1.96 × pooled SE. Error bars on the chart are the platform-user 95% CI. National mean for the selected wave (${formatNumber(
        chartData[0]?.nationalMean ?? 50,
        1,
      )}) is computed from trends.json (variable=rate_self).${excludedFromChartNote}`}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle:
          'Which platforms are most politically skewed? Mean ideology of each platform user base',
        variables: ['rate_self', 'platform_user_<slug>'],
        waves: availableWaves,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase="strata_political_skew"
    />
  );
}
