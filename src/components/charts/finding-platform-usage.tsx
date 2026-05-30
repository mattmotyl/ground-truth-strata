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
  loadQuestionTexts,
  type QuestionTextsJson,
} from '@/lib/strata-data';
import type {
  ContextualEventsJson,
  MetaJson,
  PlatformRateRow,
} from '@/lib/strata-types';
import {
  CHART_FONTS,
  CHART_HEIGHTS,
  STRATA_PALETTES,
  strokeDashForIndex,
} from '@/lib/strata-charts';
import {
  formatCI,
  formatN,
  formatPercent,
  splitWaveLabelLines,
  waveDateRangeLabel,
} from '@/lib/strata-formatters';
import {
  formatSurveyQuestion,
  surveyQuestionFor,
} from '@/lib/strata-survey';
import { PlatformWaveTable } from './platform-wave-table';
import {
  DEFAULT_CHART_PLATFORMS,
  MAX_CHART_PLATFORMS,
  PlatformMultiselect,
} from './platform-multiselect';
import { StrataChartFrame } from './strata-chart-frame';
import {
  EventLabels,
  EventsControl,
  renderEventLines,
  useTrendEvents,
} from './trend-line-bits';

interface ChartDatum {
  wave: number;
  waveLabel: string;
  waveDates: string;
  // Per-platform value + ci_lo + ci_hi + n. Keys are platform slugs.
  // Values are `number | null` so suppressed cells produce gaps.
  [k: string]: number | string | null;
}

function buildChartData(
  rows: PlatformRateRow[],
  meta: MetaJson,
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
          const n = datum[`${slug}_n`];
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
  // Contextual events (T3-B7) — passed by TrendsExplorer so the usage
  // chart can show the same per-event reference lines as the other
  // categories. Optional so the component still works standalone.
  events?: ContextualEventsJson | null;
}

