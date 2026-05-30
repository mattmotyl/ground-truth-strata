'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getPlatformOutcomeComparison,
  loadConditionalBreakdowns,
  loadGroupComparisons,
  loadMeta,
  loadPlatformDemographics,
  loadPlatformGroupComparisons,
  loadPlatformRates,
  loadQuestionTexts,
  type QuestionTextsJson,
} from '@/lib/strata-data';
import type {
  ConditionalBreakdownRow,
  GroupComparisonRow,
  LikertBucket,
  MetaJson,
  PlatformDemographicRow,
  PlatformGroupComparisonRow,
  PlatformRateRow,
} from '@/lib/strata-types';
import {
  availableWavesForConstruct,
  availableWavesForDemographic,
  availableWavesForMetric,
  availableWavesForOutcome,
  availableWavesForPlatformGroup,
  comparisonColorScaleMax,
  conditionalBreakdownsToHeatmap,
  magnitudeColor,
  platformDemographicsToStacked,
  platformGroupComparisonsToGrouped,
  platformOutcomeToSeries,
  platformRatesToSeries,
  type ComparisonSeries,
  type GroupDef,
  type GroupedOverall,
  type GroupedSeries,
  type HeatmapData,
  type StackedSeries,
} from '@/lib/compare-adapters';
import {
  BREAKDOWN_DEMOGRAPHICS,
  COMPARE_THEMES,
  DEMOGRAPHIC_CONFIGS,
  getTheme,
  type CompareQuestion,
  type FollowUp,
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
import {
  CompareStackedBar,
  type StackSegmentDef,
} from '@/components/charts/compare-stacked-bar';
import { CompareGroupedBar } from '@/components/charts/compare-grouped-bar';
import { CompareHeatmap } from '@/components/charts/compare-heatmap';
import { StrataChartFrame } from '@/components/charts/strata-chart-frame';
import {
  DEFAULT_CHART_PLATFORMS,
  PlatformMultiselect,
} from '@/components/charts/platform-multiselect';
import { type StatRow } from '@/components/charts/numbers-meaning-block';
import { TwoStepPicker } from './two-step-picker';

// Solid bar colors.
const AGREE_COLOR = '#4B2E63'; // plum — % agree
const DISAGREE_COLOR = '#FFC107'; // amber — % disagree
// Loneliness binary rate. Intentional warm override (see the override
// note on the ex003_lonely question in compare-themes.ts): loneliness is
// a harm, so it uses amber rather than the cool teal a binary-rate
// convention might suggest.
const LONELY_COLOR = '#FFC107'; // amber

type ResponseType = 'agree' | 'disagree';

// Resolve a question's abstract coloring intent to a concrete fill,
// given the live response type. Magnitude → warm/cool palettes;
// responseType → solid plum (agree) / amber (disagree); binary → amber.
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
  if (question.coloring.mode === 'binary') {
    return { mode: 'solid', color: LONELY_COLOR };
  }
  return {
    mode: 'solid',
    color: responseType === 'agree' ? AGREE_COLOR : DISAGREE_COLOR,
  };
}

// Resolve a Theme D grouping_var's segments to {value,label,color} in
// stack order. Political uses the fixed blue/purple/red semantic colors;
// other demographics walk the qualitative16 palette.
function resolveSegments(groupingVar: string): StackSegmentDef[] {
  const cfg = DEMOGRAPHIC_CONFIGS[groupingVar];
  if (!cfg) return [];
  if (cfg.colorMode === 'political') {
    const byValue: Record<string, string> = {
      Liberal: STRATA_PALETTES.political.liberal,
      Moderate: STRATA_PALETTES.political.moderate,
      Conservative: STRATA_PALETTES.political.conservative,
    };
    return cfg.segments.map((s) => ({
      value: s.value,
      label: s.label,
      color: byValue[s.value] ?? '#999999',
    }));
  }
  const palette = STRATA_PALETTES.qualitative16;
  return cfg.segments.map((s, i) => ({
    value: s.value,
    label: s.label,
    color: palette[i % palette.length],
  }));
}

