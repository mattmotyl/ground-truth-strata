'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  loadPlatformRates,
  type QuestionTextsJson,
} from '@/lib/strata-data';
import type {
  MetaJson,
  PlatformRateRow,
  TrendRow,
} from '@/lib/strata-types';
import { isPlatformRateBucketRow } from '@/lib/strata-types';
import {
  CHART_FONTS,
  CHART_HEIGHTS,
  STRATA_PALETTES,
  strokeDashForIndex,
} from '@/lib/strata-charts';
import {
  formatCI,
  formatN,
  formatNumber,
  formatPercent,
  splitWaveLabelLines,
} from '@/lib/strata-formatters';
import {
  formatSurveyQuestion,
  surveyQuestionFor,
} from '@/lib/strata-survey';
import {
  buildPairedSeries,
  buildPlatformFanData,
  buildRespondentSeries,
  respondentTitle,
  trendConfig,
} from '@/lib/trends-adapters';
import { StrataChartFrame } from './strata-chart-frame';
import {
  DEFAULT_CHART_PLATFORMS,
  MAX_CHART_PLATFORMS,
  PlatformMultiselect,
} from './platform-multiselect';
import { PlatformWaveTable } from './platform-wave-table';
import {
  BrokenYAxisIndicator,
  LineEndLabels,
  PlatformFanTooltip,
  SingleSeriesTooltip,
  YZoomControls,
  makeTwoLineXTick,
} from './trend-line-bits';

const TwoLineXTick = makeTwoLineXTick(splitWaveLabelLines);
const SINGLE_LINE_COLOR = '#4B2E63'; // plum

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// =====================================================================
// PlatformFanChart — generic multi-line-by-platform chart (percent Y).
// Shared by Platform-Experiences (platform_rates) and Well-Being
// (group_comparisons reshaped to PlatformRateRow). Owns the platform
// multiselect + Y-zoom; the caller supplies pre-filtered rows + copy.
// =====================================================================

interface PlatformFanChartProps {
  meta: MetaJson;
  rows: PlatformRateRow[]; // one metric/outcome, all platforms, all waves
  eyebrow: string;
  title: string;
  subtitle?: string;
  sourceNote: string;
  interpretation: string;
  filenameBase: string;
  citationVariables: string[];
}

export function PlatformFanChart({
  meta,
  rows,
  eyebrow,
  title,
  subtitle,
  sourceNote,
  interpretation,
  filenameBase,
  citationVariables,
}: PlatformFanChartProps) {
  const [chartPlatforms, setChartPlatforms] = useState<string[]>(() => [
    ...DEFAULT_CHART_PLATFORMS,
  ]);
  const [yMode, setYMode] = useState<'full' | 'fit' | 'custom'>('full');
  const [customMin, setCustomMin] = useState(0);
  const [customMax, setCustomMax] = useState(100);
  const chartRef = useRef<HTMLDivElement | null>(null);

  const labelBySlug = new Map(meta.platforms.map((p) => [p.slug, p.label]));
  const chartData = buildPlatformFanData(rows, meta, chartPlatforms);

  const swatchBySlug = new Map<string, string>();
  const dashBySlug = new Map<string, string | undefined>();
  chartPlatforms.forEach((slug, i) => {
    swatchBySlug.set(
      slug,
      STRATA_PALETTES.qualitative16[i % STRATA_PALETTES.qualitative16.length],
    );
    dashBySlug.set(slug, strokeDashForIndex(i));
  });

  const yDomain: [number, number] = (() => {
    if (yMode === 'full') return [0, 1];
    if (yMode === 'custom') {
      const lo = clamp01(customMin / 100);
      const hi = clamp01(customMax / 100);
      return hi > lo ? [lo, hi] : [0, 1];
    }
    let min = Infinity;
    let max = -Infinity;
    for (const r of rows) {
      if (!chartPlatforms.includes(r.platform_slug)) continue;
      if (r.suppressed || r.weighted_value === null) continue;
      min = Math.min(min, r.weighted_value);
      max = Math.max(max, r.weighted_value);
    }
    if (min === Infinity) return [0, 1];
    return [
      Math.max(0, Math.floor((min - 0.05) * 100) / 100),
      Math.min(1, Math.ceil((max + 0.05) * 100) / 100),
    ];
  })();
  const isZoomed = yMode !== 'full';

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
              <PlatformFanTooltip
                {...props}
                labelBySlug={labelBySlug}
                formatValue={(v) => formatPercent(v)}
              />
            )}
          />
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
            slugs={chartPlatforms}
            chartData={chartData}
            swatchBySlug={swatchBySlug}
            labelBySlug={labelBySlug}
          />
          <BrokenYAxisIndicator visible={isZoomed} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const controls = (
    <div className="space-y-5">
      <PlatformMultiselect
        platforms={meta.platforms}
        selected={chartPlatforms}
        onToggle={(slug) =>
          setChartPlatforms((curr) =>
            curr.includes(slug)
              ? curr.filter((s) => s !== slug)
              : curr.length >= MAX_CHART_PLATFORMS
                ? curr
                : [...curr, slug],
          )
        }
        onReset={() => setChartPlatforms([...DEFAULT_CHART_PLATFORMS])}
        swatchBySlug={swatchBySlug}
      />
      <YZoomControls
        mode={yMode}
        onMode={setYMode}
        customMin={customMin}
        customMax={customMax}
        onCustomMin={setCustomMin}
        onCustomMax={setCustomMax}
        isPercent
        fullLabel="Full range (0–100%)"
      />
    </div>
  );

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

  return (
    <StrataChartFrame
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle || undefined}
      titleInCard
      chart={chart}
      chartRef={chartRef}
      controls={controls}
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
            Table covers all platforms across the survey waves. Hover any
            cell for its 95% confidence interval and user count.
          </p>
        </>
      }
      isPlaceholderInterpretation
      interpretation={interpretation}
      methodologyFootnote=""
      sourceNote={sourceNote}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle: title,
        variables: citationVariables,
        waves: allWaves,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={filenameBase}
    />
  );
}

