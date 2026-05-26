'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
} from 'recharts';
import {
  loadMeta,
  loadPlatformRates,
} from '@/lib/strata-data';
import type {
  MetaJson,
  PlatformRateRow,
} from '@/lib/strata-types';
import { CHART_FONTS, CHART_HEIGHTS, STRATA_PALETTES } from '@/lib/strata-charts';
import {
  formatCI,
  formatN,
  formatPercent,
  splitWaveLabelLines,
  waveDateRangeLabel,
} from '@/lib/strata-formatters';
import { PlatformWaveTable } from './platform-wave-table';
import { StrataChartFrame } from './strata-chart-frame';
import { type Weighting } from './weighted-toggle';

// Default chart selection: the 8 platforms with the highest weighted
// usage rate in W1. The user can swap any of these out via the
// platform multiselect in the controls aside (cap at MAX_CHART_PLATFORMS).
const DEFAULT_TOP_8: string[] = [
  'email',
  'text_messaging',
  'youtube',
  'facebook',
  'instagram',
  'facetime',
  'tiktok',
  'snapchat',
];

const MAX_CHART_PLATFORMS = 12;

interface ChartDatum {
  wave: number;
  waveLabel: string;
  waveDates: string;
  // Per-platform value + ci_lo + ci_hi + n. Keys are platform slugs.
  // Values are `number | null` so suppressed cells produce gaps.
  [k: string]: number | string | null;
}

// Count of respondents who reported using a given platform in a given
// wave. For usage_rate rows, n_panel is the wave sample size (the
// denominator), and value is the share reporting yes; the count of
// users is therefore round(value * n_panel). We always derive this
// from the UNWEIGHTED row (raw counts in the sample) so the display
// is stable across the weighted/unweighted toggle — weighting affects
// the rate ESTIMATE, not the count of respondents who actually
// reported using the platform.
function userCount(row: PlatformRateRow): number | null {
  if (row.suppressed) return null;
  if (row.value === null || row.n === null) return null;
  return Math.round(row.value * row.n);
}

function buildChartData(
  rows: PlatformRateRow[],
  meta: MetaJson,
  weighting: Weighting,
  visibleSlugs: string[],
): ChartDatum[] {
  const waveDateMap = new Map(meta.waves.map((w) => [w.wave, w.dates]));
  const waves = [...new Set(rows.map((r) => r.wave))].sort();
  return waves.map((wave) => {
    const dates = waveDateMap.get(wave) ?? '';
    const datum: ChartDatum = {
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
        datum[`${slug}_users`] = null;
        continue;
      }
      datum[slug] =
        weighting === 'weighted' ? row.weighted_value : row.value;
      datum[`${slug}_ci_lo`] =
        weighting === 'weighted' ? row.weighted_ci_lower : row.ci_lower;
      datum[`${slug}_ci_hi`] =
        weighting === 'weighted' ? row.weighted_ci_upper : row.ci_upper;
      // Always show the actual user count (unweighted-derived), not
      // weighted_n_eff — see userCount() comment.
      datum[`${slug}_users`] = userCount(row);
    }
    return datum;
  });
}

// Recharts' Tooltip content prop passes a loosely-typed payload (dataKey
// can be a function, value can be of any type) — we narrow what we need
// at the use site rather than fight the generic contract.
interface PlatformTooltipProps {
  active?: boolean;
  payload?: readonly {
    dataKey?: string | number | ((d: unknown) => unknown);
    value?: unknown;
    color?: string;
    payload?: unknown;
  }[];
  label?: unknown;
  platformLabels: Map<string, string>;
}

