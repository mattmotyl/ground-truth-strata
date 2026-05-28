'use client';

import { useEffect, useRef, useState } from 'react';
import {
  loadMeta,
  loadPlatformRates,
  loadQuestionTexts,
  type QuestionTextsJson,
} from '@/lib/strata-data';
import type {
  LikertBucket,
  MetaJson,
  PlatformRateRow,
} from '@/lib/strata-types';
import {
  availableWavesForMetric,
  comparisonColorScaleMax,
  magnitudeColor,
  platformRatesToSeries,
  type ComparisonSeries,
} from '@/lib/compare-adapters';
import {
  COMPARE_THEMES,
  getTheme,
  type CompareQuestion,
  type ThemeId,
} from '@/lib/compare-themes';
import { STRATA_PALETTES } from '@/lib/strata-charts';
import {
  formatCI,
  formatN,
  formatPercent,
  fullWaveLabel,
} from '@/lib/strata-formatters';
import {
  formatSurveyQuestion,
  surveyQuestionFor,
} from '@/lib/strata-survey';
import {
  CompareRankedBar,
  type RankedBarColoring,
} from '@/components/charts/compare-ranked-bar';
import { StrataChartFrame } from '@/components/charts/strata-chart-frame';
import {
  DEFAULT_CHART_PLATFORMS,
  PlatformMultiselect,
} from '@/components/charts/platform-multiselect';
import { type StatRow } from '@/components/charts/numbers-meaning-block';
import { TwoStepPicker } from './two-step-picker';

// Solid bar colors for the response-type-driven Theme B charts.
const AGREE_COLOR = '#4B2E63'; // plum
const DISAGREE_COLOR = '#FFC107'; // amber

type ResponseType = 'agree' | 'disagree';

// Resolve a question's abstract coloring intent to a concrete fill,
// given the live response type. Magnitude themes map to the warm/cool
// palettes; response-type themes are solid plum (agree) / amber (disagree).
function resolveColoring(
  question: CompareQuestion,
  responseType: ResponseType,
): RankedBarColoring {
  if (question.coloring.mode === 'magnitude') {
    return {
      mode: 'magnitude',
      scale:
        question.coloring.scale === 'warm'
          ? STRATA_PALETTES.harm
          : STRATA_PALETTES.positive,
    };
  }
  return {
    mode: 'solid',
    color: responseType === 'agree' ? AGREE_COLOR : DISAGREE_COLOR,
  };
}

// X-axis caption per the spec's axis-label table (lines 806-813). Theme
// C loneliness and Theme D arrive in Part 2.
function axisLabelFor(
  question: CompareQuestion,
  responseType: ResponseType,
): string {
  if (question.responseTypeApplies) {
    return responseType === 'agree' ? '% who agree' : '% who disagree';
  }
  return '% of platform users reporting this';
}

// Per-platform swatch colors that mirror CompareRankedBar's fills, for
// the Numbers-block + multiselect. Pure helper (kept out of the
// component so the React Compiler memoizes the component cleanly).
function buildSwatches(
  series: ComparisonSeries,
  coloring: RankedBarColoring,
  colorScaleMax: number,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of series) {
    if (d.suppressed || d.value === null) continue;
    const color =
      coloring.mode === 'solid'
        ? coloring.color
        : magnitudeColor(d.value, colorScaleMax, coloring.scale);
    map.set(d.platform_slug, color);
  }
  return map;
}

// X-axis domain (proportions). full = [0,1]; fit = ±5pp around the
// visible CI envelope, clamped to [0,1]; custom = user min/max.
function computeXDomain(
  xMode: 'full' | 'fit' | 'custom',
  customMin: number,
  customMax: number,
  series: ComparisonSeries,
): [number, number] {
  if (xMode === 'full') return [0, 1];
  if (xMode === 'custom') {
    const lo = Math.max(0, Math.min(100, customMin)) / 100;
    const hi = Math.max(0, Math.min(100, customMax)) / 100;
    if (hi <= lo) return [0, 1];
    return [lo, hi];
  }
  const vis = series.filter((d) => !d.suppressed && d.value !== null);
  if (vis.length === 0) return [0, 1];
  let min = Infinity;
  let max = -Infinity;
  for (const d of vis) {
    const lo = d.ciLow ?? (d.value as number);
    const hi = d.ciHigh ?? (d.value as number);
    if (lo < min) min = lo;
    if (hi > max) max = hi;
  }
  if (min === Infinity) return [0, 1];
  return [
    Math.max(0, Math.floor((min - 0.05) * 100) / 100),
    Math.min(1, Math.ceil((max + 0.05) * 100) / 100),
  ];
}

