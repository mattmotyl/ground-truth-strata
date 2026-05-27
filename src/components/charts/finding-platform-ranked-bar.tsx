'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  usePlotArea,
  useXAxisScale,
  XAxis,
  YAxis,
} from 'recharts';
import {
  loadMeta,
  loadPlatformRates,
  loadQuestionTexts,
  type QuestionTextsJson,
} from '@/lib/strata-data';
import type {
  MetaJson,
  PlatformRateMetric,
  PlatformRateRow,
} from '@/lib/strata-types';
import { CHART_FONTS, STRATA_PALETTES } from '@/lib/strata-charts';
import {
  describeChange,
  formatCI,
  formatN,
  formatPercent,
  fullWaveLabel,
  waveDateRangeLabel,
} from '@/lib/strata-formatters';
import {
  formatSurveyQuestion,
  surveyQuestionFor,
} from '@/lib/strata-survey';
import { PlatformWaveTable } from './platform-wave-table';
import {
  DEFAULT_CHART_PLATFORMS,
  PlatformMultiselect,
} from './platform-multiselect';
import { StrataChartFrame } from './strata-chart-frame';
import { type Weighting } from './weighted-toggle';

// =====================================================================
// Reusable single-wave ranked horizontal bar chart for the platform-
// comparison family of findings (#2-5 per PHASE4_UI_SPEC.md).
//
// Each instantiation passes a `metric` (one of nux_rate / bftw_rate /
// useful_rate / mcxn_rate, all from platform_rates.json) and the
// finding-specific copy. The component handles:
//   - sort by selected-wave weighted_value descending
//   - color by magnitude (warm scale for harms, cool for positives)
//   - error bars at bar tips for 95% CIs
//   - tooltip with full CI + user count
//   - weighted toggle, wave selector
//   - Numbers table (PlatformWaveTable, same as Finding 01)
//   - significance-aware computed change verdicts the caller can use
//     to author placeholder interpretation text per the rule in
//     describeChange()
//   - PNG / CSV / Cite via the shared chart frame
// =====================================================================

export type ColorScale = 'warm' | 'cool';

// T2-5: each platform-rate metric is computed from a specific survey
// item. This mapping lets the chart frame display the survey
// question (or construct) above the plot — see surveyQuestionFor()
// in src/lib/strata-survey.ts.
const METRIC_SOURCE_VARIABLE: Record<PlatformRateMetric, string> = {
  usage_rate: 'us001',
  frequency_mean: 'us002',
  nux_rate: 'us003',
  bftw_rate: 'us007',
  mcxn_rate: 'us010',
  useful_rate: 'us012',
  time_per_day_minutes: 'us019_time_min',
};

export interface RankedFindingProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  metric: PlatformRateMetric;
  colorScale: ColorScale;
  citationTitle: string;
  variables: string[];
  // The interpretation slot accepts a function so each finding can read
  // the live, weighted, significance-checked stats and emit copy that
  // matches Matt's rule (no claims of "increased"/"decreased" without
  // |diff| > 1.96 * pooled SE). Marked [PLACEHOLDER] in the UI.
  buildInterpretation: (ctx: InterpretationContext) => string;
  filenameBase: string;
}

export interface InterpretationContext {
  meta: MetaJson;
  weighting: Weighting;
  selectedWave: number;
  // Rows for the selected wave, sorted by weighted_value descending
  // (suppressed rows sink to the bottom).
  selectedWaveSorted: PlatformRateRow[];
  // All rows for this metric across all waves; useful for "did X
  // change W1 -> W6?" significance checks.
  allWaveRows: PlatformRateRow[];
}

interface ChartDatum {
  platform_slug: string;
  platformLabel: string;
  value: number;
  ciLow: number;
  ciHigh: number;
  ciErr: [number, number];
  n: number | null;
  suppressed: boolean;
}

// All-waves grouped-bar mode (T2-3): one row per platform, with one
// {value, ciErr, n} triple per available wave. Recharts renders one
// <Bar dataKey="w{wave}_value"> per wave, grouped side-by-side under
// the platform's Y-axis category. Time information stays visible —
// per Matt's rule, we never collapse across waves.
type AllWavesDatum = {
  platform_slug: string;
  platformLabel: string;
} & {
  [K in `w${number}_value` | `w${number}_ciHigh` | `w${number}_n`]?:
    | number
    | null;
} & {
  [K in `w${number}_ciErr`]?: [number, number] | null;
};

