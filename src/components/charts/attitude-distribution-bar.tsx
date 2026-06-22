'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { loadDistributions } from '@/lib/strata-data';
import type { DistributionRow, MetaJson } from '@/lib/strata-types';
import { CHART_FONTS } from '@/lib/strata-charts';
import {
  formatCI,
  formatN,
  formatPercent,
  splitWaveLabelLines,
  waveDateRangeLabel,
} from '@/lib/strata-formatters';
import type { FurtherReadingLink } from '@/lib/trends-categories';
import { StrataChartFrame } from './strata-chart-frame';
import { renderPlatformInterpretation } from './trends-variable-trend';
import { useUrlSync } from '@/lib/use-url-sync';
import { encodeTrendsAttitudeState } from '@/lib/trends-url-state';

// =====================================================================
// AttitudeDistributionBar — 100%-width stacked Likert bars (% per response
// category, one full-width bar per wave) for the social-media-belief items
// (sc001a-f) and tech-regulation (ex004a). First UI use of
// distributions.json.
//
// Each wave is one bar spanning 0-100%; the five ordered categories run
// disagree -> agree (or much-less -> much-more for ex004a) left to right.
// Every wave occupies the same full width, so the eye compares the share
// in each category across waves. The % shift is shown descriptively; the
// signed-off interpretation copy carries the significance verdict
// (mean-gated from trends.json — see trends-categories.ts). Per-segment %
// labels, plus exact % + n + 95% CI per category on hover.
// =====================================================================

interface AttitudeDistributionBarProps {
  meta: MetaJson;
  variable: string; // e.g. 'sc001b'
  title: string;
  optionLabels: string[]; // 5 labels, disagree -> agree order
  interpretation?: string;
  furtherReading?: FurtherReadingLink[];
  filenameBase: string;
  category: string;
  questionKey: string;
}

// Ordered 5-point palette. Disagree side = warm (deep red -> orange),
// neutral = muted slate, agree side = cool (mint -> teal). Warm-vs-cool
// rather than red-vs-green so the two poles stay distinguishable under
// red/green color vision deficiency.
const SEG_COLORS = ['#CC0000', '#FF8C00', '#A9A1B5', '#4DB6AC', '#00897B'];
// Bar dataKeys, disagree -> agree, aligned with SEG_COLORS / optionLabels.
const SEG_KEYS = ['c0', 'c1', 'c2', 'c3', 'c4'] as const;
// Only label segments at least this wide (~3%), so thin slivers don't show
// a label that overflows/overlaps its neighbour; the exact value for every
// category — including those slivers — is in the hover tooltip and the
// wave-by-category table below.
const LABEL_MIN = 0.03;

// Black or white label text by segment-fill luminance, so the in-segment
// percentages stay legible on both dark and light fills.
function readableTextColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#18161F' : '#FFFFFF';
}

interface CatCell {
  label: string;
  value: number | null; // weighted fraction 0..1
  n: number | null;
  ciLo: number | null;
  ciHi: number | null;
  suppressed: boolean;
}

interface WaveRow {
  wave: number;
  c0: number;
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  cells: CatCell[]; // disagree -> agree order, for tooltip + table
}

function pct(v: number | null): number {
  return v == null ? 0 : v;
}

// Three-line Y-axis tick: "Wave N" over the wave's date window wrapped onto
// two lines (e.g. "Oct '24–" / "Jan '25", or "Mar–" / "May '23"), so a long
// cross-year window stays fully on-screen. Reuses the same date formatting
// + en-dash split as the line-chart X-axis ticks.
interface WaveYTickProps {
  x?: number;
  y?: number;
  payload?: { value?: number | string };
  datesByWave?: Map<number, string>;
}
function WaveYTick({ x = 0, y = 0, payload, datesByWave }: WaveYTickProps) {
  const wave = Number(payload?.value);
  const [dateLine1, dateLine2] = splitWaveLabelLines(
    waveDateRangeLabel(datesByWave?.get(wave)),
  );
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={-8}
        dy={-12}
        textAnchor="end"
        fontFamily="var(--font-mono)"
        fontSize={11}
        fill="#18161F"
      >
        {`Wave ${wave}`}
      </text>
      <text
        x={-8}
        dy={1}
        textAnchor="end"
        fontFamily="var(--font-mono)"
        fontSize={10}
        fill="#605A6B"
      >
        {dateLine1}
      </text>
      <text
        x={-8}
        dy={14}
        textAnchor="end"
        fontFamily="var(--font-mono)"
        fontSize={10}
        fill="#605A6B"
      >
        {dateLine2}
      </text>
    </g>
  );
}

