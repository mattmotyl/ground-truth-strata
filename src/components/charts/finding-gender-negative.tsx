'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  loadGroupComparisons,
  loadMeta,
} from '@/lib/strata-data';
import type {
  GroupComparisonRow,
  MetaJson,
} from '@/lib/strata-types';
import { CHART_FONTS, STRATA_PALETTES } from '@/lib/strata-charts';
import {
  describeChange,
  formatCI,
  formatN,
  formatPercent,
  waveDateRangeLabel,
} from '@/lib/strata-formatters';
import { StrataChartFrame } from './strata-chart-frame';
import { type Weighting } from './weighted-toggle';

// =====================================================================
// Finding 06 — Do men and women experience platforms differently?
//
// Source: group_comparisons.json (LAZY-loaded — 6.7 MB), filtered to
// outcome=us024 (in-person negative personal experience) +
// grouping_var=gender. The original spec called for "gender x platform
// nux" but group_comparisons does not include a gender-by-platform
// breakdown of the per-platform NUX item (us003-013 are platform-
// indexed and not aggregated by gender in the precomputed JSON).
// us024 is the closest scalar "negative experience" outcome that
// IS broken out by gender and across multiple waves (W5 + W6).
//
// Renders a grouped vertical bar chart with gender on the X axis and
// one bar per wave (W5 amber, W6 plum) per group. Error bars on every
// bar show the 95% CI.
//
// Interpretation follows the significance rule (describeChange):
//   1. Compare Men vs Women within each wave -> "the gender gap is /
//      isn't statistically meaningful in W{wave}".
//   2. Compare W5 -> W6 within each gender -> "Men's rate has /
//      hasn't changed W5->W6 at 95% significance".
//
// Per the spec, the table summarises every (gender x wave) row with
// CIs + n, since the chart itself only carries the point estimate
// + error bars.
// =====================================================================

const OUTCOME = 'us024';
const OUTCOME_LABEL = 'in-person negative personal experience';

interface ChartDatum {
  group: string; // "Men" / "Women"
  // One value column per wave, with matching CI half-widths.
  [k: string]: number | string | [number, number] | null;
}

interface BarTooltipProps {
  active?: boolean;
  payload?: readonly {
    value?: unknown;
    payload?: unknown;
    dataKey?: unknown;
    color?: string;
  }[];
  label?: unknown;
}

