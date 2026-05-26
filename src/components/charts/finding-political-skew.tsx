'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  loadGroupComparisons,
  loadMeta,
  loadTrends,
} from '@/lib/strata-data';
import type {
  GroupComparisonRow,
  MetaJson,
  TrendRow,
} from '@/lib/strata-types';
import { CHART_FONTS, STRATA_PALETTES } from '@/lib/strata-charts';
import {
  describeChange,
  formatCI,
  formatN,
  formatNumber,
  waveDateRangeLabel,
} from '@/lib/strata-formatters';
import { StrataChartFrame } from './strata-chart-frame';
import { type Weighting } from './weighted-toggle';

// =====================================================================
// Finding 07 — Which platforms are most politically skewed?
//
// PHASE4_UI_SPEC.md described a stacked horizontal bar showing
// liberal/moderate/conservative composition of each platform's user
// base. The precomputed group_comparisons.json does not currently
// expose the (platform user x political tertile) cross — only mean
// ideology scores (rate_self) by platform_user_<slug>. We reframe the
// finding to use that available signal: a DIVERGING horizontal bar
// of each platform's mean self-rated ideology relative to the
// national mean, color-coded with the political palette (blue =
// liberal direction, purple = near mid, red = conservative
// direction). Same question, defensible with the data we actually
// have.
//
// Significance check: a platform is described as "skewed" only when
// |platformMean - nationalMean| > 1.96 * sqrt(SE_p^2 + SE_nat^2).
// Otherwise it is "indistinguishable from the national average".
// =====================================================================

const OUTCOME = 'rate_self';
const NATIONAL_VAR = 'rate_self';

interface ChartDatum {
  platform_slug: string;
  platformLabel: string;
  skew: number;
  skewErr: [number, number];
  platformMean: number;
  platformCI: [number, number];
  nationalMean: number;
  n: number | null;
  significant: boolean;
}

interface BarTooltipProps {
  active?: boolean;
  payload?: readonly {
    payload?: unknown;
  }[];
}

function PoliticalTooltip({ active, payload }: BarTooltipProps) {
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
        Mean ideology: {formatNumber(datum.platformMean, 1)}{' '}
        <span className="text-slate">
          {formatCI(datum.platformCI[0], datum.platformCI[1], (v) =>
            formatNumber(v, 1),
          )}
        </span>
      </div>
      <div className="text-slate">
        Skew vs national ({formatNumber(datum.nationalMean, 1)}):{' '}
        {datum.skew > 0 ? '+' : ''}
        {formatNumber(datum.skew, 1)}{' '}
        {datum.significant ? '(meaningful)' : '(within MOE)'}
      </div>
      <div className="text-slate">
        n = {datum.n !== null ? formatN(datum.n) : '—'} users
      </div>
    </div>
  );
}