interface DistTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}
function DistributionTooltip({ active, payload }: DistTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as WaveRow | undefined;
  if (!row) return null;
  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">{`Wave ${row.wave}`}</div>
      <ul className="space-y-0.5">
        {row.cells.map((c, i) => (
          <li key={c.label} className="flex items-baseline gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-sm shrink-0"
              style={{ backgroundColor: SEG_COLORS[i] }}
            />
            <span className="text-slate w-40 shrink-0">{c.label}</span>
            {c.suppressed || c.value === null ? (
              <span className="text-slate">suppressed (n &lt; 30)</span>
            ) : (
              <span className="text-ink">
                {formatPercent(c.value, 0)}{' '}
                <span className="text-slate">
                  {formatCI(c.ciLo, c.ciHi, (v) => formatPercent(v, 0))} · n=
                  {formatN(c.n)}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AttitudeDistributionBar({
  meta,
  variable,
  title,
  optionLabels,
  interpretation,
  furtherReading,
  filenameBase,
  category,
  questionKey,
}: AttitudeDistributionBarProps) {
  const [rows, setRows] = useState<DistributionRow[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);

  // Two-way URL sync (share feature): no interactive controls beyond the
  // orchestrator's category + question, so only those are encoded.
  useUrlSync(encodeTrendsAttitudeState(category, questionKey, 'full', 0, 100));

  useEffect(() => {
    let active = true;
    loadDistributions()
      .then((all) => {
        if (!active) return;
        setRows(
          all.filter(
            (r) =>
              r.variable_name === variable &&
              r.metric_type === 'likert_option',
          ),
        );
      })
      .catch((e) => active && setError(e));
    return () => {
      active = false;
    };
  }, [variable]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load distribution data: {error.message}</p>
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

  const datesByWave = new Map(meta.waves.map((w) => [w.wave, w.dates]));
  const waves = [...new Set(rows.map((r) => r.wave))].sort((a, b) => a - b);

  const waveRows: WaveRow[] = waves.map((w) => {
    const inWave = rows
      .filter((r) => r.wave === w)
      .sort((a, b) => a.bin_index - b.bin_index);
    // Map positionally (bin_index order) to the 5 supplied labels.
    const cells: CatCell[] = optionLabels.map((label, i) => {
      const r = inWave[i];
      return {
        label,
        value: r && !r.suppressed ? r.weighted_value : null,
        n: r?.n ?? null,
        ciLo: r?.weighted_ci_lower ?? null,
        ciHi: r?.weighted_ci_upper ?? null,
        suppressed: r?.suppressed ?? true,
      };
    });
    return {
      wave: w,
      c0: pct(cells[0].value),
      c1: pct(cells[1].value),
      c2: pct(cells[2].value),
      c3: pct(cells[3].value),
      c4: pct(cells[4].value),
      cells,
    };
  });

  const labelFmt = (value: unknown) => {
    const v = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(v) && v >= LABEL_MIN ? `${Math.round(v * 100)}%` : '';
  };

  const height = Math.max(200, waveRows.length * 64 + 96);

  const chart = (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={waveRows}
          layout="vertical"
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
          barCategoryGap="28%"
        >
          <CartesianGrid stroke="#E7E1EC" strokeDasharray="3 3" horizontal={false} vertical={false} />
          {/* X axis hidden: the stack always spans 0–100% and every segment
              is labelled, so an axis scale would be redundant. */}
          <XAxis type="number" domain={[0, 1]} hide />
          <YAxis
            dataKey="wave"
            type="category"
            width={96}
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={<WaveYTick datesByWave={datesByWave} />}
          />
          <Tooltip
            cursor={{ fill: '#E7E1EC', opacity: 0.4 }}
            content={(props) => <DistributionTooltip {...props} />}
          />
          {SEG_KEYS.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="likert"
              fill={SEG_COLORS[i]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey={key}
                position="center"
                fill={readableTextColor(SEG_COLORS[i])}
                fontSize={10}
                fontFamily="var(--font-mono)"
                formatter={labelFmt}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      {/* Legend (disagree -> agree order) */}
      <div
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2 text-xs"
        style={{ fontFamily: CHART_FONTS.mono }}
      >
        {optionLabels.map((label, i) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: SEG_COLORS[i] }}
            />
            <span className="text-ink">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );

  const subtitle = `Share of respondents choosing each response, from “${optionLabels[0]}” to “${optionLabels[optionLabels.length - 1]}.”`;

  const minWave = Math.min(...waves);
  const maxWave = Math.max(...waves);
  const sourceNote =
    `Source: UAS panel ${
      minWave === maxWave ? `Wave ${minWave}` : `waves ${minWave}–${maxWave}`
    }. Population-level weighted percentages; the five categories sum to ` +
    '100% each wave. On-bar labels for categories below 3% of respondents ' +
    'are suppressed for clarity; the exact percentages appear in the table ' +
    'below. 95% CIs available on hover. Cells with n < 30 are suppressed by ' +
    'design.';

  const csvHeaders = [
    'variable_name',
    'wave',
    'wave_dates',
    'bin_label',
    'weighted_value',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'n',
    'suppressed',
  ];
  const csvRows: unknown[][] = waveRows.flatMap((wr) =>
    wr.cells.map((c) => [
      variable,
      wr.wave,
      datesByWave.get(wr.wave) ?? '',
      c.label,
      c.value,
      c.ciLo,
      c.ciHi,
      c.n,
      c.suppressed,
    ]),
  );

  const numbers = (
    <>
      <table
        className="text-xs w-full border-collapse"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <thead>
          <tr className="text-slate border-b border-mist">
            <th className="text-left font-normal py-2 pr-2">Wave</th>
            {optionLabels.map((label, i) => (
              <th key={label} className="text-right font-normal py-2 px-2">
                <span className="inline-flex items-center gap-1">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: SEG_COLORS[i] }}
                  />
                  {label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {waveRows.map((wr) => (
            <tr key={wr.wave} className="border-b border-mist/60">
              <th
                scope="row"
                className="text-left font-normal py-1.5 pr-2 text-ink"
              >
                Wave {wr.wave}
              </th>
              {wr.cells.map((c) => (
                <td
                  key={c.label}
                  className="text-right py-1.5 px-2 text-ink tabular-nums"
                >
                  {c.value !== null ? formatPercent(c.value, 0) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p
        className="text-xs text-slate italic mt-3"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Hover any bar segment for its exact percentage, 95% confidence
        interval, and n.
      </p>
    </>
  );

  const interpretationNode: ReactNode = interpretation
    ? renderPlatformInterpretation(interpretation, '', furtherReading)
    : `[WORK IN PROGRESS] ${title}. Each bar shows the weighted percentage of respondents choosing each response that wave, from ${optionLabels[0].toLowerCase()} on the left to ${optionLabels[optionLabels.length - 1].toLowerCase()} on the right.`;

  return (
    <StrataChartFrame
      enableShare
      eyebrow="Trends over time · Attitudes"
      title={title}
      subtitle={subtitle}
      titleInCard
      chart={chart}
      chartRef={chartRef}
      customNumbers={numbers}
      isPlaceholderInterpretation={interpretation == null}
      interpretation={interpretationNode}
      methodologyFootnote=""
      sourceNote={sourceNote}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle: title,
        variables: [variable],
        waves,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={filenameBase}
    />
  );
}
