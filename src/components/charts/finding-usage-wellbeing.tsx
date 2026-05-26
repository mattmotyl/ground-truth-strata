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
  XAxis,
  YAxis,
} from 'recharts';
import { loadCorrelations, loadMeta } from '@/lib/strata-data';
import type {
  CorrelationRow,
  MetaJson,
} from '@/lib/strata-types';
import { CHART_FONTS, STRATA_PALETTES } from '@/lib/strata-charts';
import {
  formatN,
  formatNumber,
} from '@/lib/strata-formatters';
import { StrataChartFrame } from './strata-chart-frame';
import { type Weighting } from './weighted-toggle';

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
// Significance: each correlation row carries a p_value (Spearman test
// of independence). Only correlations with p < 0.05 are colored as
// meaningful; the rest land in a muted gray. The interpretation
// names only the significant correlations to honor Matt's
// "no overstating" rule. See feedback_significance_rule.md.
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
  pValue: number;
  significant: boolean;
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
      <div className="text-slate">
        n = {formatN(datum.n)}, p ={' '}
        {datum.pValue < 0.001
          ? '< 0.001'
          : formatNumber(datum.pValue, 3)}
      </div>
      <div className="text-slate">
        {datum.significant
          ? 'Statistically meaningful at p < 0.05'
          : 'Not statistically meaningful at p < 0.05'}
      </div>
    </div>
  );
}

