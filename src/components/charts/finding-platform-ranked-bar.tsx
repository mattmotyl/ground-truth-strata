'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { loadMeta, loadPlatformRates } from '@/lib/strata-data';
import type {
  MetaJson,
  PlatformRateMetric,
  PlatformRateRow,
} from '@/lib/strata-types';
import { CHART_FONTS, STRATA_PALETTES } from '@/lib/strata-charts';
import {
  describeChange,
  formatCI,
  formatN,
  formatPercent,
} from '@/lib/strata-formatters';
import { PlatformWaveTable } from './platform-wave-table';
import { StrataChartFrame } from './strata-chart-frame';
import { type Weighting } from './weighted-toggle';

// =====================================================================
// Reusable single-wave ranked horizontal bar chart for the platform-
// comparison family of findings (#2-5 per PHASE4_UI_SPEC.md).
//
// Each instantiation passes a `metric` (one of nux_rate / bftw_rate /
// useful_rate / mcxn_rate, all from platform_rates.json) and the
// finding-specific copy. The component handles:
//   - sort by selected-wave weighted_value descending
//   - color by magnitude (warm scale for harms, cool for positives)
//   - error bars at bar tips for 95% CIs
//   - tooltip with full CI + user count
//   - weighted toggle, wave selector
//   - Numbers table (PlatformWaveTable, same as Finding 01)
//   - significance-aware computed change verdicts the caller can use
//     to author placeholder interpretation text per the rule in
//     describeChange()
//   - PNG / CSV / Cite via the shared chart frame
// =====================================================================

export type ColorScale = 'warm' | 'cool';

export interface RankedFindingProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  metric: PlatformRateMetric;
  colorScale: ColorScale;
  citationTitle: string;
  variables: string[];
  // The interpretation slot accepts a function so each finding can read
  // the live, weighted, significance-checked stats and emit copy that
  // matches Matt's rule (no claims of "increased"/"decreased" without
  // |diff| > 1.96 * pooled SE). Marked [PLACEHOLDER] in the UI.
  buildInterpretation: (ctx: InterpretationContext) => string;
  filenameBase: string;
}

export interface InterpretationContext {
  meta: MetaJson;
  weighting: Weighting;
  selectedWave: number;
  // Rows for the selected wave, sorted by weighted_value descending
  // (suppressed rows sink to the bottom).
  selectedWaveSorted: PlatformRateRow[];
  // All rows for this metric across all waves; useful for "did X
  // change W1 -> W6?" significance checks.
  allWaveRows: PlatformRateRow[];
}

interface ChartDatum {
  platform_slug: string;
  platformLabel: string;
  value: number;
  ciLow: number;
  ciHigh: number;
  ciErr: [number, number];
  n: number | null;
  suppressed: boolean;
}

// Bucket a value into 1-of-N color bins. Bin 0 is the lightest (low
// magnitude); the last bin is the darkest (high magnitude). The chart's
// max value drives the scaling so colors stretch across the visible
// range.
function colorForValue(
  value: number,
  maxValue: number,
  scale: readonly string[],
): string {
  if (maxValue <= 0) return scale[0];
  const fraction = Math.max(0, Math.min(1, value / maxValue));
  const bin = Math.min(scale.length - 1, Math.floor(fraction * scale.length));
  return scale[bin];
}

interface BarTooltipProps {
  active?: boolean;
  payload?: readonly {
    value?: unknown;
    payload?: unknown;
  }[];
}

function BarTooltip({ active, payload }: BarTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as ChartDatum | undefined;
  if (!datum) return null;
  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">{datum.platformLabel}</div>
      {datum.suppressed ? (
        <div className="text-slate">Suppressed (n &lt; 30)</div>
      ) : (
        <>
          <div className="text-ink">
            {formatPercent(datum.value)}{' '}
            <span className="text-slate">
              {formatCI(datum.ciLow, datum.ciHigh)}
            </span>
          </div>
          <div className="text-slate">
            n = {formatN(datum.n)} users
          </div>
        </>
      )}
    </div>
  );
}