export function FindingPoliticalSkew() {
  const [groupRows, setGroupRows] = useState<GroupComparisonRow[] | null>(null);
  const [trendsRows, setTrendsRows] = useState<TrendRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [weighting, setWeighting] = useState<Weighting>('weighted');
  const [selectedWave, setSelectedWave] = useState<number>(6);
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([loadGroupComparisons(), loadTrends(), loadMeta()])
      .then(([gc, trends, m]) => {
        const platformGroupings = new Set(
          m.platforms.map((p) => `platform_user_${p.slug}`),
        );
        setGroupRows(
          gc.filter(
            (r) =>
              platformGroupings.has(r.grouping_var) &&
              r.outcome === OUTCOME &&
              r.group === 'User',
          ),
        );
        setTrendsRows(trends.filter((r) => r.variable_name === NATIONAL_VAR));
        setMeta(m);
      })
      .catch(setError);
  }, []);

  const availableWaves = useMemo(() => {
    if (!groupRows) return [] as number[];
    return [...new Set(groupRows.map((r) => r.wave))].sort((a, b) => a - b);
  }, [groupRows]);
  const effectiveWave =
    availableWaves.length === 0
      ? selectedWave
      : availableWaves.includes(selectedWave)
        ? selectedWave
        : availableWaves[availableWaves.length - 1];

  const platformLabelBySlug = useMemo(() => {
    if (!meta) return new Map<string, string>();
    return new Map(meta.platforms.map((p) => [p.slug, p.label]));
  }, [meta]);

  // Pull the national mean ideology for the selected wave from trends.
  const nationalRow = useMemo(() => {
    if (!trendsRows) return null;
    return (
      trendsRows.find(
        (r) => r.metric_type === 'mean' && r.wave === effectiveWave,
      ) ?? null
    );
  }, [trendsRows, effectiveWave]);

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!groupRows || !nationalRow) return [];
    if (nationalRow.metric_type !== 'mean') return [];
    const natMean =
      (weighting === 'weighted'
        ? nationalRow.weighted_mean
        : nationalRow.mean) ?? null;
    const natSE =
      (weighting === 'weighted'
        ? nationalRow.weighted_se
        : nationalRow.se) ?? null;
    if (natMean === null || natSE === null) return [];
    const waveRows = groupRows.filter(
      (r) => r.wave === effectiveWave && !r.suppressed,
    );
    const data: ChartDatum[] = [];
    for (const r of waveRows) {
      const mean =
        (weighting === 'weighted' ? r.weighted_value : r.value) ?? null;
      const se =
        (weighting === 'weighted' ? r.weighted_se : r.se) ?? null;
      const lo =
        (weighting === 'weighted' ? r.weighted_ci_lower : r.ci_lower) ?? null;
      const hi =
        (weighting === 'weighted' ? r.weighted_ci_upper : r.ci_upper) ?? null;
      if (mean === null || se === null || lo === null || hi === null) {
        continue;
      }
      const skew = mean - natMean;
      const pooled = Math.sqrt(se * se + natSE * natSE);
      const significant = Math.abs(skew) > 1.96 * pooled;
      const slug = r.grouping_var.replace(/^platform_user_/, '');
      data.push({
        platform_slug: slug,
        platformLabel: platformLabelBySlug.get(slug) ?? slug,
        skew,
        // ErrorBar on a diverging bar: half-width = 1.96 * SE_platform
        skewErr: [1.96 * se, 1.96 * se],
        platformMean: mean,
        platformCI: [lo, hi],
        nationalMean: natMean,
        n: r.n,
        significant,
      });
    }
    // Sort: most liberal (lowest mean / largest negative skew) at the top.
    data.sort((a, b) => a.skew - b.skew);
    return data;
  }, [groupRows, nationalRow, weighting, effectiveWave, platformLabelBySlug]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load political-composition data: {error.message}</p>
      </div>
    );
  }
  if (!groupRows || !trendsRows || !meta) {
    return (
      <div
        className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Loading political-composition data…
      </div>
    );
  }

  const palette = STRATA_PALETTES.political;
  const colorForSkew = (skew: number, significant: boolean): string => {
    if (!significant) return palette.moderate;
    return skew < 0 ? palette.liberal : palette.conservative;
  };

  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');
  const weightingLabel =
    weighting === 'weighted' ? 'Weighted' : 'Unweighted';
  const selectedWaveDates =
    meta.waves.find((w) => w.wave === effectiveWave)?.dates ?? '';

  // X-axis domain: symmetric around 0 so the diverging effect reads
  // cleanly. Cap at +/-35 to keep the busy-platform end visible
  // (Bluesky often pulls out to -30).
  const maxAbs = Math.max(
    5,
    ...chartData.map((d) => Math.abs(d.skew) + d.skewErr[1] + 1),
  );
  const xMax = Math.ceil(maxAbs / 5) * 5;

  // Build the auto-interpretation.
  const significant = chartData.filter((d) => d.significant);
  const liberalSkewed = significant
    .filter((d) => d.skew < 0)
    .sort((a, b) => a.skew - b.skew)
    .slice(0, 3);
  const conservativeSkewed = significant
    .filter((d) => d.skew > 0)
    .sort((a, b) => b.skew - a.skew)
    .slice(0, 3);
  const liberalSentence =
    liberalSkewed.length > 0
      ? `Platforms whose users skew measurably liberal (mean ideology below the national mean of ${formatNumber(
          chartData[0]?.nationalMean ?? 50,
          1,
        )}) include ${liberalSkewed
          .map(
            (d) =>
              `${d.platformLabel} (${formatNumber(d.platformMean, 1)})`,
          )
          .join(', ')}.`
      : 'No platforms show user bases that skew measurably liberal relative to the national mean.';
  const conservativeSentence =
    conservativeSkewed.length > 0
      ? `Platforms whose users skew measurably conservative include ${conservativeSkewed
          .map(
            (d) =>
              `${d.platformLabel} (${formatNumber(d.platformMean, 1)})`,
          )
          .join(', ')}.`
      : 'No platforms show user bases that skew measurably conservative relative to the national mean.';
  const nonSignificantCount = chartData.length - significant.length;
  const nonSigSentence =
    nonSignificantCount > 0
      ? `The remaining ${nonSignificantCount} platform${nonSignificantCount === 1 ? '' : 's'} show mean ideology scores indistinguishable from the national mean at the 95% level.`
      : '';

  // Wave-to-wave shift for the previously-skewed platforms (per the
  // describeChange rule) — only call out platforms whose mean changed
  // significantly between the earliest available wave and the
  // selected wave.
  const earliestWave = availableWaves[0];
  const waveShiftSentences: string[] = [];
  if (
    earliestWave !== undefined &&
    earliestWave !== effectiveWave &&
    groupRows
  ) {
    for (const d of chartData) {
      const earlierRow = groupRows.find(
        (r) =>
          r.grouping_var === `platform_user_${d.platform_slug}` &&
          r.wave === earliestWave &&
          r.group === 'User' &&
          !r.suppressed,
      );
      if (!earlierRow) continue;
      const ev =
        (weighting === 'weighted' ? earlierRow.weighted_value : earlierRow.value) ?? null;
      const ese =
        (weighting === 'weighted' ? earlierRow.weighted_se : earlierRow.se) ?? null;
      const verdict = describeChange(
        ev,
        ese,
        d.platformMean,
        d.platformCI[1] === d.platformCI[0]
          ? 0
          : (d.platformCI[1] - d.platformCI[0]) / (2 * 1.96),
      );
      if (verdict !== 'stable' && ev !== null) {
        const dir = verdict === 'increased' ? 'more conservative' : 'more liberal';
        waveShiftSentences.push(
          `${d.platformLabel}'s user base has shifted ${dir} between W${earliestWave} (${formatNumber(ev, 1)}) and W${effectiveWave} (${formatNumber(d.platformMean, 1)}) at the 95% level.`,
        );
      }
    }
  }

  const interpretationText = [
    liberalSentence,
    conservativeSentence,
    nonSigSentence,
    waveShiftSentences.length > 0 ? waveShiftSentences.join(' ') : '',
    'Error bars on the chart represent the platform-user 95% CI; significance is checked against the national mean using the pooled standard error.',
  ]
    .filter(Boolean)
    .join(' ');

  const csvHeaders = [
    'platform_slug',
    'wave',
    'wave_dates',
    'mean_ideology',
    'ci_lower',
    'ci_upper',
    'n',
    'weighted_mean_ideology',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'weighted_n_eff',
    'suppressed',
  ];
  const csvRows: unknown[][] = groupRows.map((r) => [
    r.grouping_var.replace(/^platform_user_/, ''),
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

  const barHeight = 26;
  const chartHeight = Math.max(260, chartData.length * barHeight + 60);

  const chart = (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 16, right: 32, bottom: 16, left: 8 }}
      >
        <CartesianGrid
          stroke="#E7E1EC"
          strokeDasharray="3 3"
          horizontal={false}
        />
        <XAxis
          type="number"
          domain={[-xMax, xMax]}
          tickFormatter={(v) => (v as number).toString()}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
          label={{
            value: `Mean ideology − national mean (${formatNumber(
              chartData[0]?.nationalMean ?? 50,
              1,
            )})  ·  liberal ←   → conservative`,
            position: 'insideBottom',
            offset: -8,
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
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
          content={(props) => <PoliticalTooltip {...props} />}
        />
        <ReferenceLine x={0} stroke="#18161F" />
        <Bar
          dataKey="skew"
          radius={[2, 2, 2, 2]}
          isAnimationActive={false}
        >
          {chartData.map((d) => (
            <Cell
              key={d.platform_slug}
              fill={colorForSkew(d.skew, d.significant)}
            />
          ))}
          <ErrorBar
            dataKey="skewErr"
            direction="x"
            width={4}
            stroke="#605A6B"
            strokeWidth={1}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
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
                name="political-wave"
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
                W{w} ({waveDateRangeLabel(dates)})
              </span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );

  // Numbers: simple table of platform x wave mean ideology.
  const allWaves = [...availableWaves];
  const allPlatforms = chartData.map((d) => d.platform_slug);

  const tableRows = allPlatforms.map((slug) => {
    const label = platformLabelBySlug.get(slug) ?? slug;
    const waveValues = allWaves.map((w) => {
      const r = groupRows.find(
        (gr) =>
          gr.grouping_var === `platform_user_${slug}` &&
          gr.wave === w &&
          gr.group === 'User',
      );
      if (!r || r.suppressed) return null;
      const v =
        (weighting === 'weighted' ? r.weighted_value : r.value) ?? null;
      return v;
    });
    return { slug, label, waveValues };
  });

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
              {allWaves.map((w) => (
                <th
                  key={w}
                  className="text-right font-normal py-2 px-2"
                >
                  W{w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr key={row.slug} className="border-b border-mist/60">
                <th
                  scope="row"
                  className="text-left font-normal py-1.5 pr-2 pl-2 text-ink"
                >
                  {row.label}
                </th>
                {row.waveValues.map((v, i) => (
                  <td
                    key={i}
                    className="text-right py-1.5 px-2 text-ink tabular-nums"
                  >
                    {typeof v === 'number' ? formatNumber(v, 1) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p
        className="text-xs text-slate italic mt-3"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Values are mean political-ideology self-rating (0 = very
        liberal, 100 = very conservative). National mean for the
        selected wave is{' '}
        {formatNumber(chartData[0]?.nationalMean ?? 50, 1)}.
      </p>
    </>
  );

  return (
    <StrataChartFrame
      eyebrow="Finding 07 · Platform comparison"
      title="Which platforms are most politically skewed?"
      subtitle={`Mean self-reported political ideology (0 = very liberal, 100 = very conservative) of each platform's W${effectiveWave} (${selectedWaveDates}) U.S. adult user base, plotted as a divergence from the national mean of ${formatNumber(
        chartData[0]?.nationalMean ?? 50,
        1,
      )}. The original spec called for a liberal/moderate/conservative composition stack, but the (platform user × ideology tertile) cross is not yet precomputed; mean ideology by user base is the closest available signal. Bars are colored blue when the user base is measurably liberal of the national mean, red when measurably conservative, and purple when within the 95% margin of error.`}
      weighting={weighting}
      onWeightingChange={setWeighting}
      chart={chart}
      chartRef={chartRef}
      controls={waveSelector}
      customNumbers={numbers}
      isPlaceholderInterpretation
      interpretation={interpretationText}
      methodologyFootnote={`Source: UAS panel W${Math.min(...availableWaves)}–W${Math.max(...availableWaves)} (UAS514–UAS519). ${weightingLabel} estimates. Significance vs. the national mean uses pooled SE (sqrt(SE_p² + SE_nat²)); a platform is colored as "skewed" only if |platform mean − national mean| > 1.96 × pooled SE. Error bars on the chart are the platform-user 95% CI. National mean for the selected wave (${formatNumber(
        chartData[0]?.nationalMean ?? 50,
        1,
      )}) is computed from trends.json (variable=rate_self). Precomputed JSON generated ${generatedAt}.`}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle:
          'Which platforms are most politically skewed? Mean ideology of each platform user base',
        variables: ['rate_self', 'platform_user_<slug>'],
        waves: availableWaves,
        weighting,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase="strata_political_skew"
    />
  );
}