const EYEBROW = 'text-xs text-slate uppercase tracking-wide';

export function CompareExplorer() {
  const [theme, setTheme] = useState<ThemeId>('A');
  const [questionKey, setQuestionKey] = useState<string>(
    () => getTheme('A').questions[0].key,
  );
  // Platform selection PERSISTS across theme/question switches (spec
  // line 790) — it's owned here, never reset by handleThemeChange.
  const [platforms, setPlatforms] = useState<string[]>(() => [
    ...DEFAULT_CHART_PLATFORMS,
  ]);
  const [wave, setWave] = useState<number>(6);
  const [responseType, setResponseType] = useState<ResponseType>('agree');
  const [xMode, setXMode] = useState<'full' | 'fit' | 'custom'>('full');
  const [customMin, setCustomMin] = useState<number>(0);
  const [customMax, setCustomMax] = useState<number>(100);

  const [allRows, setAllRows] = useState<PlatformRateRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [questionTexts, setQuestionTexts] =
    useState<QuestionTextsJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([loadPlatformRates(), loadMeta(), loadQuestionTexts()])
      .then(([rows, m, qt]) => {
        setAllRows(rows);
        setMeta(m);
        setQuestionTexts(qt);
      })
      .catch(setError);
  }, []);

  const activeTheme = getTheme(theme);
  const activeQuestion =
    activeTheme.questions.find((q) => q.key === questionKey) ??
    activeTheme.questions[0];

  // Theme A → continuous rows (bucket null); Theme B → the selected
  // response-type bucket.
  const bucket: LikertBucket | null = activeQuestion.responseTypeApplies
    ? responseType
    : null;
  const metric = activeQuestion.metric!;

  // Derived values are plain consts — the React Compiler memoizes them.
  // (Manual useMemo on deps derived from activeQuestion trips the
  // compiler's preserve-manual-memoization rule, so we let it optimize.)
  const labelBySlug = meta
    ? new Map(meta.platforms.map((p) => [p.slug, p.label]))
    : new Map<string, string>();

  const availableWaves = allRows
    ? availableWavesForMetric(allRows, metric, bucket)
    : [];

  // Clamp the displayed wave to one the current question was asked in,
  // without mutating `wave` state — so flipping back to a theme with the
  // original wave restores it (same pattern as the legacy ranked bar).
  const effectiveWave =
    availableWaves.length === 0
      ? wave
      : availableWaves.includes(wave)
        ? wave
        : availableWaves[availableWaves.length - 1];

  const platformsSet = new Set(platforms);

  const series: ComparisonSeries = allRows
    ? platformRatesToSeries(
        allRows,
        metric,
        effectiveWave,
        bucket,
        platformsSet,
        labelBySlug,
      )
    : [];

  const coloring = resolveColoring(activeQuestion, responseType);
  const axisLabel = axisLabelFor(activeQuestion, responseType);

  // Swatch per displayed platform — matches CompareRankedBar fills.
  const colorScaleMax = comparisonColorScaleMax(series);
  const swatchBySlug = buildSwatches(series, coloring, colorScaleMax);

  const xDomain = computeXDomain(xMode, customMin, customMax, series);
  const isZoomed = xMode !== 'full';

  // ── handlers ───────────────────────────────────────────────────────
  const handleThemeChange = (id: ThemeId) => {
    setTheme(id);
    // Reset to the new theme's first question; platforms / wave /
    // responseType persist.
    const first = getTheme(id).questions[0];
    if (first) setQuestionKey(first.key);
  };
  const togglePlatform = (slug: string) => {
    setPlatforms((curr) =>
      curr.includes(slug) ? curr.filter((s) => s !== slug) : [...curr, slug],
    );
  };
  const resetPlatforms = () => setPlatforms([...DEFAULT_CHART_PLATFORMS]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load platform-rate data: {error.message}</p>
      </div>
    );
  }

  const ready = allRows && meta;

  // Picker renders immediately; the chart frame waits for data.
  return (
    <>
      <TwoStepPicker
        themes={COMPARE_THEMES}
        activeTheme={theme}
        activeQuestion={activeQuestion.key}
        onThemeChange={handleThemeChange}
        onQuestionChange={setQuestionKey}
      />
      {!ready ? (
        <div
          className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Loading platform-comparison data…
        </div>
      ) : (
        <CompareChart
          meta={meta}
          questionTexts={questionTexts}
          activeThemeLabel={activeTheme.label}
          question={activeQuestion}
          series={series}
          coloring={coloring}
          axisLabel={axisLabel}
          xDomain={xDomain}
          isZoomed={isZoomed}
          effectiveWave={effectiveWave}
          availableWaves={availableWaves}
          swatchBySlug={swatchBySlug}
          chartRef={chartRef}
          // controls state + setters
          platforms={platforms}
          onTogglePlatform={togglePlatform}
          onResetPlatforms={resetPlatforms}
          wave={effectiveWave}
          onWaveChange={setWave}
          responseType={responseType}
          onResponseTypeChange={setResponseType}
          xMode={xMode}
          onXModeChange={setXMode}
          customMin={customMin}
          customMax={customMax}
          onCustomMin={setCustomMin}
          onCustomMax={setCustomMax}
        />
      )}
    </>
  );
}