// =====================================================================
// PlatformMetricTrend — Platform-Experiences wrapper. Loads
// platform_rates.json, filters to one rate metric, renders the fan.
// =====================================================================

interface PlatformMetricTrendProps {
  meta: MetaJson;
  questionTexts: QuestionTextsJson | null;
  metric: string;
  surveyVar: string;
  title: string;
  filenameBase: string;
}

export function PlatformMetricTrend({
  meta,
  questionTexts,
  metric,
  surveyVar,
  title,
  filenameBase,
}: PlatformMetricTrendProps) {
  const [rows, setRows] = useState<PlatformRateRow[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    loadPlatformRates()
      .then((all) => {
        if (!active) return;
        setRows(
          all.filter(
            (r) => r.metric === metric && !isPlatformRateBucketRow(r),
          ),
        );
      })
      .catch((e) => active && setError(e));
    return () => {
      active = false;
    };
  }, [metric]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load platform-experience data: {error.message}</p>
      </div>
    );
  }
  if (!rows) {
    return (
      <div
        className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Loading data…
      </div>
    );
  }

  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');
  const allWaves = meta.waves.map((w) => w.wave);
  const subtitle = formatSurveyQuestion(
    surveyQuestionFor(surveyVar, questionTexts, meta),
  );
  const sourceNote =
    `Source: UAS panel waves ${Math.min(...allWaves)}–${Math.max(
      ...allWaves,
    )}, 2023–2025. Weighted estimates among each platform’s users. ` +
    '95% CIs available on hover. Cells with n < 30 are suppressed by ' +
    `design. Precomputed JSON generated ${generatedAt}.`;

  return (
    <PlatformFanChart
      meta={meta}
      rows={rows}
      eyebrow="Trends over time · Platform experiences"
      title={title}
      subtitle={subtitle || undefined}
      sourceNote={sourceNote}
      interpretation={`[PLACEHOLDER -- Matt to review] ${title} over time, by platform. Each line is the weighted % of that platform's users reporting this, wave by wave; the table and tooltip carry the 95% CIs and user counts.`}
      filenameBase={filenameBase}
      citationVariables={[surveyVar]}
    />
  );
}

// =====================================================================
// RespondentTrend — Attitudes single-line (trends.json mean/rate). No
// platform dimension, no band selector (bucketed wellbeing items are
// handled by the Well-Being category instead).
// =====================================================================

interface RespondentTrendProps {
  meta: MetaJson;
  trends: TrendRow[];
  questionTexts: QuestionTextsJson | null;
  variableName: string;
  filenameBase: string;
  scaleNote?: string;
}

