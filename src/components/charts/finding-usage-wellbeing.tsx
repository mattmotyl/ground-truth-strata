'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  usePlotArea,
  XAxis,
  YAxis,
} from 'recharts';
import {
  loadCorrelations,
  loadMeta,
  loadQuestionTexts,
  type QuestionTextsJson,
} from '@/lib/strata-data';
import type {
  CorrelationRow,
  MetaJson,
} from '@/lib/strata-types';
import { CHART_FONTS, STRATA_PALETTES } from '@/lib/strata-charts';
import {
  formatN,
  formatNumber,
  fullWaveLabel,
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
// Finding 08 — Does using social media more mean feeling worse?
//
// Diverging horizontal bar of Spearman ρ between platform time-per-day
// (time_per_day_min_<slug>) and a wellbeing/loneliness outcome
// (default: ex003c, loneliness_isolated — "I feel isolated from
// others"). One bar per platform; the bar's sign indicates whether
// MORE time on the platform is associated with HIGHER scores on the
// outcome.
//
// Time-per-day data is only available in W5 in the precomputed JSON,
// so the chart is single-wave by necessity. The methodology footnote
// surfaces that constraint.
//
// p_value was stripped from correlations.json in Step 2 (no p-values
// anywhere in the UI per PHASE4_UI_SPEC). Interpretation leads with
// effect-size bands instead of significance language, per
// feedback_significance_rule.md and T2-10.
// =====================================================================

const OUTCOME_OPTIONS: Array<{
  variable: string;
  label: string;
  direction: 'positive_is_worse' | 'positive_is_better';
}> = [
  {
    variable: 'ex003a',
    label: 'Loneliness — lacks companionship (ex003a)',
    direction: 'positive_is_worse',
  },
  {
    variable: 'ex003b',
    label: 'Loneliness — feels left out (ex003b)',
    direction: 'positive_is_worse',
  },
  {
    variable: 'ex003c',
    label: 'Loneliness — feels isolated (ex003c)',
    direction: 'positive_is_worse',
  },
  {
    variable: 'ls002i',
    label: 'Life satisfaction — negative feeling (ls002i, reverse-coded)',
    direction: 'positive_is_worse',
  },
  {
    variable: 'ls002l',
    label: 'Life satisfaction — overall (ls002l)',
    direction: 'positive_is_better',
  },
];

interface ChartDatum {
  platform_slug: string;
  platformLabel: string;
  r: number;
  n: number;
}

interface BarTooltipProps {
  active?: boolean;
  payload?: readonly {
    payload?: unknown;
  }[];
}

function CorrelationTooltip({ active, payload }: BarTooltipProps) {
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
        Spearman ρ ={' '}
        <span className="font-medium">{formatNumber(datum.r, 3)}</span>
      </div>
      <div className="text-slate">n = {formatN(datum.n)}</div>
    </div>
  );
}

// Horizontal axis-break zig-zag drawn ON the X-axis line (the bottom
// edge of the plot area), just inside the Y-axis origin. Signals that
// the Spearman ρ axis has been clipped from its full [-1, +1] range.
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