// Bucket a value into 1-of-N color bins. Bin 0 is the lightest (low
// magnitude); the last bin is the darkest (high magnitude). The chart's
// max value drives the scaling so colors stretch across the visible
// range.
function colorForValue(
  value: number,
  maxValue: number,
  scale: readonly string[],
): string {
  if (maxValue <= 0) return scale[0];
  const fraction = Math.max(0, Math.min(1, value / maxValue));
  const bin = Math.min(scale.length - 1, Math.floor(fraction * scale.length));
  return scale[bin];
}

interface BarTooltipProps {
  active?: boolean;
  payload?: readonly {
    value?: unknown;
    payload?: unknown;
  }[];
}

// Horizontal axis-break zig-zag drawn ON the X-axis line (the bottom
// edge of the plot area), just inside the Y-axis origin. Signals that
// the percentage axis has been broken — values to the left of the
// zig-zag are not shown. Oriented along the X-axis: a small wavy
// glyph that straddles the axis line by ~4px above and below.
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
      {/* White background patch so the glyph reads cleanly over the
          axis line itself. */}
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

// Renders one percent label per visible bar at the RIGHT EDGE of the
// CI whisker (not at the point-estimate tip), so the label is never
// crossed by the error bar. Lives inside the BarChart's SVG so it can
// use Recharts' scale hooks to read the live x/y pixel positions —
// same pattern as LineEndLabels in finding-platform-usage.tsx.
// Recharts' built-in label prop only exposes (x, y, width, height,
// value, index) — not the full datum — so anchoring to ciHigh from
// that callback is awkward to type. A sibling SVG layer is simpler
// and matches the existing /trends chart convention.
interface BarCiLabelsProps {
  data: readonly ChartDatum[];
}
function BarCiLabels({ data }: BarCiLabelsProps) {
  const xScale = useXAxisScale();
  const plotArea = usePlotArea();
  if (!xScale || !plotArea || data.length === 0) return null;
  // Vertical band per category = plot height / number of bars. Center
  // of band i = plotArea.y + (i + 0.5) * bandStep. This matches the
  // bars' rendered vertical centers regardless of Recharts' internal
  // scale variant (`useYAxisScale` doesn't expose bandwidth for the
  // category axis here, so derive from the plot geometry instead).
  const bandStep = plotArea.height / data.length;
  const plotRight = plotArea.x + plotArea.width;
  return (
    <g aria-label="Bar value labels (positioned beyond CI tips)">
      {data.map((d, i) => {
        const labelX = xScale(d.ciHigh);
        if (typeof labelX !== 'number') return null;
        // Clip labels whose CI tip falls outside the visible plot area
        // (happens when the user zooms past the bar's CI tip).
        if (labelX > plotRight) return null;
        const cy = plotArea.y + (i + 0.5) * bandStep;
        return (
          <text
            key={d.platform_slug}
            x={labelX + 6}
            y={cy}
            dominantBaseline="middle"
            textAnchor="start"
            fontFamily="var(--font-mono)"
            fontSize={11}
            fill="#18161F"
          >
            {formatPercent(d.value)}
          </text>
        );
      })}
    </g>
  );
}

function BarTooltip({ active, payload }: BarTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as ChartDatum | undefined;
  if (!datum) return null;
  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">{datum.platformLabel}</div>
      {datum.suppressed ? (
        <div className="text-slate">Suppressed (n &lt; 30)</div>
      ) : (
        <>
          <div className="text-ink">
            {formatPercent(datum.value)}{' '}
            <span className="text-slate">
              {formatCI(datum.ciLow, datum.ciHigh)}
            </span>
          </div>
          <div className="text-slate">
            n = {formatN(datum.n)} users
          </div>
        </>
      )}
    </div>
  );
}