export function FindingPlatformUsage({
  initialPlatforms,
  events = null,
}: FindingPlatformUsageProps = {}) {
  const [rows, setRows] = useState<PlatformRateRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [questionTexts, setQuestionTexts] =
    useState<QuestionTextsJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  // The platforms that have a line in the chart. User-controlled via
  // the multiselect in the controls aside. Capped at
  // MAX_CHART_PLATFORMS (12) for readability.
  const [chartPlatforms, setChartPlatforms] = useState<string[]>(
    () => initialPlatforms ?? [...DEFAULT_CHART_PLATFORMS],
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
    Promise.all([loadPlatformRates(), loadMeta(), loadQuestionTexts()])
      .then(([allRows, m, qt]) => {
        setRows(allRows.filter((r) => r.metric === 'usage_rate'));
        setMeta(m);
        setQuestionTexts(qt);
      })
      .catch(setError);
  }, []);

  const platformLabels = useMemo(() => {
    if (!meta) return new Map<string, string>();
    return new Map(meta.platforms.map((p) => [p.slug, p.label]));
  }, [meta]);

  const chartData = useMemo(() => {
    if (!rows || !meta) return [];
    return buildChartData(rows, meta, chartPlatforms);
  }, [rows, meta, chartPlatforms]);

  // Swatch lookup so the Numbers table can show the same colored marker
  // next to platforms that have a corresponding line in the chart.
  // Stable across hiding/showing — each chartPlatforms slug gets its
  // assigned color regardless of which others are currently hidden.
  const swatchBySlug = useMemo(() => {
    const m = new Map<string, string>();
    chartPlatforms.forEach((slug, i) => {
      m.set(
        slug,
        STRATA_PALETTES.qualitative16[
          i % STRATA_PALETTES.qualitative16.length
        ],
      );
    });
    return m;
  }, [chartPlatforms]);

  // Per-slug stroke pattern. Solid for the first 8 lines; dashed for
  // lines 9-16 so red/green-colorblind visitors get a secondary cue
  // to tell additional lines apart from the earlier ones.
  const dashBySlug = useMemo(() => {
    const m = new Map<string, string | undefined>();
    chartPlatforms.forEach((slug, i) => {
      m.set(slug, strokeDashForIndex(i));
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

  const resetChartPlatforms = () =>
    setChartPlatforms([...DEFAULT_CHART_PLATFORMS]);

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
      const v = r.weighted_value;
      if (v === null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === Infinity) return [0, 1];
    return [
      Math.max(0, Math.floor((min - 0.05) * 100) / 100),
      Math.min(1, Math.ceil((max + 0.05) * 100) / 100),
    ];
  }, [yMode, customMin, customMax, rows, chartPlatforms]);

  const isZoomed = yMode !== 'full';

  // Contextual events (T3-B7). Called unconditionally (before the early
  // returns); tolerates null meta + empty waves while data loads.
  const eventWaves = rows ? [...new Set(rows.map((r) => r.wave))] : [];
  const evt = useTrendEvents(events, meta, eventWaves);

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
        {renderEventLines(evt.refLines)}
        {chartPlatforms.map((slug) => (
          <Line
            key={slug}
            type="monotone"
            dataKey={slug}
            stroke={swatchBySlug.get(slug) ?? '#605A6B'}
            strokeDasharray={dashBySlug.get(slug)}
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
        <EventLabels events={evt.visible} baseOffset={10} />
        <BrokenAxisIndicator visible={isZoomed} />
      </LineChart>
    </ResponsiveContainer>
    </div>
  );

  // Round 3's "Note: X hidden" note is gone — the multiselect IS the
  // way to choose chart platforms now. chartFooter below surfaces the
  // zoom note only.

  // CSV: long format mirroring the underlying platform_rates.json (one
  // row per platform-wave).
  const csvHeaders = [
    'platform_slug',
    'platform_label',
    'wave',
    'wave_dates',
    'weighted_value',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'n',
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
      r.weighted_value,
      r.weighted_ci_lower,
      r.weighted_ci_upper,
      r.n,
      r.weighted_n_eff,
      r.suppressed,
    ]);

  // SIGNIFICANCE-AWARE INTERPRETATION COPY — see describeChange() in
  // src/lib/strata-formatters.ts for the rule. Every directional claim
  // ("increased", "decreased", "grew", "fell", etc.) below must be
  // backed by |W6 - W1| > 1.96 * sqrt(SE_W1^2 + SE_W6^2). Anything else
  // is described as "remained stable" / "shifts within the margin of
  // error."
  //
  // For the new DEFAULT_CHART_PLATFORMS (traditional social media; see
  // platform-multiselect.tsx), computed offline from
  // public/data/platform_rates.json (metric=usage_rate, weighted):
  //
  //   slug         W1 -> W6 (diff)    1.96 * pooled_SE   verdict
  //   ----------------------------------------------------------------
  //   facebook     66.7% -> 64.2%  (-2.48pp)   3.73pp   stable
  //   youtube      66.7% -> 61.9%  (-4.86pp)   3.79pp   DECREASED
  //   instagram    38.0% -> 40.0%  (+1.99pp)   3.67pp   stable
  //   tiktok       26.9% -> 27.2%  (+0.27pp)   3.34pp   stable
  //   snapchat     20.0% -> 18.9%  (-1.07pp)   2.86pp   stable
  //   reddit       11.5% -> 15.5%  (+4.05pp)   2.25pp   INCREASED
  //   linkedin     18.4% -> 13.9%  (-4.48pp)   2.66pp   DECREASED
  //   twitter_x    18.5% -> 13.6%  (-4.91pp)   2.74pp   DECREASED
  //
  // Four of the eight default platforms cross the significance
  // threshold W1->W6 (YouTube, Reddit, LinkedIn, X). Reddit is the
  // only one that increased; the others declined. The remaining four
  // (Facebook, Instagram, TikTok, Snapchat) shifted within the
  // margin of error.
  //
  // [PLACEHOLDER -- Matt to review]: framing rewritten for the new
  // default selection; prior copy described email/text_messaging as
  // the highest-usage tools, which is still true in the underlying
  // data but those tools are no longer in the default chart view.
  const interpretationText =
    'Among the eight traditional social-media platforms in the default view, Facebook and YouTube have the broadest reach across U.S. adults in the most recent wave (W6), with Instagram a clear third. Four platforms show statistically meaningful changes from W1 to W6: YouTube use declined by about 4.9 percentage points, X (Twitter) by 4.9 points, and LinkedIn by 4.5 points, while Reddit grew by 4.1 points (all exceed their 95% margins of error). Facebook, Instagram, TikTok, and Snapchat remained stable across the six waves; any apparent shifts are within the margin of error. Communication utilities such as text messaging and email reach a larger share of U.S. adults than any of these platforms — toggle them on in the Platforms picker to see their trends.';
  const sourceNoteText =
    'Source: UAS panel waves 1–6 (UAS514–UAS519), 2023–2025. ' +
    'Weighted estimates. 95% CIs available on hover (chart line + Numbers table cells). Cells with n < 30 are suppressed by design.';

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

  const controlsContent = (
    <div className="space-y-5">
      <PlatformMultiselect
        platforms={meta.platforms}
        selected={chartPlatforms}
        onToggle={toggleChartPlatform}
        onReset={resetChartPlatforms}
        swatchBySlug={swatchBySlug}
      />
      {yAxisControls}
      {evt.available.length > 0 ? (
        <EventsControl
          events={evt.available}
          hidden={evt.hidden}
          onToggle={evt.toggle}
          onSetAll={evt.setAll}
        />
      ) : null}
    </div>
  );

  const surveyQuestion = formatSurveyQuestion(
    surveyQuestionFor('us001', questionTexts, meta),
  );

  return (
    <StrataChartFrame
      eyebrow="Trends over time"
      title="Who uses what?"
      subtitle={surveyQuestion || undefined}
      titleInCard
      chart={chart}
      chartRef={chartRef}
      controls={controlsContent}
      chartFooter={chartFooter}
      customNumbers={
        <>
          <PlatformWaveTable
            rows={rows}
            meta={meta}
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
      methodologyFootnote=""
      sourceNote={evt.appendContext(sourceNoteText)}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle: 'Who uses what? Platform usage rates',
        variables: ['us001 (platforms_used)'],
        waves: allWaves,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase="strata_platform_usage"
    />
  );
}