// X-axis caption per the spec's axis-label table (lines 806-813).
function axisLabelFor(
  question: CompareQuestion,
  responseType: ResponseType,
): string {
  if (question.variable === 'ex003_lonely') return '% who are lonely';
  if (question.responseTypeApplies) {
    if (question.reverseCoded) {
      // ls002i: post-reversal "agree" = does NOT feel negative.
      return responseType === 'agree'
        ? '% who do NOT feel negative'
        : '% who feel negative';
    }
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
  // Theme A demographic group-split (T3-B6). null = "No breakdown" (the
  // default ranked bar). Persists across Theme A question switches; reset
  // to null only on theme change (see handleThemeChange).
  const [breakdown, setBreakdown] = useState<string | null>(null);

  const [allRows, setAllRows] = useState<PlatformRateRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [questionTexts, setQuestionTexts] =
    useState<QuestionTextsJson | null>(null);
  // group_comparisons.json is LARGE (6.8 MB) — loaded lazily only when a
  // Theme C question is selected, never on initial mount.
  const [groupRows, setGroupRows] = useState<GroupComparisonRow[] | null>(
    null,
  );
  // platform_demographics.json (~900 KB) — lazy-loaded on Theme D entry.
  const [demoRows, setDemoRows] = useState<PlatformDemographicRow[] | null>(
    null,
  );
  // conditional_breakdowns.json (~1.2 MB) — lazy-loaded on first Theme A
  // drill-down. `drilldown` holds the active follow-up (null = no drill).
  const [condRows, setCondRows] = useState<ConditionalBreakdownRow[] | null>(
    null,
  );
  // platform_group_comparisons.json (2.86 MB) — lazy-loaded on first
  // Theme A breakdown selection.
  const [platformGroupRows, setPlatformGroupRows] = useState<
    PlatformGroupComparisonRow[] | null
  >(null);
  const [drilldown, setDrilldown] = useState<FollowUp | null>(null);
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

  // Lazy-load the large wellbeing file on first entry to Theme C.
  useEffect(() => {
    if (theme === 'C' && groupRows === null) {
      loadGroupComparisons().then(setGroupRows).catch(setError);
    }
  }, [theme, groupRows]);

  // Lazy-load the demographics file on first entry to Theme D.
  useEffect(() => {
    if (theme === 'D' && demoRows === null) {
      loadPlatformDemographics().then(setDemoRows).catch(setError);
    }
  }, [theme, demoRows]);

  // Lazy-load conditional breakdowns on the first Theme A drill-down.
  useEffect(() => {
    if (drilldown && condRows === null) {
      loadConditionalBreakdowns().then(setCondRows).catch(setError);
    }
  }, [drilldown, condRows]);

  // Lazy-load the per-platform demographic outcomes on the first Theme A
  // breakdown selection.
  useEffect(() => {
    if (theme === 'A' && breakdown !== null && platformGroupRows === null) {
      loadPlatformGroupComparisons().then(setPlatformGroupRows).catch(setError);
    }
  }, [theme, breakdown, platformGroupRows]);

  const activeTheme = getTheme(theme);
  const activeQuestion =
    activeTheme.questions.find((q) => q.key === questionKey) ??
    activeTheme.questions[0];

  const isGroupSource = activeQuestion.source === 'group_comparisons';
  const isDemoSource = activeQuestion.source === 'platform_demographics';
  const isStacked = activeQuestion.chartType === 'stackedBar';
  // Theme A group-split is active only with a demographic selected and no
  // drill-down open (the heatmap drill-down takes visual precedence; the
  // breakdown re-applies when the user returns from it).
  const isBreakdown =
    theme === 'A' && breakdown !== null && drilldown === null;

  // bucket: response-type-bearing questions (Theme B, Theme C ls002*)
  // read the selected band; binary/experience questions read null.
  const bucket: LikertBucket | null = activeQuestion.responseTypeApplies
    ? responseType
    : null;

  // Derived values are plain consts — the React Compiler memoizes them.
  // (Manual useMemo on deps derived from activeQuestion trips the
  // compiler's preserve-manual-memoization rule, so we let it optimize.)
  const labelBySlug = meta
    ? new Map(meta.platforms.map((p) => [p.slug, p.label]))
    : new Map<string, string>();

  // Available waves branch on the question's source (and on the active
  // breakdown for Theme A group-splits).
  const availableWaves: number[] = isBreakdown
    ? platformGroupRows
      ? availableWavesForPlatformGroup(
          platformGroupRows,
          activeQuestion.variable,
          breakdown!,
        )
      : allRows
        ? availableWavesForMetric(allRows, activeQuestion.metric!, bucket)
        : []
    : isDemoSource
      ? demoRows
        ? availableWavesForDemographic(demoRows, activeQuestion.variable)
        : []
      : isGroupSource
        ? groupRows
          ? availableWavesForOutcome(groupRows, activeQuestion.variable, bucket)
          : []
        : allRows
          ? availableWavesForMetric(allRows, activeQuestion.metric!, bucket)
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

  // Single-value series for ranked-bar themes (A/B/C). Empty for Theme D.
  const series: ComparisonSeries = isStacked
    ? []
    : isGroupSource
      ? groupRows
        ? platformOutcomeToSeries(
            getPlatformOutcomeComparison(
              groupRows,
              activeQuestion.variable,
              effectiveWave,
              bucket,
            ),
            platformsSet,
            labelBySlug,
          )
        : []
      : allRows
        ? platformRatesToSeries(
            allRows,
            activeQuestion.metric!,
            effectiveWave,
            bucket,
            platformsSet,
            labelBySlug,
          )
        : [];

  // Theme A group-split (T3-B6). The Overall baseline is reused from
  // `series` (platform_rates); per-group values come from
  // platform_group_comparisons via the adapter. resolveSegments returns
  // {value,label,color} in config order — also the table column order.
  const groupDefs: GroupDef[] = isBreakdown ? resolveSegments(breakdown!) : [];
  const overallBySlug = new Map<string, GroupedOverall>();
  if (isBreakdown) {
    for (const d of series) {
      overallBySlug.set(d.platform_slug, {
        value: d.value,
        ciLow: d.ciLow,
        ciHigh: d.ciHigh,
        n: d.n,
        suppressed: d.suppressed,
      });
    }
  }
  const groupedSeries: GroupedSeries =
    isBreakdown && platformGroupRows
      ? platformGroupComparisonsToGrouped(
          platformGroupRows,
          activeQuestion.variable,
          effectiveWave,
          breakdown!,
          groupDefs,
          overallBySlug,
          platformsSet,
          labelBySlug,
        )
      : [];

  // Stacked-composition series + resolved segments for Theme D.
  const segments: StackSegmentDef[] = isStacked
    ? resolveSegments(activeQuestion.variable)
    : [];
  const stackedSeries: StackedSeries =
    isStacked && isDemoSource && demoRows
      ? platformDemographicsToStacked(
          demoRows,
          activeQuestion.variable,
          effectiveWave,
          platformsSet,
          labelBySlug,
          segments[0]?.value ?? '',
        )
      : [];

  const coloring = resolveColoring(activeQuestion, responseType);
  const axisLabel = axisLabelFor(activeQuestion, responseType);

  // Swatch per displayed platform — matches CompareRankedBar fills.
  // (Empty for stacked themes and breakdown mode, where bars are colored
  // by group, not platform; the multiselect shows no swatches there.)
  const colorScaleMax = comparisonColorScaleMax(series);
  const swatchBySlug =
    isBreakdown
      ? new Map<string, string>()
      : buildSwatches(series, coloring, colorScaleMax);

  // In breakdown mode the fit-to-data domain must span both the Overall
  // and every per-group CI envelope, so group bars aren't clipped.
  const domainSeries: ComparisonSeries = isBreakdown
    ? groupedSeries.flatMap((d) => [
        ...(d.overall
          ? [
              {
                platform_slug: d.platform_slug,
                label: d.label,
                value: d.overall.value,
                ciLow: d.overall.ciLow,
                ciHigh: d.overall.ciHigh,
                n: d.overall.n,
                suppressed: d.overall.suppressed,
              },
            ]
          : []),
        ...d.groups.map((g) => ({
          platform_slug: d.platform_slug,
          label: g.label,
          value: g.value,
          ciLow: g.ciLow,
          ciHigh: g.ciHigh,
          n: g.n,
          suppressed: g.suppressed,
        })),
      ])
    : series;
  const xDomain = computeXDomain(xMode, customMin, customMax, domainSeries);
  const isZoomed = xMode !== 'full';

  // ── Theme A drill-down (heatmap) derived state ──────────────────────
  const constructWaves =
    drilldown && condRows
      ? availableWavesForConstruct(condRows, drilldown.construct)
      : [];
  const constructHasWave = constructWaves.includes(effectiveWave);
  const heatmapData: HeatmapData | null =
    drilldown && condRows && constructHasWave
      ? conditionalBreakdownsToHeatmap(
          condRows,
          drilldown.construct,
          effectiveWave,
          platformsSet,
          labelBySlug,
        )
      : null;
  const condLoading = drilldown != null && condRows === null;

  // Drill-into buttons (picker third column) — Theme A only, and only
  // for questions that declare follow-ups.
  const followUps = theme === 'A' ? activeQuestion.followUps ?? [] : [];
  const drillButtons =
    followUps.length > 0 ? (
      <div className="space-y-2">
        <p className={EYEBROW} style={{ fontFamily: 'var(--font-mono)' }}>
          Drill into
        </p>
        <div className="flex flex-col gap-2">
          {followUps.map((fu) => {
            const active = drilldown?.construct === fu.construct;
            return (
              <button
                key={fu.construct}
                type="button"
                title={fu.tooltip}
                aria-pressed={active}
                onClick={() => setDrilldown(fu)}
                className={
                  'text-left text-sm rounded-md border px-3 py-1.5 transition-colors ' +
                  (active
                    ? 'border-plum bg-plum/5 text-plum font-medium'
                    : 'border-mist text-ink hover:border-mulberry hover:text-plum')
                }
              >
                {fu.buttonLabel}
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

  // ── handlers ───────────────────────────────────────────────────────
  const handleThemeChange = (id: ThemeId) => {
    setTheme(id);
    setDrilldown(null); // drill-down is per-question
    setBreakdown(null); // group-split is Theme-A-only; reset on theme change
    // Reset to the new theme's first question; platforms / wave /
    // responseType persist.
    const first = getTheme(id).questions[0];
    if (first) setQuestionKey(first.key);
  };
  const handleQuestionChange = (key: string) => {
    setQuestionKey(key);
    setDrilldown(null); // exiting a question exits its drill-down
    // breakdown PERSISTS across Theme A question switches (per spec).
  };
  const handleBreakdownChange = (gv: string | null) => setBreakdown(gv);
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

  const baseReady = allRows && meta;
  // Themes C and D each need a lazily-loaded file before rendering; a
  // Theme A breakdown needs platform_group_comparisons.json.
  const waitingForData =
    (isGroupSource && !groupRows) ||
    (isDemoSource && !demoRows) ||
    (isBreakdown && !platformGroupRows);
  const loadingMessage = !baseReady
    ? 'Loading platform-comparison data…'
    : isBreakdown
      ? 'Loading breakdown data…'
      : isDemoSource
        ? 'Loading demographics data…'
        : 'Loading wellbeing data…';

  // Picker renders immediately; the chart frame waits for data.
  return (
    <>
      <TwoStepPicker
        themes={COMPARE_THEMES}
        activeTheme={theme}
        activeQuestion={activeQuestion.key}
        onThemeChange={handleThemeChange}
        onQuestionChange={handleQuestionChange}
        extra={drillButtons}
      />
      {!baseReady || waitingForData ? (
        <div
          className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {loadingMessage}
        </div>
      ) : (
        <CompareChart
          meta={meta}
          questionTexts={questionTexts}
          activeThemeLabel={activeTheme.label}
          question={activeQuestion}
          series={series}
          stackedSeries={stackedSeries}
          segments={segments}
          isBreakdown={isBreakdown}
          groupedSeries={groupedSeries}
          groupDefs={groupDefs}
          breakdown={breakdown}
          onBreakdownChange={handleBreakdownChange}
          breakdownDisabled={!(theme === 'A' && drilldown === null)}
          breakdownThemeNote={theme !== 'A'}
          coloring={coloring}
          axisLabel={axisLabel}
          xDomain={xDomain}
          isZoomed={isZoomed}
          effectiveWave={effectiveWave}
          availableWaves={availableWaves}
          swatchBySlug={swatchBySlug}
          chartRef={chartRef}
          drilldown={drilldown}
          heatmapData={heatmapData}
          constructHasWave={constructHasWave}
          constructWaves={constructWaves}
          condLoading={condLoading}
          onBack={() => setDrilldown(null)}
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
  series: ComparisonSeries;
  stackedSeries: StackedSeries;
  segments: StackSegmentDef[];
  isBreakdown: boolean;
  groupedSeries: GroupedSeries;
  groupDefs: GroupDef[];
  breakdown: string | null;
  onBreakdownChange: (gv: string | null) => void;
  breakdownDisabled: boolean;
  breakdownThemeNote: boolean;
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
  // Theme A drill-down (heatmap). drilldown === null → normal chart.
  drilldown: FollowUp | null;
  heatmapData: HeatmapData | null;
  constructHasWave: boolean;
  constructWaves: number[];
  condLoading: boolean;
  onBack: () => void;
}

function CompareChart(props: CompareChartProps) {
  const {
    meta,
    questionTexts,
    activeThemeLabel,
    question,
    series,
    stackedSeries,
    segments,
    isBreakdown,
    groupedSeries,
    groupDefs,
    breakdown,
    onBreakdownChange,
    breakdownDisabled,
    breakdownThemeNote,
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
    drilldown,
    heatmapData,
    constructHasWave,
    constructWaves,
    condLoading,
    onBack,
  } = props;

  const isStacked = question.chartType === 'stackedBar';
  const isDrill = drilldown != null;

  const waveDates =
    meta.waves.find((w) => w.wave === effectiveWave)?.dates ?? '';
  // Subtitle = the verbatim survey question (3-tier lookup) for A/B/C.
  // Theme D demographics are panel-provided (no survey item), so they
  // use a short composition descriptor. The title (registry slug) is
  // always the chart title; the question never becomes the title.
  const subtitle = isDrill
    ? `Breakdown among each platform’s users who reported “${question.title}.”`
    : isStacked
      ? 'Demographic composition of each platform’s user base. Segments are shares of the platform’s users; bars may total under 100% where a group is suppressed.'
      : formatSurveyQuestion(
          surveyQuestionFor(question.variable, questionTexts, meta),
        );

  // THE NUMBERS — ranked stat list (ranked themes) or a per-platform
  // composition table (Theme D). Built below; one is passed to the frame.
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

  // Composition table for Theme D (text alternative for the stacked bar).
  const compositionNumbers = isStacked ? (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
        <thead>
          <tr className="text-slate text-left">
            <th className="pr-3 pb-1 font-normal">Platform</th>
            {segments.map((seg) => (
              <th key={seg.value} className="px-2 pb-1 font-normal text-right">
                <span className="inline-flex items-center gap-1">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: seg.color }}
                  />
                  {seg.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stackedSeries.map((d) => (
            <tr key={d.platform_slug} className="border-t border-mist/60">
              <td className="pr-3 py-1 text-ink">{d.label}</td>
              {segments.map((seg) => {
                const sv = d.segments[seg.value];
                return (
                  <td
                    key={seg.value}
                    className="px-2 py-1 text-right text-ink/85"
                  >
                    {!sv || sv.suppressed || sv.value === null
                      ? '—'
                      : formatPercent(sv.value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : null;

  // Breakdown table (Theme A group-split) — Platform | Overall | groups.
  // Overall column is styled ink/bold to match the chart's baseline bar.
  const breakdownNumbers = isBreakdown ? (
    <div className="overflow-x-auto">
      <table
        className="w-full text-xs"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <thead>
          <tr className="text-slate text-left">
            <th className="pr-3 pb-1 font-normal">Platform</th>
            <th className="px-2 pb-1 font-normal text-right">
              <span className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: '#C8C3BC' }}
                />
                Overall
              </span>
            </th>
            {groupDefs.map((g) => (
              <th key={g.value} className="px-2 pb-1 font-normal text-right">
                <span className="inline-flex items-center gap-1">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: g.color }}
                  />
                  {g.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupedSeries.map((d) => (
            <tr key={d.platform_slug} className="border-t border-mist/60">
              <td className="pr-3 py-1 text-ink">{d.label}</td>
              <td
                className="px-2 py-1 text-right text-ink/85"
                title={d.overall?.suppressed ? 'n < 30 (suppressed)' : undefined}
              >
                {d.overall && !d.overall.suppressed && d.overall.value !== null
                  ? formatPercent(d.overall.value)
                  : '—'}
              </td>
              {d.groups.map((g) => (
                <td
                  key={g.group}
                  className="px-2 py-1 text-right text-ink/85"
                  title={g.suppressed ? 'n < 30 (suppressed)' : undefined}
                >
                  {!g.suppressed && g.value !== null
                    ? formatPercent(g.value)
                    : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : null;

  const suppressed = series.filter((d) => d.suppressed).map((d) => d.label);
  const suppressedNote =
    suppressed.length > 0 ? ` (this wave: ${suppressed.join(', ')})` : '';
  // Source-specific caveats appended to the standard source note.
  let extraNote = '';
  if (isDrill) {
    extraNote =
      ' Percentages are among users who reported the experience. Respondents could select multiple options, so percentages may sum to more than 100%.';
  } else if (isStacked) {
    extraNote =
      ' Composition is among each platform’s users. Percentages may not sum to 100% due to rounding, missing values, or suppressed groups (n < 30).';
  } else if (isBreakdown) {
    extraNote =
      ' Bars are broken out by the selected demographic group; “Overall” (dark baseline bar) is the rate among all of the platform’s users. Every estimate is among each platform’s users (conditional on platform use).';
  } else if (
    question.source === 'platform_rates' &&
    question.responseTypeApplies
  ) {
    extraNote =
      ' Platform habit/attitude scale, Waves 4–6 only; items are non-validated.';
  } else if (question.source === 'group_comparisons') {
    extraNote =
      ' Estimates are among each platform’s users (respondents who reported using the platform).';
    if (question.reverseCoded) {
      extraNote +=
        ' This item is reverse-coded; higher agreement indicates the respondent does NOT feel negative most of the time.';
    }
  }
  // Ranked themes show n in the tooltip; stacked + heatmap show it
  // per-segment/per-cell in the tooltip too, so phrasing adapts.
  const tooltipBased = isStacked || isDrill;
  const nClause = isDrill
    ? ' n shown in the hover tooltip is the count of affected users on each platform.'
    : isStacked
      ? ' n shown in the hover tooltip is the count of platform users in each group.'
      : isBreakdown
        ? ' n shown in the hover tooltip is the count of platform users in each demographic group.'
        : ' n shown in tooltip is the count of platform users.';
  const sourceNote = `Source: UAS panel ${fullWaveLabel(
    effectiveWave,
    waveDates,
  )}. Weighted estimates. 95% CIs shown ${
    tooltipBased
      ? 'in the hover tooltip'
      : 'as error bars at bar tips and in the hover tooltip'
  }.${nClause}${extraNote} Cells with n < 30 are suppressed by design${suppressedNote}.`;

  // CSV — heatmap: one row per platform × option; stacked: per
  // platform × segment; ranked: per platform.
  const csvHeaders =
    isDrill && drilldown
      ? [
          'platform_slug',
          'platform_label',
          'wave',
          'wave_dates',
          'construct',
          'option_label',
          'weighted_value',
          'weighted_ci_lower',
          'weighted_ci_upper',
          'n',
          'suppressed',
        ]
      : isStacked
        ? [
            'platform_slug',
            'platform_label',
            'wave',
            'wave_dates',
            'grouping_var',
            'group_value',
            'weighted_value',
            'weighted_ci_lower',
            'weighted_ci_upper',
            'n',
            'suppressed',
          ]
        : isBreakdown
          ? [
              'platform_slug',
              'platform_label',
              'wave',
              'wave_dates',
              'outcome',
              'grouping_var',
              'group',
              'weighted_value',
              'weighted_ci_lower',
              'weighted_ci_upper',
              'n',
              'suppressed',
            ]
          : [
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
  const csvRows: unknown[][] =
    isDrill && drilldown && heatmapData
      ? heatmapData.rows.flatMap((row) =>
          heatmapData.options.map((opt) => {
            const cell = row.cells[opt];
            return [
              row.platform_slug,
              row.label,
              effectiveWave,
              waveDates,
              drilldown.construct,
              opt,
              cell?.value ?? null,
              cell?.ciLow ?? null,
              cell?.ciHigh ?? null,
              cell?.n ?? null,
              cell?.suppressed ?? true,
            ];
          }),
        )
      : isStacked
        ? stackedSeries.flatMap((d) =>
        segments.map((seg) => {
          const sv = d.segments[seg.value];
          return [
            d.platform_slug,
            d.label,
            effectiveWave,
            waveDates,
            question.variable,
            seg.value,
            sv?.value ?? null,
            sv?.ciLow ?? null,
            sv?.ciHigh ?? null,
            sv?.n ?? null,
            sv?.suppressed ?? true,
          ];
        }),
      )
    : isBreakdown
      ? groupedSeries.flatMap((d) => [
          [
            d.platform_slug,
            d.label,
            effectiveWave,
            waveDates,
            question.variable,
            'overall',
            'Overall',
            d.overall?.value ?? null,
            d.overall?.ciLow ?? null,
            d.overall?.ciHigh ?? null,
            d.overall?.n ?? null,
            d.overall?.suppressed ?? true,
          ],
          ...d.groups.map((g) => [
            d.platform_slug,
            d.label,
            effectiveWave,
            waveDates,
            question.variable,
            breakdown ?? '',
            g.group,
            g.value,
            g.ciLow,
            g.ciHigh,
            g.n,
            g.suppressed,
          ]),
        ])
      : series.map((d) => [
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
  // Render ALL waves; waves the current question wasn't asked in render
  // as greyed-out, unclickable "ghost" rows with an explanatory tooltip.
  const availableWaveSet = new Set(availableWaves);
  const waveSelector = (
    <div className="space-y-2">
      <p className={EYEBROW} style={{ fontFamily: 'var(--font-mono)' }}>
        Wave
      </p>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="sr-only">Select wave</legend>
        {meta.waves.map((wv) => {
          const w = wv.wave;
          const isAvailable = availableWaveSet.has(w);
          const ghostTitle = `This question was not asked in Wave ${w}.`;
          return (
            <label
              key={w}
              title={isAvailable ? undefined : ghostTitle}
              className={
                'flex items-center gap-2 ' +
                (isAvailable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40')
              }
            >
              <input
                type="radio"
                name="compare-wave"
                value={w}
                checked={isAvailable && wave === w}
                disabled={!isAvailable}
                onChange={() => onWaveChange(w)}
                className="accent-plum"
              />
              <span
                className={
                  !isAvailable
                    ? 'text-slate'
                    : wave === w
                      ? 'text-ink'
                      : 'text-slate'
                }
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {fullWaveLabel(w, wv.dates)}
              </span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );

  // ls002i is reverse-coded: post-reversal "agree" means the respondent
  // does NOT feel negative, so relabel the control accordingly.
  const responseTypeLabel = (rt: ResponseType): string => {
    if (question.reverseCoded) {
      return rt === 'agree'
        ? '% who do NOT feel negative'
        : '% who feel negative';
    }
    return rt === 'agree' ? '% who agree' : '% who disagree';
  };

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
              {responseTypeLabel(rt)}
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

  // Demographic group-split selector — always occupies the same slot
  // (below PLATFORMS, above WAVE). It's interactive on the Experiences
  // theme (no drill-down) and greyed/disabled elsewhere, with a note
  // explaining why, rather than vanishing. Default is "No breakdown".
  const cursorClass = breakdownDisabled ? 'cursor-not-allowed' : 'cursor-pointer';
  const breakdownSelector = (
    <div className="space-y-2">
      <p className={EYEBROW} style={{ fontFamily: 'var(--font-mono)' }}>
        Breakdown
      </p>
      <fieldset
        disabled={breakdownDisabled}
        className={
          'flex flex-col gap-1 text-sm ' + (breakdownDisabled ? 'opacity-50' : '')
        }
      >
        <legend className="sr-only">Split by demographic group</legend>
        <label className={'flex items-center gap-2 ' + cursorClass}>
          <input
            type="radio"
            name="compare-breakdown"
            value=""
            checked={breakdown === null}
            onChange={() => onBreakdownChange(null)}
            className="accent-plum"
          />
          <span
            className={breakdown === null ? 'text-ink' : 'text-slate'}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            No breakdown
          </span>
        </label>
        {BREAKDOWN_DEMOGRAPHICS.map((b) => (
          <label
            key={b.groupingVar}
            className={'flex items-center gap-2 ' + cursorClass}
          >
            <input
              type="radio"
              name="compare-breakdown"
              value={b.groupingVar}
              checked={breakdown === b.groupingVar}
              onChange={() => onBreakdownChange(b.groupingVar)}
              className="accent-plum"
            />
            <span
              className={breakdown === b.groupingVar ? 'text-ink' : 'text-slate'}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {b.label}
            </span>
          </label>
        ))}
      </fieldset>
      {breakdownThemeNote ? (
        <p
          className="text-xs text-slate leading-snug"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Demographic breakdown available for Experiences theme only.
        </p>
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
      {breakdownSelector}
      {waveSelector}
      {responseTypeSelector}
      {/* No x-axis zoom for stacked composition or heatmap drill-downs. */}
      {isStacked || isDrill ? null : xAxisControls}
    </div>
  );

  const chartFooter = !isStacked && !isDrill && isZoomed ? (
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

  // ── drill-down (heatmap) presentation ───────────────────────────────
  const breadcrumb =
    isDrill && drilldown ? (
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-mulberry hover:text-plum underline-offset-2 hover:underline"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        ← Back to {question.title}
      </button>
    ) : undefined;

  const heatmapChart = condLoading ? (
    <div
      className="py-16 text-center text-slate text-sm"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      Loading breakdown data…
    </div>
  ) : !constructHasWave ? (
    <div
      className="py-12 text-center text-slate text-sm space-y-1"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <p>This breakdown was not collected in the selected wave.</p>
      <p className="text-xs">
        Available in{' '}
        {constructWaves.length > 0
          ? constructWaves.map((w) => `Wave ${w}`).join(', ')
          : 'no waves'}
        . Switch waves to view it.
      </p>
    </div>
  ) : heatmapData ? (
    <CompareHeatmap data={heatmapData} />
  ) : null;

  // Short text alternative for the heatmap (THE NUMBERS slot).
  const heatmapNumbers =
    isDrill && drilldown ? (
      <p className="text-sm text-ink/80 leading-relaxed">
        Each cell is the weighted % of a platform’s affected users who
        selected that option, for the selected wave. Hover a cell for its
        95% CI and n. Suppressed cells (n &lt; 30) show “—”. Because
        respondents could choose multiple options, a platform’s row can
        sum to more than 100%.
      </p>
    ) : null;

  return (
    <StrataChartFrame
      eyebrow={`Compare · ${activeThemeLabel}`}
      title={isDrill && drilldown ? drilldown.heatmapTitle : question.title}
      subtitle={subtitle}
      titleInCard
      breadcrumb={breadcrumb}
      sourceNote={sourceNote}
      chart={
        isDrill ? (
          heatmapChart
        ) : isStacked ? (
          <CompareStackedBar series={stackedSeries} segments={segments} />
        ) : isBreakdown ? (
          <CompareGroupedBar
            series={groupedSeries}
            xDomain={xDomain}
            isZoomed={isZoomed}
            axisLabel={axisLabel}
          />
        ) : (
          <CompareRankedBar
            series={series}
            coloring={coloring}
            xDomain={xDomain}
            isZoomed={isZoomed}
            axisLabel={axisLabel}
          />
        )
      }
      chartRef={chartRef}
      controls={controlsAside}
      chartFooter={chartFooter}
      stats={isStacked || isDrill || isBreakdown ? undefined : stats}
      customNumbers={
        isDrill
          ? heatmapNumbers
          : isStacked
            ? compositionNumbers
            : isBreakdown
              ? breakdownNumbers
              : undefined
      }
      isPlaceholderInterpretation
      interpretation={
        isDrill
          ? '[WORK IN PROGRESS] Per-platform breakdown of the topics/impacts users reported, for the selected wave. Interpretation copy is intentionally omitted — the heatmap and THE NUMBERS note describe the weighted percentages and caveats.'
          : isStacked
            ? '[WORK IN PROGRESS] Demographic composition of each platform’s user base for the selected wave. Interpretation copy is intentionally omitted — the chart and THE NUMBERS table show the weighted composition with per-segment confidence intervals on hover.'
            : isBreakdown
              ? '[WORK IN PROGRESS] Per-platform rates broken out by the selected demographic group, with each platform’s Overall rate as the dark baseline bar. Interpretation copy is intentionally omitted — the chart and THE NUMBERS table show the per-group weighted estimates with 95% CIs.'
              : '[WORK IN PROGRESS] Ranked comparison across platforms for the selected wave. Interpretation copy is intentionally omitted in Part 1 — the chart and THE NUMBERS show the ranked weighted estimates with 95% CIs.'
      }
      methodologyFootnote=""
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle:
          isDrill && drilldown ? drilldown.heatmapTitle : question.title,
        variables: [
          isDrill && drilldown ? drilldown.construct : question.variable,
        ],
        waves: isDrill ? [effectiveWave] : availableWaves,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={
        isDrill && drilldown
          ? `compare-${question.key}-${drilldown.construct}`
          : isBreakdown && breakdown
            ? `compare-${question.key}-by-${breakdown}`
            : `compare-${question.key}`
      }
    />
  );
}
