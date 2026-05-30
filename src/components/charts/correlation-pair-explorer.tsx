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
import type { CorrelationRow, MetaJson } from '@/lib/strata-types';
import {
  BAND_COLOR,
  BAND_LABEL,
  buildPairSeries,
  buildRespondentVarCatalog,
  catalogVarsPresentInData,
  effectBandOf,
  groupByDomain,
  toNounPhrase,
  type RespondentVar,
} from '@/lib/explore-adapters';
import { CHART_FONTS } from '@/lib/strata-charts';
import {
  formatN,
  formatNumber,
  fullWaveLabel,
  splitWaveLabelLines,
  waveDateRangeLabel,
} from '@/lib/strata-formatters';
import { StrataChartFrame } from './strata-chart-frame';

// =====================================================================
// /explore — Variable-pair correlation explorer.
//
// Pick any two RESPONDENT-LEVEL variables (predictor + outcome). Because
// correlations.json holds only a precomputed Spearman ρ per pair per wave
// — no raw data points, no CI — there is nothing to scatter. We instead
// draw ρ as one horizontal bar PER WAVE the pair was fielded in, colored
// by magnitude band (negligible / weak / moderate / strong). This makes
// cross-wave stability visible and is honest about what the file holds.
// Most pairs exist in a single wave (the variables themselves are often
// single-wave), in which case one bar shows with a source-note caveat.
// No p-values; ρ labelled as Spearman (never Pearson).
// =====================================================================

// Default pair: political self-placement × overall life satisfaction.
// Both are fielded across multiple waves, so the default view shows the
// over-waves bar layout rather than a degenerate single bar.
const DEFAULT_PREDICTOR = 'rate_self';
const DEFAULT_OUTCOME = 'ls002l';

interface ChartDatum {
  wave: number;
  waveLabel: string;
  r: number;
  n: number | null;
  nEff: number | null;
}

interface BarTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}

function PairTooltip({ active, payload }: BarTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload as ChartDatum | undefined;
  if (!d) return null;
  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">{d.waveLabel}</div>
      <div className="text-ink">
        Spearman ρ ={' '}
        <span className="font-medium">{formatNumber(d.r, 3)}</span>
      </div>
      <div className="text-slate">n = {formatN(d.n)}</div>
    </div>
  );
}

// Two-line Y-axis tick showing the short wave date window
// ("Mar–May '23"), matching the X-axis tick style used elsewhere.
interface AxisTickProps {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
}

function WaveTick({ x = 0, y = 0, payload }: AxisTickProps) {
  const [line1, line2] = splitWaveLabelLines(String(payload?.value ?? ''));
  return (
    <text
      x={x}
      y={y}
      textAnchor="end"
      fill="#605A6B"
      fontSize={11}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <tspan x={x} dy="-0.1em">
        {line1}
      </tspan>
      {line2 ? (
        <tspan x={x} dy="1.1em">
          {line2}
        </tspan>
      ) : null}
    </text>
  );
}