export function FindingUsageWellbeing() {
  const [rows, setRows] = useState<CorrelationRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [questionTexts, setQuestionTexts] =
    useState<QuestionTextsJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [outcomeVar, setOutcomeVar] = useState<string>('ex003c');
  // Wave: time_per_day_minutes exists in W4 and W5 in correlations.json
  // (UAS519/W6 has zero entries for this variable, so it's correctly
  // absent from the precompute). Default to the most recent available
  // wave; user can switch to compare. `null` means "fall through to the
  // last availableWave once data has loaded".
  const [requestedWave, setRequestedWave] = useState<number | null>(null);
  // X axis zoom mode and custom bounds. Spearman ρ is bounded by
  // [-1, +1] so 'full' is the only honest default; auto-fitting to data
  // makes |ρ| = 0.1 look like a major effect, which it isn't.
  // 'full'   : [-1, +1]
  // 'fit'    : [min - 0.05, max + 0.05] of visible data, clamped to [-1, 1]
  // 'custom' : [customMin, customMax], user-entered bounds
  const [xMode, setXMode] = useState<'full' | 'fit' | 'custom'>('full');
  const [customMin, setCustomMin] = useState<number>(-1);
  const [customMax, setCustomMax] = useState<number>(1);
  // Platform multiselect — same DEFAULT_CHART_PLATFORMS as Finding 01.
  // Filters which correlation rows appear in the chart. Numbers table
  // mirrors the chart here because the table is built from chartData;
  // the CSV stays whole-truth (all correlation rows for the wave).
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
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([loadCorrelations(), loadMeta(), loadQuestionTexts()])
      .then(([all, m, qt]) => {
        setQuestionTexts(qt);
        // Keep only correlations between any time_per_day_min_<slug>
        // and any of our outcome candidates.
        const outcomeVars = new Set(OUTCOME_OPTIONS.map((o) => o.variable));
        setRows(
          all.filter((r) => {
            const v1Time = r.var1.startsWith('time_per_day_min_');
            const v2Time = r.var2.startsWith('time_per_day_min_');
            const otherVar = v1Time ? r.var2 : r.var1;
            return (v1Time || v2Time) && outcomeVars.has(otherVar);
          }),
        );
        setMeta(m);
      })
      .catch(setError);
  }, []);

  const platformLabelBySlug = useMemo(() => {
    if (!meta) return new Map<string, string>();
    return new Map(meta.platforms.map((p) => [p.slug, p.label]));
  }, [meta]);

  const availableWaves = useMemo(() => {
    if (!rows) return [] as number[];
    return [...new Set(rows.filter((r) => r.var1.includes('time_per_day_min_') || r.var2.includes('time_per_day_min_')).filter((r) => {
      const otherVar = r.var1.startsWith('time_per_day_min_')
        ? r.var2
        : r.var1;
      return otherVar === outcomeVar;
    }).map((r) => r.wave))].sort((a, b) => a - b);
  }, [rows, outcomeVar]);

  const selectedWave =
    requestedWave !== null && availableWaves.includes(requestedWave)
      ? requestedWave
      : availableWaves[availableWaves.length - 1] ?? 5;

  const chartPlatformsSet = useMemo(
    () => new Set(chartPlatforms),
    [chartPlatforms],
  );

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!rows) return [];
    const data: ChartDatum[] = [];
    for (const r of rows) {
      if (r.wave !== selectedWave) continue;
      if (r.suppressed) continue;
      const timeVar = r.var1.startsWith('time_per_day_min_')
        ? r.var1
        : r.var2.startsWith('time_per_day_min_')
          ? r.var2
          : null;
      if (!timeVar) continue;
      const otherVar = timeVar === r.var1 ? r.var2 : r.var1;
      if (otherVar !== outcomeVar) continue;
      const rho = r.weighted_r ?? null;
      const n = r.n ?? 0;
      if (rho === null || n < 30) continue;
      const slug = timeVar.replace(/^time_per_day_min_/, '');
      if (!chartPlatformsSet.has(slug)) continue;
      data.push({
        platform_slug: slug,
        platformLabel: platformLabelBySlug.get(slug) ?? slug,
        r: rho,
        n,
      });
    }
    data.sort((a, b) => b.r - a.r);
    return data;
  }, [
    rows,
    selectedWave,
    outcomeVar,
    platformLabelBySlug,
    chartPlatformsSet,
  ]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load correlation data: {error.message}</p>
      </div>
    );
  }
  if (!rows || !meta) {
    return (
      <div
        className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Loading correlation data…
      </div>
    );
  }

  const selectedOutcome =
    OUTCOME_OPTIONS.find((o) => o.variable === outcomeVar) ??
    OUTCOME_OPTIONS[2];
  const colorForBar = (d: ChartDatum): string =>
    d.r > 0
      ? STRATA_PALETTES.diverging.above
      : STRATA_PALETTES.diverging.below;

  const clampToUnit = (v: number) => Math.max(-1, Math.min(1, v));
  const xDomain: [number, number] = (() => {
    if (xMode === 'full') return [-1, 1];
    if (xMode === 'custom') {
      const lo = clampToUnit(customMin);
      const hi = clampToUnit(customMax);
      if (hi <= lo) return [-1, 1];
      return [lo, hi];
    }
    if (chartData.length === 0) return [-1, 1];
    let min = Infinity;
    let max = -Infinity;
    for (const d of chartData) {
      if (d.r < min) min = d.r;
      if (d.r > max) max = d.r;
    }
    if (min === Infinity) return [-1, 1];
    const lo = clampToUnit(Math.floor((min - 0.05) * 100) / 100);
    const hi = clampToUnit(Math.ceil((max + 0.05) * 100) / 100);
    if (hi <= lo) return [-1, 1];
    return [lo, hi];
  })();
  const isZoomed = xMode !== 'full';

  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');
  const selectedWaveDates =
    meta.waves.find((w) => w.wave === selectedWave)?.dates ?? '';

  // T2-10 (revised handoff): interpretation leads with EFFECT SIZE,
  // not p-value. Spearman ρ for social-media correlations is almost
  // always small in absolute terms (|ρ| < 0.20), so we describe each
  // platform's correlation by magnitude band first and only mention
  // p-significance as a caveat. Per feedback_significance_rule.md,
  // overstating tiny associations as "significant" reads as
  // overinterpretation.
  const effectBand = (r: number): 'none' | 'very-small' | 'small' | 'moderate' | 'strong' => {
    const abs = Math.abs(r);
    if (abs < 0.05) return 'none';
    if (abs < 0.10) return 'very-small';
    if (abs < 0.30) return 'small';
    if (abs < 0.50) return 'moderate';
    return 'strong';
  };
  const directionWord = (d: ChartDatum): string => {
    // "more time → MORE outcome" depending on outcome variable sign and ρ sign.
    const sign = d.r > 0 ? 'positive' : 'negative';
    const worseDirection = selectedOutcome.direction === 'positive_is_worse';
    if (sign === 'positive') {
      return worseDirection
        ? 'more time per day is associated with slightly worse wellbeing on this outcome'
        : 'more time per day is associated with slightly better wellbeing on this outcome';
    }
    return worseDirection
      ? 'more time per day is associated with slightly better wellbeing on this outcome'
      : 'more time per day is associated with slightly worse wellbeing on this outcome';
  };
  const platformLine = (d: ChartDatum): string => {
    const band = effectBand(d.r);
    const ρ = formatNumber(d.r, 3);
    const n = formatN(d.n);
    switch (band) {
      case 'none':
        return `${d.platformLabel} shows essentially no association (ρ=${ρ}, n=${n}).`;
      case 'very-small':
        return `${d.platformLabel} shows a very small ${d.r > 0 ? 'positive' : 'negative'} association (ρ=${ρ}, n=${n}) — close to zero, ${directionWord(d)}, though the effect is tiny.`;
      case 'small':
        return `${d.platformLabel} shows a small ${d.r > 0 ? 'positive' : 'negative'} association (ρ=${ρ}, n=${n}) — ${directionWord(d)}, though the effect is small.`;
      case 'moderate':
        return `${d.platformLabel} shows a moderate ${d.r > 0 ? 'positive' : 'negative'} association (ρ=${ρ}, n=${n}) — ${directionWord(d)}.`;
      case 'strong':
        return `${d.platformLabel} shows a strong ${d.r > 0 ? 'positive' : 'negative'} association (ρ=${ρ}, n=${n}) — ${directionWord(d)}.`;
    }
  };
  const notableLines = chartData
    .filter((d) => effectBand(d.r) !== 'none')
    .map(platformLine);
  const nullLines = chartData.filter((d) => effectBand(d.r) === 'none');
  const notableSection =
    notableLines.length > 0
      ? notableLines.join(' ')
      : 'No platforms show even a small association between time-per-day and this outcome.';
  const nullSection =
    nullLines.length > 0
      ? `The remaining ${nullLines.length} platform${nullLines.length === 1 ? '' : 's'} (${nullLines.map((d) => d.platformLabel).join(', ')}) show essentially no association at this wave's sample size.`
      : '';
  const waveAvailabilityClause =
    availableWaves.length > 1
      ? `Time-per-day correlations against this outcome are available in ${availableWaves.map((w) => `Wave ${w}`).join(' and ')} in the precomputed JSON; Wave 6 is excluded because UAS519 has zero respondents on the time-per-day item.`
      : `Time-per-day correlations against this outcome are available only in Wave ${selectedWave} in the precomputed JSON; other waves do not have overlapping respondents on both items.`;
  const caveat = `Spearman ρ is bounded by [-1, +1]; for context, |ρ| < 0.10 is typically considered very small (often within sampling noise) and |ρ| < 0.30 is still small. This is an observational survey: associations do not imply causation. ${waveAvailabilityClause}`;
  const interpretationText = [
    `Outcome variable: ${selectedOutcome.label}. ${selectedOutcome.direction === 'positive_is_worse' ? 'Higher scores indicate WORSE wellbeing.' : 'Higher scores indicate BETTER wellbeing.'}`,
    notableSection,
    nullSection,
    caveat,
  ]
    .filter(Boolean)
    .join(' ');

  const csvHeaders = [
    'platform_slug',
    'outcome_variable',
    'wave',
    'wave_dates',
    'spearman_r',
    'n',
    'weighted_n_eff',
    'suppressed',
  ];
  const csvRows: unknown[][] = rows
    .filter((r) => r.wave === selectedWave)
    .map((r) => {
      const timeVar = r.var1.startsWith('time_per_day_min_')
        ? r.var1
        : r.var2;
      const otherVar = timeVar === r.var1 ? r.var2 : r.var1;
      return [
        timeVar.replace(/^time_per_day_min_/, ''),
        otherVar,
        r.wave,
        meta.waves.find((w) => w.wave === r.wave)?.dates ?? '',
        r.weighted_r,
        r.n,
        r.weighted_n_eff,
        r.suppressed,
      ];
    });

  const barHeight = 26;
  const chartHeight = Math.max(260, chartData.length * barHeight + 60);

  const chart = (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 16, right: 32, bottom: 28, left: 8 }}
      >
        <CartesianGrid
          stroke="#E7E1EC"
          strokeDasharray="3 3"
          horizontal={false}
        />
        <XAxis
          type="number"
          domain={xDomain}
          allowDataOverflow
          tickFormatter={(v) => formatNumber(v as number, 2)}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
          label={{
            value: `Spearman ρ — negative ← (less ${selectedOutcome.direction === 'positive_is_worse' ? 'loneliness' : 'wellbeing'} with more time)   →   positive (more with more time)`,
            position: 'insideBottom',
            offset: -10,
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
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
          content={(props) => <CorrelationTooltip {...props} />}
        />
        <ReferenceLine x={0} stroke="#18161F" />
        <Bar
          dataKey="r"
          radius={[2, 2, 2, 2]}
          isAnimationActive={false}
        >
          {chartData.map((d) => (
            <Cell key={d.platform_slug} fill={colorForBar(d)} />
          ))}
        </Bar>
        <BrokenXAxisIndicator visible={isZoomed} />
      </BarChart>
    </ResponsiveContainer>
  );

  // Swatch for the multiselect — match the bar color (teal/amber for
  // significant +/-, faded gray for non-significant). Only entries for
  // currently-visible platforms.
  const swatchBySlug = new Map<string, string>();
  for (const d of chartData) {
    swatchBySlug.set(d.platform_slug, colorForBar(d));
  }

  // Platform multiselect + outcome variable selector + wave selector +
  // X-axis zoom controls all share the left aside. The X-axis defaults
  // to the full Spearman ρ range (-1, +1); see PHASE4_UI_SPEC "Axis
  // and Scale Rules" — auto-fitting to data makes |ρ| ≈ 0.1 look like
  // a large effect, which it isn't.
  const controlsAside = (
    <div className="space-y-5">
      <PlatformMultiselect
        platforms={meta.platforms}
        selected={chartPlatforms}
        onToggle={toggleChartPlatform}
        onReset={resetChartPlatforms}
        swatchBySlug={swatchBySlug}
      />

      {availableWaves.length > 1 ? (
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
                    name="usage-wellbeing-wave"
                    value={w}
                    checked={selectedWave === w}
                    onChange={() => setRequestedWave(w)}
                    className="accent-plum"
                  />
                  <span
                    className={
                      selectedWave === w ? 'text-ink' : 'text-slate'
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
      ) : null}

      <div className="space-y-2">
        <p
          className="text-xs text-slate uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Wellbeing outcome
        </p>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="sr-only">Wellbeing outcome variable</legend>
          {OUTCOME_OPTIONS.map((o) => (
            <label
              key={o.variable}
              className="flex items-start gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name="usage-wellbeing-outcome"
                value={o.variable}
                checked={outcomeVar === o.variable}
                onChange={() => setOutcomeVar(o.variable)}
                className="accent-plum mt-0.5 shrink-0"
              />
              <span
                className={
                  outcomeVar === o.variable ? 'text-ink' : 'text-slate'
                }
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {o.label}
              </span>
            </label>
          ))}
        </fieldset>
      </div>

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
                name="usage-wellbeing-x-mode"
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
                  ? 'Full range (-1.0 to +1.0)'
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
              Min ρ
              <input
                type="number"
                min={-1}
                max={1}
                step={0.05}
                value={customMin}
                onChange={(e) => setCustomMin(Number(e.target.value))}
                className="rounded border border-mist px-2 py-1 text-ink bg-paper"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate">
              Max ρ
              <input
                type="number"
                min={-1}
                max={1}
                step={0.05}
                value={customMax}
                onChange={(e) => setCustomMax(Number(e.target.value))}
                className="rounded border border-mist px-2 py-1 text-ink bg-paper"
              />
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );

  const chartFooter = isZoomed ? (
    <div
      className="flex items-center justify-between gap-3 flex-wrap text-xs"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <span className="text-slate">
        Note: X axis is zoomed. Full Spearman ρ range (-1, +1) not shown.
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

  // Numbers table.
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
              <th className="text-right font-normal py-2 px-2">ρ</th>
              <th className="text-right font-normal py-2 px-2">n</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((d) => (
              <tr
                key={d.platform_slug}
                className="border-b border-mist/60"
              >
                <th
                  scope="row"
                  className="text-left font-normal py-1.5 pr-2 pl-2 text-ink"
                >
                  {d.platformLabel}
                </th>
                <td className="text-right py-1.5 px-2 text-ink tabular-nums">
                  {formatNumber(d.r, 3)}
                </td>
                <td className="text-right py-1.5 px-2 text-slate tabular-nums">
                  {formatN(d.n)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p
        className="text-xs text-slate italic mt-3"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Spearman ρ between time spent on each platform (minutes per
        day) and the selected wellbeing outcome at W{selectedWave}.
      </p>
    </>
  );

  // F08 plots a correlation between TWO variables: a composite
  // time-per-day-in-minutes measure (built from us019_hours +
  // us019_minutes; see strata-composites.ts) and the selected
  // wellbeing/loneliness outcome. Surface both as a single bold
  // header — predictor first, outcome second — so a reader sees
  // exactly what's being correlated.
  const timeInfo = surveyQuestionFor(
    'time_per_day_minutes',
    questionTexts,
    meta,
  );
  const outcomeInfo = surveyQuestionFor(outcomeVar, questionTexts, meta);
  const surveyQuestion = [
    timeInfo ? `Predictor — ${formatSurveyQuestion(timeInfo)}` : '',
    outcomeInfo ? `Outcome — ${formatSurveyQuestion(outcomeInfo)}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <StrataChartFrame
      eyebrow="Finding 08 · Correlations"
      title="Does using social media more mean feeling worse?"
      surveyQuestion={surveyQuestion || undefined}
      subtitle={`Spearman ρ between time-per-day on each platform and a wellbeing/loneliness outcome at ${fullWaveLabel(selectedWave, selectedWaveDates)}. ${
        availableWaves.length > 1
          ? `Available in ${availableWaves.map((w) => `Wave ${w}`).join(' and ')} for this outcome — switch waves in the controls.`
          : `Available only in Wave ${selectedWave} for this outcome (other waves lack overlapping respondents).`
      } ${selectedOutcome.direction === 'positive_is_worse' ? 'Positive ρ means more time is associated with HIGHER scores on the outcome (feeling worse).' : 'Positive ρ means more time is associated with HIGHER scores on the outcome (feeling better).'} Bars are colored by sign: teal for positive associations, amber for negative.`}
      chart={chart}
      chartRef={chartRef}
      controls={controlsAside}
      chartFooter={chartFooter}
      customNumbers={numbers}
      isPlaceholderInterpretation
      interpretation={interpretationText}
      methodologyFootnote={`Source: UAS panel Wave ${selectedWave} (UAS${meta.waves.find((w) => w.wave === selectedWave)?.uas_num ?? '?'}). Spearman ρ (per the Phase 3 convention — do not relabel as Pearson). Weighted ρ shown. This is an observational survey — associations do not imply causation. Precomputed JSON generated ${generatedAt}.`}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle:
          'Does using social media more mean feeling worse? Spearman correlations between time-per-day and wellbeing',
        variables: [
          'time_per_day_min_<slug>',
          selectedOutcome.variable,
        ],
        waves: [selectedWave],
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={`strata_usage_wellbeing_${selectedOutcome.variable}`}
    />
  );
}