export function FindingPlatformRankedBar({
  eyebrow,
  title,
  subtitle,
  metric,
  colorScale,
  citationTitle,
  variables,
  buildInterpretation,
  filenameBase,
}: RankedFindingProps) {
  const [allRows, setAllRows] = useState<PlatformRateRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [weighting, setWeighting] = useState<Weighting>('weighted');
  const [selectedWave, setSelectedWave] = useState<number>(6);
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([loadPlatformRates(), loadMeta()])
      .then(([rows, m]) => {
        setAllRows(rows.filter((r) => r.metric === metric));
        setMeta(m);
      })
      .catch(setError);
  }, [metric]);

  const platformLabelBySlug = useMemo(() => {
    if (!meta) return new Map<string, string>();
    return new Map(meta.platforms.map((p) => [p.slug, p.label]));
  }, [meta]);

  // Default the wave selector to the latest available wave with data.
  // platform_rates.json varies by metric — usage_rate exists for
  // W1-W6, mcxn_rate/useful_rate may be W6-only depending on the
  // question's wave plan. Compute "effectiveWave" inline rather than
  // mirroring availableWaves into the selectedWave state (which would
  // cascade renders and trip the react-hooks/set-state-in-effect
  // lint rule).
  const availableWaves = useMemo(() => {
    if (!allRows) return [] as number[];
    const set = new Set<number>(allRows.map((r) => r.wave));
    return [...set].sort((a, b) => a - b);
  }, [allRows]);
  const effectiveWave =
    availableWaves.length === 0
      ? selectedWave
      : availableWaves.includes(selectedWave)
        ? selectedWave
        : availableWaves[availableWaves.length - 1];

  const sortedRows = useMemo(() => {
    if (!allRows) return [] as PlatformRateRow[];
    const waveRows = allRows.filter((r) => r.wave === effectiveWave);
    return [...waveRows].sort((a, b) => {
      const av =
        a.suppressed
          ? -1
          : (weighting === 'weighted' ? a.weighted_value : a.value) ?? -1;
      const bv =
        b.suppressed
          ? -1
          : (weighting === 'weighted' ? b.weighted_value : b.value) ?? -1;
      if (av !== bv) return bv - av;
      return a.platform_label.localeCompare(b.platform_label);
    });
  }, [allRows, effectiveWave, weighting]);

  const chartData = useMemo<ChartDatum[]>(() => {
    return sortedRows
      .filter((r) => !r.suppressed)
      .map((r) => {
        const value =
          (weighting === 'weighted' ? r.weighted_value : r.value) ?? 0;
        const lo =
          (weighting === 'weighted' ? r.weighted_ci_lower : r.ci_lower) ?? value;
        const hi =
          (weighting === 'weighted' ? r.weighted_ci_upper : r.ci_upper) ?? value;
        return {
          platform_slug: r.platform_slug,
          platformLabel:
            platformLabelBySlug.get(r.platform_slug) ?? r.platform_label,
          value,
          ciLow: lo,
          ciHigh: hi,
          ciErr: [Math.max(0, value - lo), Math.max(0, hi - value)] as [
            number,
            number,
          ],
          n: r.n,
          suppressed: false,
        };
      });
  }, [sortedRows, weighting, platformLabelBySlug]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load platform-rate data: {error.message}</p>
      </div>
    );
  }
  if (!allRows || !meta) {
    return (
      <div
        className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Loading platform-rate data…
      </div>
    );
  }

  const palette =
    colorScale === 'warm'
      ? STRATA_PALETTES.harm
      : STRATA_PALETTES.positive;
  const chartMax = Math.max(0.05, ...chartData.map((d) => d.ciHigh));
  const xDomainMax = Math.min(1, Math.ceil(chartMax * 10) / 10);

  const interpretationText = buildInterpretation({
    meta,
    weighting,
    selectedWave: effectiveWave,
    selectedWaveSorted: sortedRows,
    allWaveRows: allRows,
  });

  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');
  const selectedWaveDates =
    meta.waves.find((w) => w.wave === effectiveWave)?.dates ?? '';
  const weightingLabel =
    weighting === 'weighted' ? 'Weighted' : 'Unweighted';
  const wavesSpan = `W${Math.min(...availableWaves)}–W${Math.max(...availableWaves)}`;
  const fullSubtitle = `${subtitle} Data shown for W${effectiveWave} (${selectedWaveDates}). Use the wave selector to switch waves.`;

  const csvHeaders = [
    'platform_slug',
    'platform_label',
    'wave',
    'wave_dates',
    'metric',
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
  const csvRows: unknown[][] = allRows.map((r) => [
    r.platform_slug,
    r.platform_label,
    r.wave,
    meta.waves.find((w) => w.wave === r.wave)?.dates ?? '',
    r.metric,
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

  // Per-platform color swatches for the Numbers table — match each row
  // to its bar color so the table and chart visually align.
  const swatchBySlug = new Map<string, string>();
  chartData.forEach((d) => {
    swatchBySlug.set(
      d.platform_slug,
      colorForValue(d.value, xDomainMax, palette),
    );
  });

  const barHeight = 26;
  const chartHeight = Math.max(
    260,
    chartData.length * barHeight + 64,
  );

  const chart = (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 8, right: 60, bottom: 16, left: 8 }}
      >
        <CartesianGrid stroke="#E7E1EC" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, xDomainMax]}
          tickFormatter={(v) => `${Math.round((v as number) * 100)}%`}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
        />
        <YAxis
          dataKey="platformLabel"
          type="category"
          width={120}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
          tick={{ fill: '#18161F' }}
        />
        <Tooltip
          cursor={{ fill: '#E7E1EC', opacity: 0.4 }}
          content={(props) => <BarTooltip {...props} />}
        />
        <Bar
          dataKey="value"
          radius={[0, 2, 2, 0]}
          isAnimationActive={false}
          label={{
            position: 'right',
            formatter: (v: unknown) =>
              typeof v === 'number' ? formatPercent(v) : '',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fill: '#18161F',
          }}
        >
          {chartData.map((d) => (
            <Cell
              key={d.platform_slug}
              fill={colorForValue(d.value, xDomainMax, palette)}
            />
          ))}
          <ErrorBar
            dataKey="ciErr"
            direction="x"
            width={4}
            stroke="#605A6B"
            strokeWidth={1}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const suppressedCount = sortedRows.filter((r) => r.suppressed).length;
  const suppressedNote =
    suppressedCount > 0
      ? sortedRows
          .filter((r) => r.suppressed)
          .map(
            (r) => platformLabelBySlug.get(r.platform_slug) ?? r.platform_label,
          )
          .join(', ')
      : null;

  const methodologyFootnoteText =
    `Source: UAS panel ${wavesSpan} (UAS514–UAS519), 2023–2025. ${weightingLabel} estimates. 95% CIs shown as error bars at bar tips and in hover tooltip. n shown in tooltip is the count of respondents asked about each platform. Cells with n < 30 are suppressed by design${
      suppressedNote ? ` (this wave: ${suppressedNote})` : ''
    }. Precomputed JSON generated ${generatedAt}.`;

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
                name={`wave-${metric}`}
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
                W{w} ({dates.split(',')[0]})
              </span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );

  return (
    <StrataChartFrame
      eyebrow={eyebrow}
      title={title}
      subtitle={fullSubtitle}
      weighting={weighting}
      onWeightingChange={setWeighting}
      chart={chart}
      chartRef={chartRef}
      controls={waveSelector}
      customNumbers={
        <>
          <PlatformWaveTable
            rows={allRows}
            meta={meta}
            weighting={weighting}
            hidden={new Set<string>()}
            swatchBySlug={swatchBySlug}
          />
          <p
            className="text-xs text-slate italic mt-3"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Table covers all platforms in the panel across all waves
            this metric was asked. Hover any cell for its 95%
            confidence interval and user count. Swatches indicate
            relative magnitude in the currently-selected wave.
          </p>
        </>
      }
      isPlaceholderInterpretation
      interpretation={interpretationText}
      methodologyFootnote={methodologyFootnoteText}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle: citationTitle,
        variables,
        waves: availableWaves,
        weighting,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={filenameBase}
    />
  );
}