// Grouped native select — robust, accessible, and matches the radio/
// native-control pattern used elsewhere in the app. (cmdk search over
// these ~59 variables is a possible future enhancement.)
function VariableSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: RespondentVar[];
  onChange: (name: string) => void;
}) {
  const groups = groupByDomain(options);
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-xs text-slate uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-mist bg-paper px-2 py-1.5 text-sm text-ink"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {groups.map((g) => (
          <optgroup key={g.domain} label={g.domainLabel}>
            {g.vars.map((v) => (
              <option key={v.name} value={v.name}>
                {v.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

export function CorrelationPairExplorer() {
  const [rows, setRows] = useState<CorrelationRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [predictor, setPredictor] = useState<string>(DEFAULT_PREDICTOR);
  const [outcome, setOutcome] = useState<string>(DEFAULT_OUTCOME);
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([loadCorrelations(), loadMeta()])
      .then(([all, m]) => {
        setRows(all);
        setMeta(m);
      })
      .catch(setError);
  }, []);

  const catalog = useMemo<RespondentVar[]>(
    () => (meta ? buildRespondentVarCatalog(meta) : []),
    [meta],
  );
  const pickable = useMemo<RespondentVar[]>(
    () => (rows ? catalogVarsPresentInData(catalog, rows) : []),
    [catalog, rows],
  );
  const byName = useMemo(
    () => new Map(catalog.map((v) => [v.name, v])),
    [catalog],
  );

  const series = useMemo(
    () => (rows ? buildPairSeries(rows, predictor, outcome) : []),
    [rows, predictor, outcome],
  );

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!meta) return [];
    return series.map((p) => ({
      wave: p.wave,
      waveLabel: waveDateRangeLabel(
        meta.waves.find((w) => w.wave === p.wave)?.dates ?? '',
      ),
      r: p.r,
      n: p.n,
      nEff: p.nEff,
    }));
  }, [series, meta]);

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
        style={{ fontFamily: CHART_FONTS.mono }}
      >
        Loading correlation data…
      </div>
    );
  }

  const predictorVar = byName.get(predictor);
  const outcomeVar = byName.get(outcome);
  const samePair = predictor === outcome;

  const barHeight = 34;
  const chartHeight = Math.max(220, chartData.length * barHeight + 70);

  const chart =
    samePair ? (
      <div
        className="py-16 text-center text-slate text-sm"
        style={{ fontFamily: CHART_FONTS.mono }}
      >
        Choose two different variables to see their correlation.
      </div>
    ) : chartData.length === 0 ? (
      <div
        className="py-16 text-center text-slate text-sm"
        style={{ fontFamily: CHART_FONTS.mono }}
      >
        These two variables were never measured in the same wave, so no
        correlation is available for this pair.
      </div>
    ) : (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 16, right: 32, bottom: 28, left: 8 }}
        >
          <CartesianGrid stroke="#E7E1EC" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={[-1, 1]}
            tickFormatter={(v) => formatNumber(v as number, 1)}
            stroke="#605A6B"
            fontFamily={CHART_FONTS.mono}
            fontSize={12}
            label={{
              value: 'Spearman ρ',
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
            dataKey="waveLabel"
            type="category"
            width={72}
            stroke="#605A6B"
            tick={<WaveTick />}
          />
          <Tooltip
            cursor={{ fill: '#E7E1EC', opacity: 0.4 }}
            content={(props) => <PairTooltip {...props} />}
          />
          <ReferenceLine x={0} stroke="#18161F" />
          <Bar dataKey="r" radius={[2, 2, 2, 2]} isAnimationActive={false}>
            {chartData.map((d) => (
              <Cell key={d.wave} fill={BAND_COLOR[effectBandOf(d.r)]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );

  // ── Controls ──────────────────────────────────────────────────────
  const controlsAside = (
    <div className="space-y-5">
      <VariableSelect
        id="pair-var1"
        label="Variable 1"
        value={predictor}
        options={pickable}
        onChange={setPredictor}
      />
      <VariableSelect
        id="pair-var2"
        label="Variable 2"
        value={outcome}
        options={pickable}
        onChange={setOutcome}
      />
      {/* Magnitude-band legend */}
      <div className="space-y-2">
        <p
          className="text-xs text-slate uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Bar color
        </p>
        <ul className="space-y-1 text-xs" style={{ fontFamily: CHART_FONTS.mono }}>
          {(['strong', 'moderate', 'weak', 'none'] as const).map((band) => (
            <li key={band} className="flex items-center gap-2 text-slate">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: BAND_COLOR[band] }}
              />
              {BAND_LABEL[band]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  // ── THE NUMBERS ───────────────────────────────────────────────────
  const numbers = (
    <>
      <div className="overflow-x-auto">
        <table
          className="text-xs w-full border-collapse"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <thead>
            <tr className="text-slate border-b border-mist">
              <th className="text-left font-normal py-2 pr-2 pl-2">Wave</th>
              <th className="text-right font-normal py-2 px-2">ρ</th>
              <th className="text-right font-normal py-2 px-2">n</th>
              <th className="text-right font-normal py-2 px-2">n_eff</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((d) => (
              <tr key={d.wave} className="border-b border-mist/60">
                <th
                  scope="row"
                  className="text-left font-normal py-1.5 pr-2 pl-2 text-ink"
                >
                  {fullWaveLabel(
                    d.wave,
                    meta.waves.find((w) => w.wave === d.wave)?.dates ?? '',
                  )}
                </th>
                <td className="text-right py-1.5 px-2 text-ink tabular-nums">
                  {formatNumber(d.r, 3)}
                </td>
                <td className="text-right py-1.5 px-2 text-slate tabular-nums">
                  {formatN(d.n)}
                </td>
                <td className="text-right py-1.5 px-2 text-slate tabular-nums">
                  {formatN(d.nEff)}
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
        Weighted Spearman ρ. correlations.json carries no confidence
        interval and no p-value for these estimates.
      </p>
    </>
  );

  // ── Interpretation (placeholder for Matt) ─────────────────────────
  const predLabel = predictorVar?.label ?? predictor;
  const outLabel = outcomeVar?.label ?? outcome;
  const singleWave = chartData.length === 1;
  const strongest = chartData.reduce<ChartDatum | null>(
    (best, d) => (best === null || Math.abs(d.r) > Math.abs(best.r) ? d : best),
    null,
  );
  const interpretationText =
    samePair || chartData.length === 0
      ? `Pick two different respondent-level variables to compare. "${predLabel}" and "${outLabel}" ${
          samePair
            ? 'are the same variable.'
            : 'were not fielded in any common wave, so no correlation exists.'
        }`
      : [
          `Spearman ρ between "${predLabel}" and "${outLabel}"${
            singleWave
              ? `, available only at Wave ${chartData[0].wave}.`
              : `, shown for each wave both were fielded.`
          }`,
          strongest
            ? `The largest association is ρ = ${formatNumber(
                strongest.r,
                3,
              )} at Wave ${strongest.wave} — a ${
                BAND_LABEL[effectBandOf(strongest.r)]
              } ${strongest.r >= 0 ? 'positive' : 'negative'} association.`
            : '',
          'Treat |ρ| below 0.1 as essentially noise. ρ is bounded by [-1, +1]; this is an observational survey, so associations do not imply causation.',
        ]
          .filter(Boolean)
          .join(' ');

  // ── CSV ───────────────────────────────────────────────────────────
  const csvHeaders = [
    'predictor',
    'predictor_label',
    'outcome',
    'outcome_label',
    'wave',
    'wave_dates',
    'spearman_rho',
    'n',
    'weighted_n_eff',
  ];
  const csvRows: unknown[][] = series.map((p) => [
    predictor,
    predLabel,
    outcome,
    outLabel,
    p.wave,
    meta.waves.find((w) => w.wave === p.wave)?.dates ?? '',
    p.r,
    p.n,
    p.nEff,
  ]);

  const waveCoverageNote = singleWave
    ? ` This pair is available in a single wave (Wave ${chartData[0]?.wave}); cross-wave stability cannot be assessed.`
    : '';

  return (
    <StrataChartFrame
      eyebrow="Explore · Variable pairs over time"
      title={`How are ${toNounPhrase(predLabel)} and ${toNounPhrase(
        outLabel,
      )} related?`}
      subtitle={
        samePair
          ? 'Choose two different variables.'
          : `Weighted Spearman ρ between ${toNounPhrase(predLabel)} and ${toNounPhrase(
              outLabel,
            )}.`
      }
      titleInCard
      chart={chart}
      chartRef={chartRef}
      controls={controlsAside}
      customNumbers={numbers}
      isPlaceholderInterpretation
      interpretation={interpretationText}
      methodologyFootnote=""
      sourceNote={`Source: UAS panel. Weighted Spearman ρ, a rank-based correlation measure. Correlations are per-wave and based on weighted survey estimates.${waveCoverageNote}`}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle: `Correlation between ${predLabel} and ${outLabel} (weighted Spearman ρ)`,
        variables: [predictor, outcome],
        waves: series.map((p) => p.wave),
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={`strata_correlation_${predictor}_${outcome}`}
    />
  );
}
