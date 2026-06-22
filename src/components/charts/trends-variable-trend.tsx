'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  ContextualEventsJson,
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
  axisTicks,
  buildPlatformFanData,
  buildRespondentSeries,
  respondentTitle,
  trendConfig,
} from '@/lib/trends-adapters';
import type { AxisAnchor, FurtherReadingLink } from '@/lib/trends-categories';
import { PLATFORM_EXPERIENCES_SCOPE_NOTE } from '@/lib/trends-categories';
import { StrataChartFrame } from './strata-chart-frame';
import {
  DEFAULT_CHART_PLATFORMS,
  MAX_CHART_PLATFORMS,
  PlatformMultiselect,
} from './platform-multiselect';
import { useUrlSync } from '@/lib/use-url-sync';
import {
  encodeTrendsAttitudeState,
  encodeTrendsPlatformState,
  type TrendsYMode,
} from '@/lib/trends-url-state';
import { PlatformWaveTable } from './platform-wave-table';
import {
  AxisAnchorLabels,
  BrokenYAxisIndicator,
  EventLabels,
  EventsControl,
  LineEndLabels,
  PlatformFanTooltip,
  SingleSeriesTooltip,
  YZoomControls,
  makeTwoLineXTick,
  renderEventLines,
  useTrendEvents,
} from './trend-line-bits';

const TwoLineXTick = makeTwoLineXTick(splitWaveLabelLines);
const SINGLE_LINE_COLOR = '#4B2E63'; // plum

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Composes a signed-off interpretation paragraph with an optional
// "Further reading" links line and an optional scope footnote (smaller
// mono, top border). Shared by the Platform-Experiences, Well-Being, and
// Attitudes renderers so the link + footnote styling stays identical.
// `scopeNote` is optional: Platform-Experiences / Well-Being pass a
// platform-set footnote; the Attitudes distribution/by-group views have no
// scope set, so they omit it (passing '' or undefined renders no footnote
// line rather than an empty bordered paragraph).
export function renderPlatformInterpretation(
  text: string,
  scopeNote?: string,
  furtherReading?: FurtherReadingLink[],
): ReactNode {
  return (
    <>
      <p>{text}</p>
      {furtherReading && furtherReading.length > 0 ? (
        <p className="mt-3 text-sm text-slate">
          Further reading:{' '}
          {furtherReading.map((l, i) => (
            <span key={l.href}>
              {i > 0 ? ', ' : ''}
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-mulberry hover:text-plum underline underline-offset-2"
              >
                {l.label}
              </a>
            </span>
          ))}
        </p>
      ) : null}
      {scopeNote ? (
        <p
          className="mt-3 pt-3 border-t border-mist text-xs text-slate leading-relaxed"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {scopeNote}
        </p>
      ) : null}
    </>
  );
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
  events: ContextualEventsJson | null;
  eyebrow: string;
  title: string;
  subtitle?: string;
  sourceNote: string;
  interpretation: ReactNode;
  // Whether to flag the interpretation as provisional ([WORK IN PROGRESS]
  // strip + watermark). Defaults to true so callers that still use
  // templated copy (e.g. Well-Being) keep the caution until their copy is
  // signed off; Platform-Experiences passes false once a question carries
  // hand-authored, significance-gated copy.
  isPlaceholderInterpretation?: boolean;
  filenameBase: string;
  citationVariables: string[];
  // Share feature: category + question (from the orchestrator) are encoded
  // into the URL alongside this chart's platforms + zoom slice.
  category: string;
  questionKey: string;
  initialPlatforms?: string[];
  initialYMode?: TrendsYMode;
  initialCustomMin?: number;
  initialCustomMax?: number;
}

export function PlatformFanChart({
  meta,
  rows,
  events,
  eyebrow,
  title,
  subtitle,
  sourceNote,
  interpretation,
  isPlaceholderInterpretation = true,
  filenameBase,
  citationVariables,
  category,
  questionKey,
  initialPlatforms,
  initialYMode,
  initialCustomMin,
  initialCustomMax,
}: PlatformFanChartProps) {
  const [chartPlatforms, setChartPlatforms] = useState<string[]>(() =>
    initialPlatforms ? [...initialPlatforms] : [...DEFAULT_CHART_PLATFORMS],
  );
  const [yMode, setYMode] = useState<'full' | 'fit' | 'custom'>(
    initialYMode ?? 'full',
  );
  const [customMin, setCustomMin] = useState(initialCustomMin ?? 0);
  const [customMax, setCustomMax] = useState(initialCustomMax ?? 100);
  const chartRef = useRef<HTMLDivElement | null>(null);

  // Two-way URL sync (share feature): category + question come from the
  // orchestrator; platforms + zoom are this chart's own state.
  useUrlSync(
    encodeTrendsPlatformState(
      category,
      questionKey,
      chartPlatforms,
      yMode,
      customMin,
      customMax,
    ),
  );

  const labelBySlug = new Map(meta.platforms.map((p) => [p.slug, p.label]));
  const chartData = buildPlatformFanData(rows, meta, chartPlatforms);

  const presentWaves = [...new Set(rows.map((r) => r.wave))];
  const evt = useTrendEvents(events, meta, presentWaves);
  const fullSourceNote = evt.appendContext(sourceNote);

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
            slugs={chartPlatforms}
            chartData={chartData}
            swatchBySlug={swatchBySlug}
            labelBySlug={labelBySlug}
          />
          <EventLabels events={evt.visible} baseOffset={10} />
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
      enableShare
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
      isPlaceholderInterpretation={isPlaceholderInterpretation}
      interpretation={interpretation}
      methodologyFootnote=""
      sourceNote={fullSourceNote}
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
  events: ContextualEventsJson | null;
  metric: string;
  surveyVar: string;
  title: string;
  // Signed-off, significance-gated copy from the question config. When
  // present it renders verbatim and clears the placeholder flag; when
  // absent the templated [WORK IN PROGRESS] fallback below is used.
  interpretation?: string;
  filenameBase: string;
  category: string;
  questionKey: string;
  initialPlatforms?: string[];
  initialYMode?: TrendsYMode;
  initialCustomMin?: number;
  initialCustomMax?: number;
}