// =====================================================================
// Helper that any caller can use to write significance-aware
// interpretation copy. Returns the slug -> { value, change verdict
// against the earliest available wave } mapping for the selected wave.
// Matches the rule in describeChange (1.96 * pooled SE).
// =====================================================================

export interface PlatformChangeRow {
  slug: string;
  label: string;
  selectedValue: number;
  selectedCI: [number, number];
  selectedN: number | null;
  earliestWave: number;
  earliestValue: number | null;
  change: 'increased' | 'decreased' | 'stable';
}

export function computePlatformChanges(
  ctx: InterpretationContext,
  earliestWave?: number,
): PlatformChangeRow[] {
  const { allWaveRows, selectedWaveSorted, weighting, meta } = ctx;
  const waves = [...new Set(allWaveRows.map((r) => r.wave))].sort((a, b) => a - b);
  const earliest = earliestWave ?? waves[0];
  const platformLabelBySlug = new Map(
    meta.platforms.map((p) => [p.slug, p.label]),
  );
  const result: PlatformChangeRow[] = [];
  for (const sel of selectedWaveSorted) {
    if (sel.suppressed) continue;
    const sv =
      (weighting === 'weighted' ? sel.weighted_value : sel.value) ?? 0;
    const sse =
      (weighting === 'weighted' ? sel.weighted_se : sel.se) ?? 0;
    const lo =
      (weighting === 'weighted' ? sel.weighted_ci_lower : sel.ci_lower) ?? sv;
    const hi =
      (weighting === 'weighted' ? sel.weighted_ci_upper : sel.ci_upper) ?? sv;
    const earliestRow = allWaveRows.find(
      (r) => r.wave === earliest && r.platform_slug === sel.platform_slug,
    );
    const ev =
      earliestRow && !earliestRow.suppressed
        ? (weighting === 'weighted'
            ? earliestRow.weighted_value
            : earliestRow.value) ?? null
        : null;
    const ese =
      earliestRow && !earliestRow.suppressed
        ? (weighting === 'weighted'
            ? earliestRow.weighted_se
            : earliestRow.se) ?? null
        : null;
    const change = describeChange(ev, ese, sv, sse);
    result.push({
      slug: sel.platform_slug,
      label:
        platformLabelBySlug.get(sel.platform_slug) ?? sel.platform_label,
      selectedValue: sv,
      selectedCI: [lo, hi],
      selectedN: sel.n,
      earliestWave: earliest,
      earliestValue: ev,
      change,
    });
  }
  return result;
}