// ── chart sub-view (only rendered once data is ready) ────────────────

interface CompareChartProps {
  meta: MetaJson;
  questionTexts: QuestionTextsJson | null;
  activeThemeLabel: string;
  question: CompareQuestion;
  series: ReturnType<typeof platformRatesToSeries>;
  coloring: RankedBarColoring;
  axisLabel: string;
  xDomain: [number, number];
  isZoomed: boolean;
  effectiveWave: number;
  availableWaves: number[];
  swatchBySlug: ReadonlyMap<string, string>;
  chartRef: React.RefObject<HTMLDivElement | null>;
  platforms: string[];
  onTogglePlatform: (slug: string) => void;
  onResetPlatforms: () => void;
  wave: number;
  onWaveChange: (w: number) => void;
  responseType: ResponseType;
  onResponseTypeChange: (r: ResponseType) => void;
  xMode: 'full' | 'fit' | 'custom';
  onXModeChange: (m: 'full' | 'fit' | 'custom') => void;
  customMin: number;
  customMax: number;
  onCustomMin: (n: number) => void;
  onCustomMax: (n: number) => void;
}

function CompareChart(props: CompareChartProps) {
  const {
    meta,
    questionTexts,
    activeThemeLabel,
    question,
    series,
    coloring,
    axisLabel,
    xDomain,
    isZoomed,
    effectiveWave,
    availableWaves,
    swatchBySlug,
    chartRef,
    platforms,
    onTogglePlatform,
    onResetPlatforms,
    wave,
    onWaveChange,
    responseType,
    onResponseTypeChange,
    xMode,
    onXModeChange,
    customMin,
    customMax,
    onCustomMin,
    onCustomMax,
  } = props;

  const waveDates =
    meta.waves.find((w) => w.wave === effectiveWave)?.dates ?? '';
  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');

  const surveyQuestion = formatSurveyQuestion(
    surveyQuestionFor(question.variable, questionTexts, meta),
  );

  const subtitle = question.responseTypeApplies
    ? 'Platforms ranked by the share of users in the selected response band. Platform habit & attitude scale; Waves 4–6 only; items are non-validated.'
    : 'Platforms ranked by the share of users who report this experience.';

  // THE NUMBERS — ranked stat list mirroring the chart order.
  const stats: StatRow[] = series.map((d) => {
    if (d.suppressed || d.value === null) {
      return {
        key: d.platform_slug,
        label: d.label,
        value: 'Suppressed',
        sub: 'n < 30',
      };
    }
    return {
      key: d.platform_slug,
      label: d.label,
      value: formatPercent(d.value),
      sub: `${formatCI(d.ciLow, d.ciHigh)} · n=${formatN(d.n)}`,
      swatch: swatchBySlug.get(d.platform_slug),
    };
  });

  const suppressed = series.filter((d) => d.suppressed).map((d) => d.label);
  const suppressedNote =
    suppressed.length > 0 ? ` (this wave: ${suppressed.join(', ')})` : '';
  const habitNote = question.responseTypeApplies
    ? ' Platform habit/attitude scale, Waves 4–6 only; items are non-validated.'
    : '';
  const methodologyFootnote = `Source: UAS panel ${fullWaveLabel(
    effectiveWave,
    waveDates,
  )}. Weighted estimates. 95% CIs shown as error bars at bar tips and in the hover tooltip. n shown in tooltip is the count of platform users.${habitNote} Cells with n < 30 are suppressed by design${suppressedNote}. Precomputed JSON generated ${generatedAt}.`;

  // CSV — the displayed wave's series.
  const csvHeaders = [
    'platform_slug',
    'platform_label',
    'wave',
    'wave_dates',
    'variable',
    'response_band',
    'weighted_value',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'n',
    'suppressed',
  ];
  const csvRows: unknown[][] = series.map((d) => [
    d.platform_slug,
    d.label,
    effectiveWave,
    waveDates,
    question.variable,
    question.responseTypeApplies ? responseType : '',
    d.value,
    d.ciLow,
    d.ciHigh,
    d.n,
    d.suppressed,
  ]);

  // ── controls aside ───────────────────────────────────────────────
  const waveSelector = (
    <div className="space-y-2">
      <p className={EYEBROW} style={{ fontFamily: 'var(--font-mono)' }}>
        Wave
      </p>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="sr-only">Select wave</legend>
        {availableWaves.map((w) => {
          const dates = meta.waves.find((mw) => mw.wave === w)?.dates ?? '';
          return (
            <label key={w} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="compare-wave"
                value={w}
                checked={wave === w}
                onChange={() => onWaveChange(w)}
                className="accent-plum"
              />
              <span
                className={wave === w ? 'text-ink' : 'text-slate'}
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

  const responseTypeSelector = question.responseTypeApplies ? (
    <div className="space-y-2">
      <p className={EYEBROW} style={{ fontFamily: 'var(--font-mono)' }}>
        Response type
      </p>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="sr-only">Select response type</legend>
        {(['agree', 'disagree'] as const).map((rt) => (
          <label key={rt} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="compare-response-type"
              value={rt}
              checked={responseType === rt}
              onChange={() => onResponseTypeChange(rt)}
              className="accent-plum"
            />
            <span
              className={responseType === rt ? 'text-ink' : 'text-slate'}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {rt === 'agree' ? '% who agree' : '% who disagree'}
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  ) : null;

  const xAxisControls = (
    <div className="space-y-2">
      <p className={EYEBROW} style={{ fontFamily: 'var(--font-mono)' }}>
        X axis
      </p>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="sr-only">X axis zoom mode</legend>
        {(['full', 'fit', 'custom'] as const).map((mode) => (
          <label key={mode} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="compare-x-mode"
              value={mode}
              checked={xMode === mode}
              onChange={() => onXModeChange(mode)}
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
              onChange={(e) => onCustomMin(Number(e.target.value))}
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
              onChange={(e) => onCustomMax(Number(e.target.value))}
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
        selected={platforms}
        onToggle={onTogglePlatform}
        onReset={onResetPlatforms}
        swatchBySlug={swatchBySlug}
      />
      {waveSelector}
      {responseTypeSelector}
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
        onClick={() => onXModeChange('full')}
        className="text-mulberry hover:text-plum underline-offset-2 hover:underline"
      >
        Reset to full range
      </button>
    </div>
  ) : null;

  return (
    <StrataChartFrame
      eyebrow={`Compare · ${activeThemeLabel}`}
      title={question.title}
      subtitle={subtitle}
      surveyQuestion={surveyQuestion || undefined}
      chart={
        <CompareRankedBar
          series={series}
          coloring={coloring}
          xDomain={xDomain}
          isZoomed={isZoomed}
          axisLabel={axisLabel}
        />
      }
      chartRef={chartRef}
      controls={controlsAside}
      chartFooter={chartFooter}
      stats={stats}
      isPlaceholderInterpretation
      interpretation="[PLACEHOLDER -- Matt to review] Ranked comparison across platforms for the selected wave. Interpretation copy is intentionally omitted in Part 1 — the chart and THE NUMBERS show the ranked weighted estimates with 95% CIs."
      methodologyFootnote={methodologyFootnote}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle: question.title,
        variables: [question.variable],
        waves: availableWaves,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={`compare-${question.key}`}
    />
  );
}