function PlatformTooltip({
  active,
  payload,
  label,
  platformLabels,
}: PlatformTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as ChartDatum | undefined;
  if (!datum) return null;
  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1.5 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">
        {String(label ?? '')} · {datum.waveDates}
      </div>
      <ul className="space-y-1">
        {payload.map((p) => {
          if (typeof p.dataKey !== 'string') return null;
          const slug = p.dataKey;
          const value =
            typeof p.value === 'number' ? p.value : null;
          const ciLo = datum[`${slug}_ci_lo`];
          const ciHi = datum[`${slug}_ci_hi`];
          const nUsers = datum[`${slug}_users`];
          if (value === null) return null;
          return (
            <li key={slug} className="flex items-baseline gap-2">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-sm shrink-0"
                style={{ backgroundColor: p.color }}
              />
              <span className="text-ink/85 flex-1">
                {platformLabels.get(slug) ?? slug}
              </span>
              <span className="text-ink font-medium">
                {formatPercent(value)}
              </span>
              {typeof ciLo === 'number' && typeof ciHi === 'number' ? (
                <span className="text-slate">{formatCI(ciLo, ciHi)}</span>
              ) : null}
              {typeof nUsers === 'number' ? (
                <span className="text-slate">n={formatN(nUsers)}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Renders one text label per visible line, positioned at the line's
// last non-null data point. Vertical collision detection nudges
// overlapping labels (within 14px) downward so they stay readable.
// Rendered inside the LineChart's SVG so the labels move correctly
// when the chart resizes.
interface LineEndLabelsProps {
  chartPlatforms: string[];
  chartData: ChartDatum[];
  swatchBySlug: ReadonlyMap<string, string>;
  platformLabels: ReadonlyMap<string, string>;
}

function LineEndLabels({
  chartPlatforms,
  chartData,
  swatchBySlug,
  platformLabels,
}: LineEndLabelsProps) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale || chartData.length === 0) return null;

  const COLLISION_PX = 14;
  type LabelEntry = {
    slug: string;
    label: string;
    color: string;
    x: number;
    y: number;
  };
  const labels: LabelEntry[] = [];
  for (const slug of chartPlatforms) {
    // Find the latest wave with a non-null value for this platform.
    let lastDatum: ChartDatum | null = null;
    for (let i = chartData.length - 1; i >= 0; i--) {
      const v = chartData[i][slug];
      if (typeof v === 'number') {
        lastDatum = chartData[i];
        break;
      }
    }
    if (!lastDatum) continue;
    const value = lastDatum[slug];
    if (typeof value !== 'number') continue;
    const xPx = xScale(lastDatum.waveLabel);
    const yPx = yScale(value);
    if (typeof xPx !== 'number' || typeof yPx !== 'number') continue;
    labels.push({
      slug,
      label: platformLabels.get(slug) ?? slug,
      color: swatchBySlug.get(slug) ?? '#605A6B',
      x: xPx,
      y: yPx,
    });
  }

  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < COLLISION_PX) {
      labels[i].y = labels[i - 1].y + COLLISION_PX;
    }
  }

  return (
    <g aria-label="Line endpoint labels">
      {labels.map((l) => (
        <text
          key={l.slug}
          x={l.x + 6}
          y={l.y + 4}
          fontSize={11}
          fontFamily="var(--font-mono)"
          fill={l.color}
          style={{ pointerEvents: 'none' }}
        >
          {l.label}
        </text>
      ))}
    </g>
  );
}

// Rendered inside the LineChart's SVG so we can use Recharts' hooks to
// read the live plot-area coordinates and anchor the zig-zag to the Y
// axis baseline, just below the lowest tick. Replaces the old absolute-
// positioned overlay that overlapped the legend.
function BrokenAxisIndicator({ visible }: { visible: boolean }) {
  const plotArea = usePlotArea();
  if (!visible || !plotArea) return null;
  const xBaseline = plotArea.x;
  const yBaseline = plotArea.y + plotArea.height;
  // The zig-zag path is 20px tall. Position it so its BOTTOM rests on
  // the X-axis line (yBaseline). Drawn just inside the plot area at
  // the bottom of the Y-axis line, not below it. Width is 10px so we
  // straddle the Y-axis line by 5px on each side.
  return (
    <g
      aria-label="Y axis is zoomed (broken axis indicator)"
      transform={`translate(${xBaseline - 5}, ${yBaseline - 22})`}
    >
      <path
        d="M 0 0 L 10 4 L 0 10 L 10 14 L 0 20"
        stroke="#605A6B"
        strokeWidth="1.5"
        fill="none"
      />
    </g>
  );
}

// Custom XAxis tick that renders the wave label on two lines so a long
// date range like "Nov '23–Feb '24" stays legible without overflowing
// the column. Splits the label after the en-dash.
interface AxisTickProps {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
}

function TwoLineXTick(props: AxisTickProps) {
  const value = props.payload?.value;
  if (typeof value !== 'string') return null;
  const [line1, line2] = splitWaveLabelLines(value);
  return (
    <g transform={`translate(${props.x ?? 0},${props.y ?? 0})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize={12}
        fill="#605A6B"
      >
        {line1}
      </text>
      <text
        x={0}
        y={0}
        dy={28}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize={12}
        fill="#605A6B"
      >
        {line2}
      </text>
    </g>
  );
}

interface FindingPlatformUsageProps {
  // Optional override for default visible set (e.g., set by a URL query
  // param in a later milestone).
  initialPlatforms?: string[];
}

export function FindingPlatformUsage({
  initialPlatforms,
}: FindingPlatformUsageProps = {}) {
  const [rows, setRows] = useState<PlatformRateRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [weighting, setWeighting] = useState<Weighting>('weighted');
  // The platforms that have a line in the chart. User-controlled via
  // the multiselect in the controls aside. Capped at
  // MAX_CHART_PLATFORMS (12) for readability.
  const [chartPlatforms, setChartPlatforms] = useState<string[]>(
    () => initialPlatforms ?? DEFAULT_TOP_8,
  );
  // Y axis zoom mode and custom-range bounds (percentages, 0-100).
  // 'full'   : [0, 1] domain, the default
  // 'fit'    : [min - 5%, max + 5%] of visible data, clamped to [0, 1]
  // 'custom' : [customMin/100, customMax/100], user-entered bounds
  const [yMode, setYMode] =
    useState<'full' | 'fit' | 'custom'>('full');
  const [customMin, setCustomMin] = useState<number>(0);
  const [customMax, setCustomMax] = useState<number>(100);
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([loadPlatformRates(), loadMeta()])
      .then(([allRows, m]) => {
        setRows(allRows.filter((r) => r.metric === 'usage_rate'));
        setMeta(m);
      })
      .catch(setError);
  }, []);

  const platformLabels = useMemo(() => {
    if (!meta) return new Map<string, string>();
    return new Map(meta.platforms.map((p) => [p.slug, p.label]));
  }, [meta]);

  const chartData = useMemo(() => {
    if (!rows || !meta) return [];
    return buildChartData(rows, meta, weighting, chartPlatforms);
  }, [rows, meta, weighting, chartPlatforms]);

  // Swatch lookup so the Numbers table can show the same colored marker
  // next to platforms that have a corresponding line in the chart.
  // Stable across hiding/showing — each chartPlatforms slug gets its
  // assigned color regardless of which others are currently hidden.
  const swatchBySlug = useMemo(() => {
    const m = new Map<string, string>();
    chartPlatforms.forEach((slug, i) => {
      m.set(
        slug,
        STRATA_PALETTES.qualitative8[
          i % STRATA_PALETTES.qualitative8.length
        ],
      );
    });
    return m;
  }, [chartPlatforms]);

  const toggleChartPlatform = (slug: string) => {
    setChartPlatforms((curr) => {
      if (curr.includes(slug)) {
        // Allow removing down to zero — the chart shows an empty plot,
        // which is recoverable via Reset.
        return curr.filter((s) => s !== slug);
      }
      if (curr.length >= MAX_CHART_PLATFORMS) return curr;
      return [...curr, slug];
    });
  };

  const resetChartPlatforms = () => setChartPlatforms(DEFAULT_TOP_8);

  // Compute Y domain from current mode + state.
  const yDomain = useMemo<[number, number]>(() => {
    if (yMode === 'full') return [0, 1];
    if (yMode === 'custom') {
      const lo = Math.max(0, Math.min(100, customMin)) / 100;
      const hi = Math.max(0, Math.min(100, customMax)) / 100;
      if (hi <= lo) return [0, 1];
      return [lo, hi];
    }
    // Fit to chart-selected platforms' data, ±5 percentage points,
    // clamped to [0, 1].
    if (!rows) return [0, 1];
    if (chartPlatforms.length === 0) return [0, 1];
    let min = Infinity;
    let max = -Infinity;
    for (const r of rows) {
      if (!chartPlatforms.includes(r.platform_slug)) continue;
      if (r.suppressed) continue;
      const v =
        weighting === 'weighted' ? r.weighted_value : r.value;
      if (v === null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === Infinity) return [0, 1];
    return [
      Math.max(0, Math.floor((min - 0.05) * 100) / 100),
      Math.min(1, Math.ceil((max + 0.05) * 100) / 100),
    ];
  }, [yMode, customMin, customMax, rows, chartPlatforms, weighting]);

  const isZoomed = yMode !== 'full';

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load platform usage data: {error.message}</p>
      </div>
    );
  }

  if (!rows || !meta) {
    return (
      <div
        className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Loading platform usage data…
      </div>
    );
  }

  const allWaves = meta.waves.map((w) => w.wave);
  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');
  const wavesSpan = `W${Math.min(...allWaves)}–W${Math.max(...allWaves)}`;

  const chart = (
    <div className="relative">
    <ResponsiveContainer width="100%" height={CHART_HEIGHTS.line}>
      <LineChart
        data={chartData}
        margin={{ top: 16, right: 130, bottom: 24, left: 8 }}
      >
        <CartesianGrid stroke="#E7E1EC" strokeDasharray="3 3" />
        <XAxis
          dataKey="waveLabel"
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
          tickMargin={6}
          height={48}
          interval={0}
          tick={<TwoLineXTick />}
        />
        <YAxis
          domain={yDomain}
          tickFormatter={(v) => `${Math.round((v as number) * 100)}%`}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
          tickMargin={4}
        />
        <Tooltip
          content={(props) => (
            <PlatformTooltip {...props} platformLabels={platformLabels} />
          )}
        />
        {chartPlatforms.map((slug) => (
          <Line
            key={slug}
            type="monotone"
            dataKey={slug}
            stroke={swatchBySlug.get(slug) ?? '#605A6B'}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
        <LineEndLabels
          chartPlatforms={chartPlatforms}
          chartData={chartData}
          swatchBySlug={swatchBySlug}
          platformLabels={platformLabels}
        />
        <BrokenAxisIndicator visible={isZoomed} />
      </LineChart>
    </ResponsiveContainer>
    </div>
  );

  // Round 3's "Note: X hidden" note is gone — the multiselect IS the
  // way to choose chart platforms now. chartFooter below surfaces the
  // zoom note only.

  // CSV: long format mirroring the underlying platform_rates.json (one
  // row per platform-wave). Includes both weighted and unweighted
  // estimates regardless of toggle so the CSV is the whole truth, not
  // just the current view. Adds a derived n_users column (count of
  // respondents who reported using the platform).
  const csvHeaders = [
    'platform_slug',
    'platform_label',
    'wave',
    'wave_dates',
    'value',
    'ci_lower',
    'ci_upper',
    'n_panel',
    'n_users',
    'weighted_value',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'weighted_n_eff',
    'suppressed',
  ];
  const csvRows: unknown[][] = rows
    .filter((r) => chartPlatforms.includes(r.platform_slug))
    .map((r) => [
      r.platform_slug,
      r.platform_label,
      r.wave,
      meta.waves.find((w) => w.wave === r.wave)?.dates ?? '',
      r.value,
      r.ci_lower,
      r.ci_upper,
      r.n,
      userCount(r),
      r.weighted_value,
      r.weighted_ci_lower,
      r.weighted_ci_upper,
      r.weighted_n_eff,
      r.suppressed,
    ]);

  const waveCount = meta.waves.length;
  const weightingLabel =
    weighting === 'weighted' ? 'Weighted' : 'Unweighted';
  const subtitleText =
    'Share of U.S. adults reporting each platform among the services they use, across ' +
    wavesSpan +
    ' (' +
    waveCount +
    ' survey waves, 2023–2025). Use the Platforms picker in the controls to add or remove lines.';
  // SIGNIFICANCE-AWARE INTERPRETATION COPY — see describeChange() in
  // src/lib/strata-formatters.ts for the rule. Every directional claim
  // ("increased", "decreased", "grew", "fell", etc.) below must be
  // backed by |W6 - W1| > 1.96 * sqrt(SE_W1^2 + SE_W6^2). Anything else
  // is described as "remained stable" / "shifts within the margin of
  // error."
  //
  // For the default DEFAULT_TOP_8 platforms, computed offline from
  // public/data/platform_rates.json (metric=usage_rate, weighted):
  //
  //   slug             W1 -> W6 (diff)   1.96 * pooled_SE   verdict
  //   ----------------------------------------------------------------
  //   email            83.3% -> 79.4%  (-3.84pp)   3.12pp   DECREASED
  //   youtube          66.7% -> 61.9%  (-4.86pp)   3.79pp   DECREASED
  //   text_messaging   79.7% -> 80.8%  (+1.18pp)   3.23pp   stable
  //   facebook         66.7% -> 64.2%  (-2.48pp)   3.73pp   stable
  //   instagram        38.0% -> 40.0%  (+1.99pp)   3.67pp   stable
  //   facetime         31.3% -> 28.4%  (-2.87pp)   3.46pp   stable
  //   tiktok           26.9% -> 27.2%  (+0.27pp)   3.34pp   stable
  //   snapchat         20.0% -> 18.9%  (-1.07pp)   2.86pp   stable
  //
  // Only Email and YouTube cross the significance threshold W1->W6.
  // The earlier draft claim that TikTok's share had "grown across
  // waves" was unsupported (0.27pp shift against a 3.34pp threshold)
  // and has been removed. The "table covers all 23 platforms..."
  // sentence used to live here but it now lives as a footnote inside
  // the Numbers box (which sits above the interpretation), so
  // referring to a table "below" was directionally wrong.
  const interpretationText =
    'The two highest-usage tools across the panel are workhorse communication channels — text messaging and email — not social-media platforms. Among purely social services, Facebook and YouTube have the broadest reach in the most recent wave (W6), with Instagram a clear third. Two of the eight default platforms show statistically meaningful changes from W1 to W6: email use declined by about 3.8 percentage points and YouTube use declined by about 4.9 points (both exceed their 95% margins of error). The remaining six — text messaging, Facebook, Instagram, FaceTime, TikTok, and Snapchat — remained stable across the six waves; any apparent shifts are within the margin of error.';
  const methodologyFootnoteText =
    'Source: UAS panel waves 1–6 (UAS514–UAS519), 2023–2025. ' +
    weightingLabel +
    ' estimates. 95% CIs available on hover (chart line + Numbers table cells). Cells with n < 30 are suppressed by design. Precomputed JSON generated ' +
    generatedAt +
    '.';

  const chartFooter = isZoomed ? (
    <div
      className="flex items-center justify-between gap-3 flex-wrap text-xs"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <span className="text-slate">
        Note: Y axis is zoomed. Full range not shown.
      </span>
      <button
        type="button"
        onClick={() => setYMode('full')}
        className="text-mulberry hover:text-plum underline-offset-2 hover:underline"
      >
        Reset to full range
      </button>
    </div>
  ) : null;

  // Y-axis zoom controls rendered in the controls aside via the
  // `controls` prop on StrataChartFrame.
  const yAxisControls = (
    <div className="space-y-2">
      <p
        className="text-xs text-slate uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Y axis
      </p>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="sr-only">Y axis zoom mode</legend>
        {(['full', 'fit', 'custom'] as const).map((mode) => (
          <label
            key={mode}
            className="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="radio"
              name="y-mode"
              value={mode}
              checked={yMode === mode}
              onChange={() => setYMode(mode)}
              className="accent-plum"
            />
            <span
              className={yMode === mode ? 'text-ink' : 'text-slate'}
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
      {yMode === 'custom' ? (
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

  // Platform multiselect — replaces Round 3's click-to-hide legend
  // behavior. User picks any subset of the 23 platforms to chart,
  // up to MAX_CHART_PLATFORMS (12).
  const platformControls = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-xs text-slate uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Platforms ({chartPlatforms.length} of {MAX_CHART_PLATFORMS} max)
        </p>
      </div>
      <ul
        className="max-h-64 overflow-y-auto border border-mist rounded-md bg-paper px-2 py-1 space-y-0.5"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {meta.platforms.map((p) => {
          const selected = chartPlatforms.includes(p.slug);
          const atCap = chartPlatforms.length >= MAX_CHART_PLATFORMS;
          const disabled = !selected && atCap;
          const swatch = swatchBySlug.get(p.slug);
          return (
            <li key={p.slug}>
              <label
                className={
                  'flex items-center gap-2 text-xs rounded px-1 py-0.5 ' +
                  (disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer hover:bg-mist/50')
                }
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => toggleChartPlatform(p.slug)}
                  className="accent-plum"
                />
                {swatch ? (
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-sm shrink-0"
                    style={{ backgroundColor: swatch }}
                  />
                ) : (
                  <span className="inline-block h-2 w-2 shrink-0" />
                )}
                <span className={selected ? 'text-ink' : 'text-slate'}>
                  {p.label}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {chartPlatforms.length >= MAX_CHART_PLATFORMS ? (
        <p
          className="text-[10px] text-slate italic"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {MAX_CHART_PLATFORMS}-platform maximum reached. Uncheck one to
          add another.
        </p>
      ) : null}
      <button
        type="button"
        onClick={resetChartPlatforms}
        className="text-xs text-mulberry hover:text-plum underline-offset-2 hover:underline"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Reset to default 8
      </button>
    </div>
  );

  const controlsContent = (
    <div className="space-y-5">
      {platformControls}
      {yAxisControls}
    </div>
  );

  return (
    <StrataChartFrame
      eyebrow="Finding 01 · Trends over time"
      title="Who uses what?"
      subtitle={subtitleText}
      weighting={weighting}
      onWeightingChange={setWeighting}
      chart={chart}
      chartRef={chartRef}
      controls={controlsContent}
      chartFooter={chartFooter}
      customNumbers={
        <>
          <PlatformWaveTable
            rows={rows}
            meta={meta}
            weighting={weighting}
            hidden={new Set<string>()}
            swatchBySlug={swatchBySlug}
          />
          <p
            className="text-xs text-slate italic mt-3"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Table covers all 23 platforms across the six survey waves.
            Hover any cell for its 95% confidence interval and user
            count.
          </p>
        </>
      }
      isPlaceholderInterpretation
      interpretation={interpretationText}
      methodologyFootnote={methodologyFootnoteText}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle: 'Who uses what? Platform usage rates',
        variables: ['us001 (platforms_used)'],
        waves: allWaves,
        weighting,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={`strata_platform_usage_${weighting}`}
    />
  );
}