export function PlatformMetricTrend({
  meta,
  questionTexts,
  events,
  metric,
  surveyVar,
  title,
  interpretation,
  filenameBase,
  category,
  questionKey,
  initialPlatforms,
  initialYMode,
  initialCustomMin,
  initialCustomMax,
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

  const allWaves = meta.waves.map((w) => w.wave);
  const subtitle = formatSurveyQuestion(
    surveyQuestionFor(surveyVar, questionTexts, meta),
  );
  const sourceNote =
    `Source: UAS panel waves ${Math.min(...allWaves)}–${Math.max(
      ...allWaves,
    )}, 2023–2025. Weighted estimates among each platform’s users. ` +
    '95% CIs available on hover. Cells with n < 30 are suppressed by ' +
    'design.';

  // Signed-off copy renders verbatim, followed by the scope footnote that
  // states which platforms the superlatives compare. Absent signed-off
  // copy, fall back to a provisional templated line and keep the
  // [WORK IN PROGRESS] flag (no footnote).
  const interpretationNode: ReactNode = interpretation
    ? renderPlatformInterpretation(interpretation, PLATFORM_EXPERIENCES_SCOPE_NOTE)
    : `[WORK IN PROGRESS] ${title} over time, by platform. Each line is the weighted % of that platform's users reporting this, wave by wave; the table and tooltip carry the 95% CIs and user counts.`;

  return (
    <PlatformFanChart
      meta={meta}
      rows={rows}
      events={events}
      eyebrow="Trends over time · Platform experiences"
      title={title}
      subtitle={subtitle || undefined}
      sourceNote={sourceNote}
      interpretation={interpretationNode}
      isPlaceholderInterpretation={interpretation == null}
      filenameBase={filenameBase}
      citationVariables={[surveyVar]}
      category={category}
      questionKey={questionKey}
      initialPlatforms={initialPlatforms}
      initialYMode={initialYMode}
      initialCustomMin={initialCustomMin}
      initialCustomMax={initialCustomMax}
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
  events: ContextualEventsJson | null;
  variableName: string;
  filenameBase: string;
  axisAnchors?: AxisAnchor[];
  category: string;
  questionKey: string;
  initialYMode?: TrendsYMode;
  initialCustomMin?: number;
  initialCustomMax?: number;
}

export function RespondentTrend({
  meta,
  trends,
  questionTexts,
  events,
  variableName,
  filenameBase,
  axisAnchors,
  category,
  questionKey,
  initialYMode,
  initialCustomMin,
  initialCustomMax,
}: RespondentTrendProps) {
  const metaVar = meta.variables.find(
    (v) => v.variable_name === variableName,
  );
  const config = trendConfig(metaVar?.response_type ?? '', false);
  const numericFull: [number, number] =
    config.yDomain === 'fit' ? [0, 100] : config.yDomain;

  const [yMode, setYMode] = useState<'full' | 'fit' | 'custom'>(
    initialYMode ?? 'full',
  );
  const [customMin, setCustomMin] = useState(
    initialCustomMin ?? (config.isPercent ? 0 : numericFull[0]),
  );
  const [customMax, setCustomMax] = useState(
    initialCustomMax ?? (config.isPercent ? 100 : numericFull[1]),
  );
  const chartRef = useRef<HTMLDivElement | null>(null);

  // Two-way URL sync (share feature): attitude renderers have no platform
  // dimension, so only category + question + zoom are encoded.
  useUrlSync(
    encodeTrendsAttitudeState(
      category,
      questionKey,
      yMode,
      customMin,
      customMax,
    ),
  );

  const series = buildRespondentSeries(
    trends,
    variableName,
    config.mode,
    'agree',
    meta,
  );
  const evt = useTrendEvents(events, meta, series.map((p) => p.wave));

  if (!metaVar) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Variable “{variableName}” is not in the metadata.</p>
      </div>
    );
  }

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
    `available on hover. Cells with n < 30 are suppressed by design.`;
  const fullSourceNote = evt.appendContext(sourceNote);
  const interpretation = `[WORK IN PROGRESS] ${title} over time. ${
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
            ticks={config.isPercent ? undefined : axisTicks(yDomain)}
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
          {renderEventLines(evt.refLines)}
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
          {axisAnchors ? (
            <AxisAnchorLabels anchors={axisAnchors} visible={!isZoomed} />
          ) : null}
          <EventLabels
            events={evt.visible}
            baseOffset={axisAnchors ? 24 : 10}
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
      enableShare
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
      sourceNote={fullSourceNote}
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