export function FindingUsageWellbeing() {
  const [rows, setRows] = useState<CorrelationRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [weighting, setWeighting] = useState<Weighting>('weighted');
  const [outcomeVar, setOutcomeVar] = useState<string>('ex003c');
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([loadCorrelations(), loadMeta()])
      .then(([all, m]) => {
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

  const selectedWave = availableWaves[availableWaves.length - 1] ?? 5;

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
      const rho =
        (weighting === 'weighted' ? r.weighted_r : r.r) ?? null;
      const n = r.n ?? 0;
      const p = r.p_value ?? 1;
      if (rho === null || n < 30) continue;
      const slug = timeVar.replace(/^time_per_day_min_/, '');
      data.push({
        platform_slug: slug,
        platformLabel: platformLabelBySlug.get(slug) ?? slug,
        r: rho,
        n,
        pValue: p,
        significant: p < 0.05,
      });
    }
    data.sort((a, b) => b.r - a.r);
    return data;
  }, [rows, selectedWave, outcomeVar, weighting, platformLabelBySlug]);

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
  const colorForBar = (d: ChartDatum): string => {
    if (!d.significant) return STRATA_PALETTES.diverging.zero + '40';
    return d.r > 0
      ? STRATA_PALETTES.diverging.above
      : STRATA_PALETTES.diverging.below;
  };

  const maxAbs = Math.max(
    0.1,
    ...chartData.map((d) => Math.abs(d.r)),
  );
  const xMax = Math.ceil(maxAbs * 10) / 10 + 0.05;

  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');
  const weightingLabel =
    weighting === 'weighted' ? 'Weighted' : 'Unweighted';
  const selectedWaveDates =
    meta.waves.find((w) => w.wave === selectedWave)?.dates ?? '';

  // Interpretation copy. Per the project rule: name only statistically
  // significant correlations and explicitly call out the "feeling
  // worse" direction so a reader knows which sign means what.
  const significant = chartData.filter((d) => d.significant);
  const positiveSig = significant.filter((d) => d.r > 0);
  const negativeSig = significant.filter((d) => d.r < 0);
  const worseLabel =
    selectedOutcome.direction === 'positive_is_worse'
      ? 'more of the outcome (feeling worse)'
      : 'more of the outcome (feeling better)';
  const betterLabel =
    selectedOutcome.direction === 'positive_is_worse'
      ? 'less of the outcome (feeling better)'
      : 'less of the outcome (feeling worse)';
  const moreTimeMore =
    positiveSig.length > 0
      ? `On ${positiveSig.map((d) => `${d.platformLabel} (ρ=${formatNumber(d.r, 3)}, n=${formatN(d.n)})`).join(', ')}, more time per day is associated with ${worseLabel}.`
      : `No platforms show a statistically meaningful positive correlation between time-per-day and this outcome.`;
  const moreTimeLess =
    negativeSig.length > 0
      ? `On ${negativeSig.map((d) => `${d.platformLabel} (ρ=${formatNumber(d.r, 3)}, n=${formatN(d.n)})`).join(', ')}, more time per day is associated with ${betterLabel}.`
      : `No platforms show a statistically meaningful negative correlation between time-per-day and this outcome.`;
  const nonSigCount = chartData.length - significant.length;
  const nonSigSentence =
    nonSigCount > 0
      ? `Correlations on the remaining ${nonSigCount} platform${nonSigCount === 1 ? '' : 's'} fall short of statistical significance (p ≥ 0.05) at this wave's sample sizes — interpret as "no detectable association".`
      : '';
  const caveat =
    'Spearman ρ is bounded by [-1, +1]; correlations of |ρ| < 0.1 are typically considered small even when statistically meaningful. This is an observational survey: associations do not imply causation. Time-per-day data is only available in W5 in the current precomputed JSON, so this finding is single-wave.';
  const interpretationText = [
    `Outcome variable: ${selectedOutcome.label}. ${selectedOutcome.direction === 'positive_is_worse' ? 'Higher scores indicate WORSE wellbeing.' : 'Higher scores indicate BETTER wellbeing.'}`,
    moreTimeMore,
    moreTimeLess,
    nonSigSentence,
    caveat,
  ]
    .filter(Boolean)
    .join(' ');

  const csvHeaders = [
    'platform_slug',
    'outcome_variable',
    'wave',
    'wave_dates',
    'spearman_r_unweighted',
    'spearman_r_weighted',
    'p_value',
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
        r.r,
        r.weighted_r,
        r.p_value,
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
          domain={[-xMax, xMax]}
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
      </BarChart>
    </ResponsiveContainer>
  );

  // Outcome variable selector.
  const outcomeSelector = (
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
              className={outcomeVar === o.variable ? 'text-ink' : 'text-slate'}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {o.label}
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );

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
              <th className="text-right font-normal py-2 px-2">p</th>
              <th className="text-right font-normal py-2 px-2">
                95% sig.
              </th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((d) => (
              <tr
                key={d.platform_slug}
                className={
                  'border-b border-mist/60 ' +
                  (d.significant ? '' : 'opacity-60')
                }
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
                <td className="text-right py-1.5 px-2 text-slate tabular-nums">
                  {d.pValue < 0.001
                    ? '<0.001'
                    : formatNumber(d.pValue, 3)}
                </td>
                <td className="text-right py-1.5 px-2 text-slate">
                  {d.significant ? '✓' : '—'}
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
        Bars in the chart are faded when p ≥ 0.05.
      </p>
    </>
  );

  return (
    <StrataChartFrame
      eyebrow="Finding 08 · Correlations"
      title="Does using social media more mean feeling worse?"
      subtitle={`Spearman ρ between time-per-day on each platform and a wellbeing/loneliness outcome at W${selectedWave} (${selectedWaveDates}). Time-per-day data is only available in W${selectedWave} in the precomputed JSON, so this is a single-wave snapshot. ${selectedOutcome.direction === 'positive_is_worse' ? 'Positive ρ means more time is associated with HIGHER scores on the outcome (feeling worse).' : 'Positive ρ means more time is associated with HIGHER scores on the outcome (feeling better).'} Bars are colored only when the underlying p-value is below 0.05.`}
      weighting={weighting}
      onWeightingChange={setWeighting}
      chart={chart}
      chartRef={chartRef}
      controls={outcomeSelector}
      customNumbers={numbers}
      isPlaceholderInterpretation
      interpretation={interpretationText}
      methodologyFootnote={`Source: UAS panel W${selectedWave} (UAS${meta.waves.find((w) => w.wave === selectedWave)?.uas_num ?? '?'}). Spearman ρ (per the Phase 3 convention — do not relabel as Pearson). ${weightingLabel} ρ shown. Significance: p < 0.05 from the Spearman test of independence. Faded bars are not statistically meaningful at the 95% level. This is an observational survey — associations do not imply causation. Precomputed JSON generated ${generatedAt}.`}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle:
          'Does using social media more mean feeling worse? Spearman correlations between time-per-day and wellbeing',
        variables: [
          'time_per_day_min_<slug>',
          selectedOutcome.variable,
        ],
        waves: [selectedWave],
        weighting,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={`strata_usage_wellbeing_${selectedOutcome.variable}`}
    />
  );
}
