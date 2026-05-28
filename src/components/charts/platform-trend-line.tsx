'use client';

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_FONTS, CHART_HEIGHTS } from '@/lib/strata-charts';
import {
  formatCI,
  formatN,
  formatPercent,
  splitWaveLabelLines,
  waveDateRangeLabel,
} from '@/lib/strata-formatters';
import type { TrendPoint } from '@/lib/platform-report-adapters';

// Single-series trend line with a 95% confidence ribbon. Used full-size
// for the /platforms Usage section and in `compact` form for the
// Experiences 2×2 mini-charts. Dumb/presentational — the orchestrator
// and adapters own all data shaping.

const PLUM = '#4B2E63';

interface ChartRow {
  waveLabel: string;
  waveDates: string;
  value: number | null;
  // Recharts renders a band when the dataKey value is a [min, max] tuple.
  ciBand: [number, number] | null;
  ciLow: number | null;
  ciHigh: number | null;
  n: number | null;
}

function buildRows(data: TrendPoint[]): ChartRow[] {
  return data.map((p) => ({
    waveLabel: waveDateRangeLabel(p.waveDates) || `Wave ${p.wave}`,
    waveDates: p.waveDates,
    value: p.value,
    ciBand:
      p.value !== null && p.ciLow !== null && p.ciHigh !== null
        ? [p.ciLow, p.ciHigh]
        : null,
    ciLow: p.ciLow,
    ciHigh: p.ciHigh,
    n: p.n,
  }));
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  valueFormat: (v: number | null | undefined) => string;
}

function TrendTooltip({ active, payload, valueFormat }: TrendTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as ChartRow | undefined;
  if (!row || row.value === null) return null;
  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">
        {row.waveDates || row.waveLabel}
      </div>
      <div className="text-ink">
        {valueFormat(row.value)}{' '}
        <span className="text-slate">
          {formatCI(row.ciLow, row.ciHigh, valueFormat)}
        </span>
      </div>
      <div className="text-slate">n = {formatN(row.n)} users</div>
    </div>
  );
}

interface AxisTickProps {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
}

// Two-line X tick so a long date range ("Nov '23–Feb '24") stays legible.
function TwoLineXTick(props: AxisTickProps) {
  const value = props.payload?.value;
  if (typeof value !== 'string') return null;
  const [line1, line2] = splitWaveLabelLines(value);
  return (
    <g transform={`translate(${props.x ?? 0},${props.y ?? 0})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize={11}
        fill="#605A6B"
      >
        {line1}
      </text>
      <text
        x={0}
        y={0}
        dy={28}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize={11}
        fill="#605A6B"
      >
        {line2}
      </text>
    </g>
  );
}

interface PlatformTrendLineProps {
  data: TrendPoint[];
  color?: string;
  yDomain?: [number, number];
  height?: number;
  compact?: boolean;
  valueFormat?: (v: number | null | undefined) => string;
  ariaLabel?: string;
}

export function PlatformTrendLine({
  data,
  color = PLUM,
  yDomain = [0, 1],
  height,
  compact = false,
  valueFormat = formatPercent,
  ariaLabel,
}: PlatformTrendLineProps) {
  const rows = buildRows(data);
  const hasAny = rows.some((r) => r.value !== null);
  const chartHeight = height ?? (compact ? 180 : CHART_HEIGHTS.line);

  if (!hasAny) {
    return (
      <div
        className="py-12 text-center text-slate text-sm"
        style={{ fontFamily: CHART_FONTS.mono }}
      >
        No data to display for this selection.
      </div>
    );
  }

  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart
          data={rows}
          margin={{ top: 12, right: 16, bottom: compact ? 8 : 24, left: 4 }}
        >
          <CartesianGrid stroke="#E7E1EC" strokeDasharray="3 3" />
          <XAxis
            dataKey="waveLabel"
            stroke="#605A6B"
            fontFamily={CHART_FONTS.mono}
            fontSize={11}
            interval={0}
            height={compact ? 36 : 48}
            tickMargin={6}
            tick={<TwoLineXTick />}
          />
          <YAxis
            domain={yDomain}
            tickFormatter={(v) => `${Math.round((v as number) * 100)}%`}
            stroke="#605A6B"
            fontFamily={CHART_FONTS.mono}
            fontSize={compact ? 10 : 12}
            width={compact ? 34 : 44}
            tickMargin={4}
          />
          <Tooltip
            content={(props) => (
              <TrendTooltip {...props} valueFormat={valueFormat} />
            )}
          />
          <Area
            type="monotone"
            dataKey="ciBand"
            stroke="none"
            fill={color}
            fillOpacity={0.15}
            connectNulls={false}
            isAnimationActive={false}
            activeDot={false}
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: compact ? 2 : 3 }}
            activeDot={{ r: compact ? 4 : 5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