export function RespondentTrend({
  meta,
  trends,
  questionTexts,
  variableName,
  filenameBase,
  scaleNote,
}: RespondentTrendProps) {
  const metaVar = meta.variables.find(
    (v) => v.variable_name === variableName,
  );
  const config = trendConfig(metaVar?.response_type ?? '', false);
  const numericFull: [number, number] =
    config.yDomain === 'fit' ? [0, 100] : config.yDomain;

  const [yMode, setYMode] = useState<'full' | 'fit' | 'custom'>('full');
  const [customMin, setCustomMin] = useState(
    config.isPercent ? 0 : numericFull[0],
  );
  const [customMax, setCustomMax] = useState(
    config.isPercent ? 100 : numericFull[1],
  );
  const chartRef = useRef<HTMLDivElement | null>(null);

  if (!metaVar) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Variable “{variableName}” is not in the metadata.</p>
      </div>
    );
  }

  const series = buildRespondentSeries(
    trends,
    variableName,
    config.mode,
    'agree',
    meta,
  );
  const isSingleWave = series.length <= 1;
  const fmtValue: (v: number | null | undefined) => string = config.isPercent
    ? (v) => formatPercent(v)
    : (v) => formatNumber(v, config.meanDigits);
  const values = series
    .map((p) => p.value)
    .filter((v): v is number => v !== null);

  const yDomain: [number, number] = (() => {
    if (config.isPercent) {
      if (yMode === 'full') return [0, 1];
      if (yMode === 'custom') {
        const lo = clamp01(customMin / 100);
        const hi = clamp01(customMax / 100);
        return hi > lo ? [lo, hi] : [0, 1];
      }
      if (!values.length) return [0, 1];
      return [
        Math.max(0, Math.floor((Math.min(...values) - 0.05) * 100) / 100),
        Math.min(1, Math.ceil((Math.max(...values) + 0.05) * 100) / 100),
      ];
    }
    if (yMode === 'custom') {
      return customMax > customMin ? [customMin, customMax] : numericFull;
    }
    if (yMode === 'full' && config.yDomain !== 'fit') return config.yDomain;
    if (!values.length) return numericFull;
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max(0.2, (hi - lo) * 0.1);
    return [lo - pad, hi + pad];
  })();
  const isZoomed = yMode !== 'full';

  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');
  const title = respondentTitle(metaVar);
  const subtitle = formatSurveyQuestion(
    surveyQuestionFor(variableName, questionTexts, meta),
  );
  const waveList = series.map((p) => p.wave);
  const waveClause = isSingleWave
    ? `Available in Wave ${waveList[0] ?? '—'} only. `
    : `UAS panel waves ${Math.min(...waveList)}–${Math.max(...waveList)}. `;
  const sourceNote =
    `Source: ${waveClause}Population-level weighted estimates. 95% CIs ` +
    `available on hover. Cells with n < 30 are suppressed by design. ` +
    `Precomputed JSON generated ${generatedAt}.`;
  const interpretation = `[PLACEHOLDER -- Matt to review] ${title} over time. ${
    isSingleWave
      ? 'Only one survey wave carries this item, so no trend is shown.'
      : 'The line shows the weighted population estimate wave by wave; hover any point for its 95% CI and n.'
  }`;

  const csvHeaders = [
    'variable_name',
    'wave',
    'wave_dates',
    'value',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'n',
    'suppressed',
  ];
  const csvRows: unknown[][] = series.map((p) => [
    variableName,
    p.wave,
    p.waveDates,
    p.value,
    p.ciLo,
    p.ciHi,
    p.n,
    p.value === null,
  ]);

  const chart = (
    <div className="relative">
      <ResponsiveContainer width="100%" height={CHART_HEIGHTS.line}>
        <LineChart
          data={series}
          margin={{ top: 16, right: 24, bottom: 24, left: 8 }}
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
            allowDecimals={config.isPercent}
            tickFormatter={(v) =>
              config.isPercent
                ? `${Math.round((v as number) * 100)}%`
                : formatNumber(v as number, 0)
            }
            stroke="#605A6B"
            fontFamily={CHART_FONTS.mono}
            fontSize={12}
            tickMargin={4}
          />
          <Tooltip
            content={(props) => (
              <SingleSeriesTooltip
                {...props}
                seriesLabel={title}
                color={SINGLE_LINE_COLOR}
                formatValue={fmtValue}
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={SINGLE_LINE_COLOR}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <BrokenYAxisIndicator visible={isZoomed} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const controls = (
    <div className="space-y-5">
      <YZoomControls
        mode={yMode}
        onMode={setYMode}
        customMin={customMin}
        customMax={customMax}
        onCustomMin={setCustomMin}
        onCustomMax={setCustomMax}
        isPercent={config.isPercent}
        fullLabel={
          config.isPercent
            ? 'Full range (0–100%)'
            : config.yDomain === 'fit'
              ? 'Full range (fit to data)'
              : `Full range (${config.yDomain[0]}–${config.yDomain[1]})`
        }
        rawMin={numericFull[0]}
        rawMax={numericFull[1]}
        rawStep={0.1}
      />
    </div>
  );

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

  const numbers = (
    <>
      <table
        className="text-xs w-full border-collapse"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <thead>
          <tr className="text-slate border-b border-mist">
            <th className="text-left font-normal py-2 pr-2">Wave</th>
            <th className="text-right font-normal py-2 px-2">
              {config.isPercent ? '%' : 'Mean'}
            </th>
            <th className="text-right font-normal py-2 px-2">95% CI</th>
            <th className="text-right font-normal py-2 px-2 text-slate">n</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.wave} className="border-b border-mist/60">
              <th
                scope="row"
                className="text-left font-normal py-1.5 pr-2 text-ink"
              >
                Wave {p.wave}
              </th>
              <td className="text-right py-1.5 px-2 text-ink tabular-nums">
                {p.value !== null ? fmtValue(p.value) : '—'}
              </td>
              <td className="text-right py-1.5 px-2 text-slate tabular-nums">
                {p.ciLo !== null && p.ciHi !== null
                  ? formatCI(p.ciLo, p.ciHi, fmtValue)
                  : '—'}
              </td>
              <td className="text-right py-1.5 px-2 text-slate tabular-nums">
                {p.n !== null ? formatN(p.n) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        className="text-xs text-slate italic mt-3"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Hover any chart point for its 95% confidence interval and n.
      </p>
    </>
  );

  return (
    <StrataChartFrame
      eyebrow="Trends over time · Attitudes"
      title={title}
      subtitle={subtitle || undefined}
      titleInCard
      chart={chart}
      chartRef={chartRef}
      controls={controls}
      chartFooter={chartFooter}
      customNumbers={numbers}
      isPlaceholderInterpretation
      interpretation={interpretation}
      methodologyFootnote=""
      sourceNote={sourceNote}
      scaleNote={scaleNote}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle: title,
        variables: [variableName],
        waves: waveList,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={filenameBase}
    />
  );
}

// =====================================================================
// PairedAttitudeTrend — two population lines on one chart (feeling
// thermometers, comfort-with-friends). trends.json mean rows; fixed
// Liberal-blue / Conservative-red colors; no platform multiselect.
// =====================================================================

const PAIR_COLORS: [string, string] = [
  STRATA_PALETTES.political.liberal, // #2196F3 blue
  STRATA_PALETTES.political.conservative, // #F44336 red
];

interface PairedAttitudeTrendProps {
  meta: MetaJson;
  trends: TrendRow[];
  questionTexts: QuestionTextsJson | null;
  pair: [string, string];
  pairLabels: [string, string];
  title: string;
  subtitle?: string;
  filenameBase: string;
  scaleNote?: string;
}

export function PairedAttitudeTrend({
  meta,
  trends,
  questionTexts,
  pair,
  pairLabels,
  title,
  subtitle,
  filenameBase,
  scaleNote,
}: PairedAttitudeTrendProps) {
  const config = trendConfig(
    meta.variables.find((v) => v.variable_name === pair[0])?.response_type ??
      'SCALE_0_10',
    false,
  );
  const numericFull: [number, number] =
    config.yDomain === 'fit' ? [0, 10] : config.yDomain;

  const [yMode, setYMode] = useState<'full' | 'fit' | 'custom'>('full');
  const [customMin, setCustomMin] = useState(numericFull[0]);
  const [customMax, setCustomMax] = useState(numericFull[1]);
  const chartRef = useRef<HTMLDivElement | null>(null);

  const series = buildPairedSeries(trends, pair[0], pair[1], meta);
  const labelByKey = new Map<string, string>([
    [pair[0], pairLabels[0]],
    [pair[1], pairLabels[1]],
  ]);
  const colorByKey = new Map<string, string>([
    [pair[0], PAIR_COLORS[0]],
    [pair[1], PAIR_COLORS[1]],
  ]);
  const fmtValue = (v: number | null | undefined) =>
    formatNumber(v, config.meanDigits);

  const values: number[] = [];
  for (const d of series) {
    for (const k of pair) {
      const v = d[k];
      if (typeof v === 'number') values.push(v);
    }
  }

  const yDomain: [number, number] = (() => {
    if (yMode === 'full') return numericFull;
    if (yMode === 'custom') {
      return customMax > customMin ? [customMin, customMax] : numericFull;
    }
    if (!values.length) return numericFull;
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max(0.2, (hi - lo) * 0.1);
    return [lo - pad, hi + pad];
  })();
  const isZoomed = yMode !== 'full';

  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');
  const subtitleText =
    subtitle ??
    formatSurveyQuestion(surveyQuestionFor(pair[0], questionTexts, meta));
  const waveList = series.map((p) => p.wave);
  const sourceNote =
    `Source: UAS panel waves ${
      waveList.length ? Math.min(...waveList) : '—'
    }–${waveList.length ? Math.max(...waveList) : '—'}. ` +
    'Population-level weighted means. 95% CIs available on hover. ' +
    `Precomputed JSON generated ${generatedAt}.`;

  const csvHeaders = [
    'wave',
    'wave_dates',
    `${pair[0]}_mean`,
    `${pair[0]}_ci_lower`,
    `${pair[0]}_ci_upper`,
    `${pair[1]}_mean`,
    `${pair[1]}_ci_lower`,
    `${pair[1]}_ci_upper`,
  ];
  const csvRows: unknown[][] = series.map((d) => [
    d.wave,
    d.waveDates,
    d[pair[0]],
    d[`${pair[0]}_ci_lo`],
    d[`${pair[0]}_ci_hi`],
    d[pair[1]],
    d[`${pair[1]}_ci_lo`],
    d[`${pair[1]}_ci_hi`],
  ]);

  const chart = (
    <div className="relative">
      <ResponsiveContainer width="100%" height={CHART_HEIGHTS.line}>
        <LineChart
          data={series}
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
            allowDecimals={false}
            tickFormatter={(v) => formatNumber(v as number, 0)}
            stroke="#605A6B"
            fontFamily={CHART_FONTS.mono}
            fontSize={12}
            tickMargin={4}
          />
          <Tooltip
            content={(props) => (
              <PlatformFanTooltip
                {...props}
                labelBySlug={labelByKey}
                formatValue={fmtValue}
              />
            )}
          />
          {pair.map((k) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={colorByKey.get(k)}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
          <LineEndLabels
            slugs={[...pair]}
            chartData={series}
            swatchBySlug={colorByKey}
            labelBySlug={labelByKey}
          />
          <BrokenYAxisIndicator visible={isZoomed} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const legend = (
    <div
      className="flex items-center justify-center gap-4 text-xs mt-2"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {pair.map((k) => (
        <span key={k} className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: colorByKey.get(k) }}
          />
          <span className="text-ink">{labelByKey.get(k)}</span>
        </span>
      ))}
    </div>
  );

  const controls = (
    <div className="space-y-5">
      <YZoomControls
        mode={yMode}
        onMode={setYMode}
        customMin={customMin}
        customMax={customMax}
        onCustomMin={setCustomMin}
        onCustomMax={setCustomMax}
        isPercent={false}
        fullLabel={`Full range (${numericFull[0]}–${numericFull[1]})`}
        rawMin={numericFull[0]}
        rawMax={numericFull[1]}
        rawStep={0.5}
      />
    </div>
  );

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

  const numbers = (
    <table
      className="text-xs w-full border-collapse"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <thead>
        <tr className="text-slate border-b border-mist">
          <th className="text-left font-normal py-2 pr-2">Wave</th>
          {pair.map((k) => (
            <th key={k} className="text-right font-normal py-2 px-2">
              <span className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: colorByKey.get(k) }}
                />
                {labelByKey.get(k)}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {series.map((d) => (
          <tr key={d.wave} className="border-b border-mist/60">
            <th
              scope="row"
              className="text-left font-normal py-1.5 pr-2 text-ink"
            >
              Wave {d.wave}
            </th>
            {pair.map((k) => {
              const v = d[k];
              return (
                <td
                  key={k}
                  className="text-right py-1.5 px-2 text-ink tabular-nums"
                >
                  {typeof v === 'number' ? fmtValue(v) : '—'}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <StrataChartFrame
      eyebrow="Trends over time · Attitudes"
      title={title}
      subtitle={subtitleText || undefined}
      titleInCard
      chart={
        <>
          {chart}
          {legend}
        </>
      }
      chartRef={chartRef}
      controls={controls}
      chartFooter={chartFooter}
      customNumbers={numbers}
      isPlaceholderInterpretation
      interpretation={`[PLACEHOLDER -- Matt to review] ${title} over time. The two lines compare ${pairLabels[0]} and ${pairLabels[1]} at the population level, wave by wave; hover any point for its 95% CI and n.`}
      methodologyFootnote=""
      sourceNote={sourceNote}
      scaleNote={scaleNote}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle: title,
        variables: [...pair],
        waves: waveList,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={filenameBase}
    />
  );
}