// All-waves grouped tooltip. The hovered bar's payload includes every
// wave's value for the platform; we list them so a reader sees the
// full per-wave trajectory at once.
interface AllWavesTooltipProps {
  active?: boolean;
  payload?: readonly {
    dataKey?: unknown;
    payload?: unknown;
    color?: string;
  }[];
  waves: readonly number[];
}
function AllWavesTooltip({ active, payload, waves }: AllWavesTooltipProps) {
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
          const v = datum[`w${w}_value`];
          const n = datum[`w${w}_n`];
          if (typeof v !== 'number') {
            return (
              <li key={w} className="flex items-baseline gap-2">
                <span className="text-slate w-14">Wave {w}</span>
                <span className="text-slate">—</span>
              </li>
            );
          }
          return (
            <li key={w} className="flex items-baseline gap-2">
              <span className="text-slate w-14">Wave {w}</span>
              <span className="text-ink">{formatPercent(v)}</span>
              {typeof n === 'number' ? (
                <span className="text-slate">n={formatN(n)}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FindingPlatformRankedBar({
  eyebrow,
  title,
  subtitle,
  metric,
  colorScale,
  citationTitle,
  variables,
  buildInterpretation,
  filenameBase,
}: RankedFindingProps) {
  const [allRows, setAllRows] = useState<PlatformRateRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [questionTexts, setQuestionTexts] =
    useState<QuestionTextsJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [weighting, setWeighting] = useState<Weighting>('weighted');
  const [selectedWave, setSelectedWave] = useState<number>(6);
  // Platform multiselect — same DEFAULT_CHART_PLATFORMS as Finding 01.
  // Filters which bars appear in the chart (Numbers table stays whole-
  // truth: all platforms in this metric across all waves).
  const [chartPlatforms, setChartPlatforms] = useState<string[]>(
    () => [...DEFAULT_CHART_PLATFORMS],
  );
  // X-axis zoom mode (T2-2 + T2-6). Default is the full 0-100%
  // percentage range, matching PHASE4_UI_SPEC "Axis and Scale Rules".
  //   'full'   : [0, 1] — honest default
  //   'fit'    : [max(0, min-5pp), min(1, max+5pp)] of visible bars
  //   'custom' : [customMin/100, customMax/100]
  const [xMode, setXMode] =
    useState<'full' | 'fit' | 'custom'>('full');
  const [customMin, setCustomMin] = useState<number>(0);
  const [customMax, setCustomMax] = useState<number>(100);
  // T2-3: 'single' (default) renders the current per-wave snapshot;
  // 'all' renders a grouped bar (one bar per wave per platform) so a
  // reader can see how each platform's value moved across waves.
  // Time information stays visible in both modes.
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const chartRef = useRef<HTMLDivElement | null>(null);

  const toggleChartPlatform = (slug: string) => {
    setChartPlatforms((curr) => {
      if (curr.includes(slug)) return curr.filter((s) => s !== slug);
      return [...curr, slug];
    });
  };
  const resetChartPlatforms = () =>
    setChartPlatforms([...DEFAULT_CHART_PLATFORMS]);

  useEffect(() => {
    Promise.all([loadPlatformRates(), loadMeta(), loadQuestionTexts()])
      .then(([rows, m, qt]) => {
        setAllRows(rows.filter((r) => r.metric === metric));
        setMeta(m);
        setQuestionTexts(qt);
      })
      .catch(setError);
  }, [metric]);

  const platformLabelBySlug = useMemo(() => {
    if (!meta) return new Map<string, string>();
    return new Map(meta.platforms.map((p) => [p.slug, p.label]));
  }, [meta]);

  // Default the wave selector to the latest available wave with data.
  // platform_rates.json varies by metric — usage_rate exists for
  // W1-W6, mcxn_rate/useful_rate may be W6-only depending on the
  // question's wave plan. Compute "effectiveWave" inline rather than
  // mirroring availableWaves into the selectedWave state (which would
  // cascade renders and trip the react-hooks/set-state-in-effect
  // lint rule).
  const availableWaves = useMemo(() => {
    if (!allRows) return [] as number[];
    const set = new Set<number>(allRows.map((r) => r.wave));
    return [...set].sort((a, b) => a - b);
  }, [allRows]);
  const effectiveWave =
    availableWaves.length === 0
      ? selectedWave
      : availableWaves.includes(selectedWave)
        ? selectedWave
        : availableWaves[availableWaves.length - 1];

  // sortedRows drives the chart AND the interpretation. The platform
  // multiselect filters here so unchecking a platform drops it from
  // both. The Numbers table below uses the full allRows independently
  // so it stays whole-truth.
  const chartPlatformsSet = useMemo(
    () => new Set(chartPlatforms),
    [chartPlatforms],
  );
  const sortedRows = useMemo(() => {
    if (!allRows) return [] as PlatformRateRow[];
    const waveRows = allRows.filter(
      (r) =>
        r.wave === effectiveWave && chartPlatformsSet.has(r.platform_slug),
    );
    return [...waveRows].sort((a, b) => {
      const av =
        a.suppressed
          ? -1
          : (weighting === 'weighted' ? a.weighted_value : a.value) ?? -1;
      const bv =
        b.suppressed
          ? -1
          : (weighting === 'weighted' ? b.weighted_value : b.value) ?? -1;
      if (av !== bv) return bv - av;
      return a.platform_label.localeCompare(b.platform_label);
    });
  }, [allRows, effectiveWave, weighting, chartPlatformsSet]);

  const chartData = useMemo<ChartDatum[]>(() => {
    return sortedRows
      .filter((r) => !r.suppressed)
      .map((r) => {
        const value =
          (weighting === 'weighted' ? r.weighted_value : r.value) ?? 0;
        const lo =
          (weighting === 'weighted' ? r.weighted_ci_lower : r.ci_lower) ?? value;
        const hi =
          (weighting === 'weighted' ? r.weighted_ci_upper : r.ci_upper) ?? value;
        return {
          platform_slug: r.platform_slug,
          platformLabel:
            platformLabelBySlug.get(r.platform_slug) ?? r.platform_label,
          value,
          ciLow: lo,
          ciHigh: hi,
          ciErr: [Math.max(0, value - lo), Math.max(0, hi - value)] as [
            number,
            number,
          ],
          n: r.n,
          suppressed: false,
        };
      });
  }, [sortedRows, weighting, platformLabelBySlug]);

  // All-waves grouped-bar data shape. One row per selected platform,
  // with fields w{wave}_value / w{wave}_ciErr / w{wave}_n / w{wave}_ciHigh.
  // Sorted by the latest available wave's value descending.
  const allWavesChartData = useMemo<AllWavesDatum[]>(() => {
    if (!allRows) return [];
    const slugs = [...new Set(allRows.map((r) => r.platform_slug))].filter(
      (s) => chartPlatformsSet.has(s),
    );
    const rowsBySlug = new Map<string, AllWavesDatum>();
    for (const slug of slugs) {
      rowsBySlug.set(slug, {
        platform_slug: slug,
        platformLabel: platformLabelBySlug.get(slug) ?? slug,
      });
    }
    for (const r of allRows) {
      const datum = rowsBySlug.get(r.platform_slug);
      if (!datum) continue;
      if (r.suppressed) {
        datum[`w${r.wave}_value`] = null;
        datum[`w${r.wave}_ciErr`] = null;
        datum[`w${r.wave}_ciHigh`] = null;
        datum[`w${r.wave}_n`] = null;
        continue;
      }
      const v = (weighting === 'weighted' ? r.weighted_value : r.value) ?? null;
      const lo =
        (weighting === 'weighted' ? r.weighted_ci_lower : r.ci_lower) ?? v;
      const hi =
        (weighting === 'weighted' ? r.weighted_ci_upper : r.ci_upper) ?? v;
      datum[`w${r.wave}_value`] = v;
      datum[`w${r.wave}_ciHigh`] = hi;
      datum[`w${r.wave}_n`] = r.n;
      if (v !== null && lo !== null && hi !== null) {
        datum[`w${r.wave}_ciErr`] = [
          Math.max(0, v - lo),
          Math.max(0, hi - v),
        ];
      } else {
        datum[`w${r.wave}_ciErr`] = null;
      }
    }
    const data = [...rowsBySlug.values()];
    // Sort by the latest-available wave's value descending. Falls back
    // to the prior wave if the latest is null for some platforms.
    data.sort((a, b) => {
      const waves = [...availableWaves].reverse();
      for (const w of waves) {
        const av = a[`w${w}_value`];
        const bv = b[`w${w}_value`];
        if (typeof av === 'number' && typeof bv === 'number') {
          return bv - av;
        }
      }
      return (a.platformLabel ?? '').localeCompare(b.platformLabel ?? '');
    });
    return data;
  }, [
    allRows,
    chartPlatformsSet,
    platformLabelBySlug,
    weighting,
    availableWaves,
  ]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load platform-rate data: {error.message}</p>
      </div>
    );
  }
  if (!allRows || !meta) {
    return (
      <div
        className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Loading platform-rate data…
      </div>
    );
  }

  const palette =
    colorScale === 'warm'
      ? STRATA_PALETTES.harm
      : STRATA_PALETTES.positive;

  // X-axis domain (T2-2 + T2-6). Full range default = [0, 1].
  // Fit-to-data = ±5pp around the visible CI envelope, clamped.
  // Custom = user-entered [min, max] percentages.
  const xDomain: [number, number] = (() => {
    if (xMode === 'full') return [0, 1];
    if (xMode === 'custom') {
      const lo = Math.max(0, Math.min(100, customMin)) / 100;
      const hi = Math.max(0, Math.min(100, customMax)) / 100;
      if (hi <= lo) return [0, 1];
      return [lo, hi];
    }
    if (chartData.length === 0) return [0, 1];
    let min = Infinity;
    let max = -Infinity;
    for (const d of chartData) {
      if (d.ciLow < min) min = d.ciLow;
      if (d.ciHigh > max) max = d.ciHigh;
    }
    if (min === Infinity) return [0, 1];
    return [
      Math.max(0, Math.floor((min - 0.05) * 100) / 100),
      Math.min(1, Math.ceil((max + 0.05) * 100) / 100),
    ];
  })();
  // Magnitude scale for bar colors stays bound to visible data so
  // colors stretch usefully across the displayed bars regardless of
  // axis zoom — color encodes magnitude, not axis position.
  const colorScaleMax = Math.max(
    0.05,
    ...chartData.map((d) => d.ciHigh),
  );
  const isZoomed = xMode !== 'full';

  const interpretationText = buildInterpretation({
    meta,
    weighting,
    selectedWave: effectiveWave,
    selectedWaveSorted: sortedRows,
    allWaveRows: allRows,
  });

  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');
  const selectedWaveDates =
    meta.waves.find((w) => w.wave === effectiveWave)?.dates ?? '';
  const weightingLabel =
    weighting === 'weighted' ? 'Weighted' : 'Unweighted';
  const wavesSpan = `Wave ${Math.min(...availableWaves)}–Wave ${Math.max(...availableWaves)}`;
  const fullSubtitle =
    viewMode === 'all'
      ? `${subtitle} All available waves shown side-by-side (${wavesSpan}, ${availableWaves.length} waves) per platform. Switch to Single-wave view to compare platforms at one point in time.`
      : `${subtitle} Data shown for ${fullWaveLabel(effectiveWave, selectedWaveDates)}. Use the wave selector to switch waves, or All-waves view to see every wave for each platform.`;

  const csvHeaders = [
    'platform_slug',
    'platform_label',
    'wave',
    'wave_dates',
    'metric',
    'value',
    'ci_lower',
    'ci_upper',
    'n',
    'weighted_value',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'weighted_n_eff',
    'suppressed',
  ];
  const csvRows: unknown[][] = allRows.map((r) => [
    r.platform_slug,
    r.platform_label,
    r.wave,
    meta.waves.find((w) => w.wave === r.wave)?.dates ?? '',
    r.metric,
    r.value,
    r.ci_lower,
    r.ci_upper,
    r.n,
    r.weighted_value,
    r.weighted_ci_lower,
    r.weighted_ci_upper,
    r.weighted_n_eff,
    r.suppressed,
  ]);

  // Per-platform color swatches for the Numbers table — match each row
  // to its bar color so the table and chart visually align.
  const swatchBySlug = new Map<string, string>();
  chartData.forEach((d) => {
    swatchBySlug.set(
      d.platform_slug,
      colorForValue(d.value, colorScaleMax, palette),
    );
  });

  const barHeight = 26;
  const singleWaveHeight = Math.max(
    260,
    chartData.length * barHeight + 64,
  );
  // All-waves rendering needs more vertical room — each platform's
  // band has N bars stacked side-by-side (Recharts groups them within
  // the category band). ~12px per bar + ~14px inter-platform gap.
  const allWavesHeight = Math.max(
    320,
    allWavesChartData.length *
      (availableWaves.length * 12 + 14) +
      64,
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
        margin={{ top: 8, right: 60, bottom: 16, left: 8 }}
      >
        <CartesianGrid stroke="#E7E1EC" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          domain={xDomain}
          allowDataOverflow
          tickFormatter={(v) => `${Math.round((v as number) * 100)}%`}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
        />
        <YAxis
          dataKey="platformLabel"
          type="category"
          width={120}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
          tick={{ fill: '#18161F' }}
        />
        <Tooltip
          cursor={{ fill: '#E7E1EC', opacity: 0.4 }}
          content={(props) => <BarTooltip {...props} />}
        />
        <Bar
          dataKey="value"
          radius={[0, 2, 2, 0]}
          isAnimationActive={false}
        >
          {chartData.map((d) => (
            <Cell
              key={d.platform_slug}
              fill={colorForValue(d.value, colorScaleMax, palette)}
            />
          ))}
          <ErrorBar
            dataKey="ciErr"
            direction="x"
            width={4}
            stroke="#605A6B"
            strokeWidth={1}
          />
        </Bar>
        <BarCiLabels data={chartData} />
        <BrokenXAxisIndicator visible={isZoomed} />
      </BarChart>
    </ResponsiveContainer>
  );

  const allWavesChart = (
    <ResponsiveContainer width="100%" height={allWavesHeight}>
      <BarChart
        data={allWavesChartData}
        layout="vertical"
        margin={{ top: 8, right: 24, bottom: 16, left: 8 }}
        barGap={1}
        barCategoryGap="20%"
      >
        <CartesianGrid stroke="#E7E1EC" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          domain={xDomain}
          allowDataOverflow
          tickFormatter={(v) => `${Math.round((v as number) * 100)}%`}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
        />
        <YAxis
          dataKey="platformLabel"
          type="category"
          width={120}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
          tick={{ fill: '#18161F' }}
        />
        <Tooltip
          cursor={{ fill: '#E7E1EC', opacity: 0.4 }}
          content={(props) => (
            <AllWavesTooltip {...props} waves={availableWaves} />
          )}
        />
        {availableWaves.map((w) => (
          <Bar
            key={w}
            dataKey={`w${w}_value`}
            name={`Wave ${w}`}
            fill={waveColor(w)}
            radius={[0, 2, 2, 0]}
            isAnimationActive={false}
          >
            <ErrorBar
              dataKey={`w${w}_ciErr`}
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

  // Compact wave legend for the all-waves chart so a viewer can tie
  // bar colors to waves without a busy default Recharts Legend.
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

  const suppressedCount = sortedRows.filter((r) => r.suppressed).length;
  const suppressedNote =
    suppressedCount > 0
      ? sortedRows
          .filter((r) => r.suppressed)
          .map(
            (r) => platformLabelBySlug.get(r.platform_slug) ?? r.platform_label,
          )
          .join(', ')
      : null;

  const methodologyFootnoteText =
    `Source: UAS panel ${wavesSpan} (UAS514–UAS519), 2023–2025. ${weightingLabel} estimates. 95% CIs shown as error bars at bar tips and in hover tooltip. n shown in tooltip is the count of respondents asked about each platform. Cells with n < 30 are suppressed by design${
      suppressedNote ? ` (this wave: ${suppressedNote})` : ''
    }. Precomputed JSON generated ${generatedAt}.`;

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
              name={`view-mode-${metric}`}
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
                name={`wave-${metric}`}
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
              name={`x-mode-${metric}`}
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
                ? 'Full range (0–100%)'
                : mode === 'fit'
                  ? 'Fit to data'
                  : 'Custom'}
            </span>
          </label>
        ))}
      </fieldset>
      {xMode === 'custom' ? (
        <div
          className="grid grid-cols-2 gap-2 pt-1"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <label className="flex flex-col gap-1 text-xs text-slate">
            Min %
            <input
              type="number"
              min={0}
              max={99}
              step={1}
              value={customMin}
              onChange={(e) => setCustomMin(Number(e.target.value))}
              className="rounded border border-mist px-2 py-1 text-ink bg-paper"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate">
            Max %
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={customMax}
              onChange={(e) => setCustomMax(Number(e.target.value))}
              className="rounded border border-mist px-2 py-1 text-ink bg-paper"
            />
          </label>
        </div>
      ) : null}
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
        Note: X axis is zoomed. Full range (0–100%) not shown.
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

  const surveyQuestion = formatSurveyQuestion(
    surveyQuestionFor(METRIC_SOURCE_VARIABLE[metric], questionTexts, meta),
  );

  return (
    <StrataChartFrame
      eyebrow={eyebrow}
      title={title}
      subtitle={fullSubtitle}
      surveyQuestion={surveyQuestion || undefined}
      weighting={weighting}
      onWeightingChange={setWeighting}
      chart={chart}
      chartRef={chartRef}
      controls={controlsAside}
      chartFooter={chartFooter}
      customNumbers={
        <>
          <PlatformWaveTable
            rows={allRows}
            meta={meta}
            weighting={weighting}
            hidden={new Set<string>()}
            swatchBySlug={swatchBySlug}
          />
          <p
            className="text-xs text-slate italic mt-3"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Table covers all platforms in the panel across all waves
            this metric was asked. Hover any cell for its 95%
            confidence interval and user count. Swatches indicate
            relative magnitude in the currently-selected wave.
          </p>
        </>
      }
      isPlaceholderInterpretation
      interpretation={interpretationText}
      methodologyFootnote={methodologyFootnoteText}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle: citationTitle,
        variables,
        waves: availableWaves,
        weighting,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={filenameBase}
    />
  );
}

// =====================================================================
// Helper that any caller can use to write significance-aware
// interpretation copy. Returns the slug -> { value, change verdict
// against the earliest available wave } mapping for the selected wave.
// Matches the rule in describeChange (1.96 * pooled SE).
// =====================================================================

export interface PlatformChangeRow {
  slug: string;
  label: string;
  selectedValue: number;
  selectedCI: [number, number];
  selectedN: number | null;
  earliestWave: number;
  earliestValue: number | null;
  change: 'increased' | 'decreased' | 'stable';
}

export function computePlatformChanges(
  ctx: InterpretationContext,
  earliestWave?: number,
): PlatformChangeRow[] {
  const { allWaveRows, selectedWaveSorted, weighting, meta } = ctx;
  const waves = [...new Set(allWaveRows.map((r) => r.wave))].sort((a, b) => a - b);
  const earliest = earliestWave ?? waves[0];
  const platformLabelBySlug = new Map(
    meta.platforms.map((p) => [p.slug, p.label]),
  );
  const result: PlatformChangeRow[] = [];
  for (const sel of selectedWaveSorted) {
    if (sel.suppressed) continue;
    const sv =
      (weighting === 'weighted' ? sel.weighted_value : sel.value) ?? 0;
    const sse =
      (weighting === 'weighted' ? sel.weighted_se : sel.se) ?? 0;
    const lo =
      (weighting === 'weighted' ? sel.weighted_ci_lower : sel.ci_lower) ?? sv;
    const hi =
      (weighting === 'weighted' ? sel.weighted_ci_upper : sel.ci_upper) ?? sv;
    const earliestRow = allWaveRows.find(
      (r) => r.wave === earliest && r.platform_slug === sel.platform_slug,
    );
    const ev =
      earliestRow && !earliestRow.suppressed
        ? (weighting === 'weighted'
            ? earliestRow.weighted_value
            : earliestRow.value) ?? null
        : null;
    const ese =
      earliestRow && !earliestRow.suppressed
        ? (weighting === 'weighted'
            ? earliestRow.weighted_se
            : earliestRow.se) ?? null
        : null;
    const change = describeChange(ev, ese, sv, sse);
    result.push({
      slug: sel.platform_slug,
      label:
        platformLabelBySlug.get(sel.platform_slug) ?? sel.platform_label,
      selectedValue: sv,
      selectedCI: [lo, hi],
      selectedN: sel.n,
      earliestWave: earliest,
      earliestValue: ev,
      change,
    });
  }
  return result;
}