function GenderTooltip({ active, payload, label }: BarTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as ChartDatum | undefined;
  if (!datum) return null;
  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">{String(label ?? '')}</div>
      {payload.map((p) => {
        const key = String(p.dataKey ?? '');
        if (!key.startsWith('w')) return null;
        const wave = Number(key.slice(1));
        const value = typeof p.value === 'number' ? p.value : null;
        if (value === null) return null;
        const lo = datum[`${key}_lo`];
        const hi = datum[`${key}_hi`];
        const n = datum[`${key}_n`];
        return (
          <div key={key} className="flex items-baseline gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-sm shrink-0"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-ink/85 flex-1">W{wave}</span>
            <span className="text-ink font-medium">
              {formatPercent(value)}
            </span>
            {typeof lo === 'number' && typeof hi === 'number' ? (
              <span className="text-slate">{formatCI(lo, hi)}</span>
            ) : null}
            {typeof n === 'number' ? (
              <span className="text-slate">n={formatN(n)}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function FindingGenderNegativeExperience() {
  const [rows, setRows] = useState<GroupComparisonRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [weighting, setWeighting] = useState<Weighting>('weighted');
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([loadGroupComparisons(), loadMeta()])
      .then(([all, m]) => {
        setRows(
          all.filter(
            (r) =>
              r.grouping_var === 'gender' &&
              r.outcome === OUTCOME &&
              r.platform_slug === null,
          ),
        );
        setMeta(m);
      })
      .catch(setError);
  }, []);

  const waves = useMemo(() => {
    if (!rows) return [] as number[];
    return [...new Set(rows.map((r) => r.wave))].sort((a, b) => a - b);
  }, [rows]);

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!rows) return [];
    const groups = ['Men', 'Women'];
    return groups.map((group) => {
      const datum: ChartDatum = { group };
      for (const wave of waves) {
        const row = rows.find(
          (r) => r.group === group && r.wave === wave,
        );
        const value =
          row && !row.suppressed
            ? (weighting === 'weighted' ? row.weighted_value : row.value) ??
              null
            : null;
        const lo =
          row && !row.suppressed
            ? (weighting === 'weighted'
                ? row.weighted_ci_lower
                : row.ci_lower) ?? null
            : null;
        const hi =
          row && !row.suppressed
            ? (weighting === 'weighted'
                ? row.weighted_ci_upper
                : row.ci_upper) ?? null
            : null;
        datum[`w${wave}`] = value;
        datum[`w${wave}_lo`] = lo;
        datum[`w${wave}_hi`] = hi;
        datum[`w${wave}_n`] = row?.n ?? null;
        // ErrorBar dataKey wants [-low, +high] tuple
        if (value !== null && lo !== null && hi !== null) {
          datum[`w${wave}_err`] = [
            Math.max(0, value - lo),
            Math.max(0, hi - value),
          ];
        } else {
          datum[`w${wave}_err`] = null;
        }
      }
      return datum;
    });
  }, [rows, waves, weighting]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load group-comparison data: {error.message}</p>
      </div>
    );
  }
  if (!rows || !meta) {
    return (
      <div
        className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Loading group-comparison data…
      </div>
    );
  }

  // Per-wave bar colors — qualitative8 cycled. W5 gets index 2 (amber),
  // W6 gets index 0 (plum) by convention.
  const waveColor = (wave: number): string => {
    const idx = waves.indexOf(wave);
    const palette = STRATA_PALETTES.qualitative8;
    return palette[idx % palette.length];
  };

  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');
  const weightingLabel =
    weighting === 'weighted' ? 'Weighted' : 'Unweighted';
  const wavesSpan =
    waves.length > 0
      ? `W${Math.min(...waves)}–W${Math.max(...waves)}`
      : '—';

  // --------------------------------------------------------------
  // Significance-aware interpretation (per Matt's rule).
  // Compares (1) gender gap within each wave, (2) wave-to-wave
  // change within each gender. Only describes a difference as
  // meaningful if |diff| > 1.96 * pooled SE.
  // --------------------------------------------------------------
  function statForGroupWave(
    group: string,
    wave: number,
  ): { v: number | null; se: number | null; n: number | null } {
    const row = rows!.find((r) => r.group === group && r.wave === wave);
    if (!row || row.suppressed) return { v: null, se: null, n: null };
    return {
      v: (weighting === 'weighted' ? row.weighted_value : row.value) ?? null,
      se: (weighting === 'weighted' ? row.weighted_se : row.se) ?? null,
      n: row.n,
    };
  }

  const interpretationSentences: string[] = [];
  for (const wave of waves) {
    const m = statForGroupWave('Men', wave);
    const w = statForGroupWave('Women', wave);
    if (m.v === null || w.v === null) continue;
    const gap = describeChange(m.v, m.se, w.v, w.se);
    const mPct = `${(m.v * 100).toFixed(1)}%`;
    const wPct = `${(w.v * 100).toFixed(1)}%`;
    if (gap === 'stable') {
      interpretationSentences.push(
        `In W${wave}, the gender gap is not statistically meaningful at the 95% level (Men ${mPct}, Women ${wPct}).`,
      );
    } else {
      const higher = gap === 'increased' ? 'Women' : 'Men';
      interpretationSentences.push(
        `In W${wave}, ${higher} report this outcome more often (Men ${mPct} vs. Women ${wPct}); the gap exceeds the 95% margin of error.`,
      );
    }
  }
  // Wave-to-wave change within each gender.
  if (waves.length >= 2) {
    const earliest = waves[0];
    const latest = waves[waves.length - 1];
    for (const group of ['Men', 'Women']) {
      const e = statForGroupWave(group, earliest);
      const l = statForGroupWave(group, latest);
      const verdict = describeChange(e.v, e.se, l.v, l.se);
      if (verdict !== 'stable' && e.v !== null && l.v !== null) {
        const direction = verdict === 'increased' ? 'rose' : 'fell';
        interpretationSentences.push(
          `Among ${group}, the rate ${direction} from W${earliest} (${(e.v * 100).toFixed(1)}%) to W${latest} (${(l.v * 100).toFixed(1)}%) — exceeds the 95% margin of error.`,
        );
      }
    }
  }
  const interpretationText =
    interpretationSentences.length > 0
      ? interpretationSentences.join(' ') +
        ' Confidence intervals are shown as error bars on the chart and listed in the Numbers table.'
      : 'Insufficient data to summarise at the 95% level for this finding.';

  // CSV: long-format rows.
  const csvHeaders = [
    'grouping_var',
    'group',
    'outcome',
    'wave',
    'wave_dates',
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
  const csvRows: unknown[][] = rows.map((r) => [
    r.grouping_var,
    r.group,
    r.outcome,
    r.wave,
    meta.waves.find((w) => w.wave === r.wave)?.dates ?? '',
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

  const chart = (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart
        data={chartData}
        margin={{ top: 16, right: 32, bottom: 24, left: 8 }}
      >
        <CartesianGrid stroke="#E7E1EC" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="group"
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={13}
          tickMargin={8}
        />
        <YAxis
          domain={[0, 0.3]}
          tickFormatter={(v) => `${Math.round((v as number) * 100)}%`}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
          tickMargin={4}
        />
        <Tooltip
          cursor={{ fill: '#E7E1EC', opacity: 0.4 }}
          content={(props) => <GenderTooltip {...props} />}
        />
        {waves.map((wave) => (
          <Bar
            key={wave}
            dataKey={`w${wave}`}
            fill={waveColor(wave)}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          >
            <ErrorBar
              dataKey={`w${wave}_err`}
              direction="y"
              width={6}
              stroke="#605A6B"
              strokeWidth={1}
            />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );

  // Compact wave legend (since Recharts default Legend would float at
  // the bottom and feel busy with only 2 series).
  const waveLegend = (
    <div
      className="flex items-center justify-center gap-4 text-xs mt-2"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {waves.map((wave) => {
        const dates =
          meta.waves.find((w) => w.wave === wave)?.dates ?? '';
        return (
          <span key={wave} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: waveColor(wave) }}
            />
            <span className="text-ink">W{wave}</span>
            <span className="text-slate">{waveDateRangeLabel(dates)}</span>
          </span>
        );
      })}
    </div>
  );

  // Numbers section: a small summary table of (group x wave) values.
  const numbers = (
    <>
      <table
        className="text-xs w-full border-collapse"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <thead>
          <tr className="text-slate border-b border-mist">
            <th className="text-left font-normal py-2 pr-2">Group</th>
            {waves.map((w) => (
              <th key={w} className="text-right font-normal py-2 px-2">
                W{w}
              </th>
            ))}
            {waves.map((w) => (
              <th
                key={`${w}-n`}
                className="text-right font-normal py-2 px-2 text-slate"
              >
                n W{w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {['Men', 'Women'].map((group) => {
            const row: ChartDatum | undefined = chartData.find(
              (d) => d.group === group,
            );
            return (
              <tr key={group} className="border-b border-mist/60">
                <th
                  scope="row"
                  className="text-left font-normal py-1.5 pr-2 text-ink"
                >
                  {group}
                </th>
                {waves.map((w) => {
                  const v = row?.[`w${w}`];
                  const lo = row?.[`w${w}_lo`];
                  const hi = row?.[`w${w}_hi`];
                  return (
                    <td
                      key={w}
                      className="text-right py-1.5 px-2 text-ink tabular-nums"
                      title={
                        typeof v === 'number' &&
                        typeof lo === 'number' &&
                        typeof hi === 'number'
                          ? `${formatPercent(v)} ${formatCI(lo, hi)}`
                          : ''
                      }
                    >
                      {typeof v === 'number' ? formatPercent(v) : '—'}
                    </td>
                  );
                })}
                {waves.map((w) => {
                  const n = row?.[`w${w}_n`];
                  return (
                    <td
                      key={`${w}-n`}
                      className="text-right py-1.5 px-2 text-slate tabular-nums"
                    >
                      {typeof n === 'number' ? formatN(n) : '—'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p
        className="text-xs text-slate italic mt-3"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Outcome: us024 — In-person negative personal experience. Values
        are percentages of respondents who reported the experience in
        the past two weeks. Hover any cell for its 95% confidence
        interval.
      </p>
    </>
  );

  return (
    <StrataChartFrame
      eyebrow="Finding 06 · Demographic group differences"
      title="Do men and women experience platforms differently?"
      subtitle={`Share of U.S. adults reporting a recent in-person ${OUTCOME_LABEL}, by gender, across ${wavesSpan}. Negative-experience items broken out by gender are not platform-indexed in the precomputed JSON, so this view uses the in-person counterpart (us024) as the closest available proxy.`}
      weighting={weighting}
      onWeightingChange={setWeighting}
      chart={
        <>
          {chart}
          {waveLegend}
        </>
      }
      chartRef={chartRef}
      customNumbers={numbers}
      isPlaceholderInterpretation
      interpretation={interpretationText}
      methodologyFootnote={`Source: UAS panel ${wavesSpan} (UAS${meta.waves.find((w) => w.wave === waves[0])?.uas_num ?? '?'}–UAS${meta.waves.find((w) => w.wave === waves[waves.length - 1])?.uas_num ?? '?'}). ${weightingLabel} estimates. Error bars and tooltip show 95% CIs. Suppression rule: cells with n < 30 omitted. Precomputed JSON generated ${generatedAt}.`}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle:
          'Do men and women experience platforms differently? In-person negative-experience rates by gender',
        variables: ['us024 (inperson_neg_experience)'],
        waves,
        weighting,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase="strata_gender_negative_experience"
    />
  );
}
