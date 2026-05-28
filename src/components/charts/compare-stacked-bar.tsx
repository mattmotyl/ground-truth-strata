'use client';

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
import type { StackedSeries, StackedSegmentValue } from '@/lib/compare-adapters';
import { CHART_FONTS } from '@/lib/strata-charts';
import { formatCI, formatN, formatPercent } from '@/lib/strata-formatters';

// =====================================================================
// Stacked horizontal bar for /compare Theme D (demographic composition).
// One bar per platform; segments are demographic group levels. Single-
// value charts use CompareRankedBar — this is the multi-segment sibling.
// Suppressed group levels carry a null value and are simply omitted, so
// a platform's bar may total < 100% (per-group suppression). The source
// note explains this; the deficit is not drawn as a fabricated segment.
// =====================================================================

export interface StackSegmentDef {
  value: string; // exact group_value key in the series
  label: string;
  color: string;
}

interface CompareStackedBarProps {
  series: StackedSeries;
  segments: StackSegmentDef[]; // stack order, resolved colors
}

interface ChartRow {
  label: string;
  platform_slug: string;
  segments: Record<string, StackedSegmentValue>;
  [segValue: string]: number | null | string | Record<string, StackedSegmentValue>;
}

// Black or white label text depending on segment-fill luminance, so
// in-segment percentages stay legible on both dark and light fills.
function readableTextColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#18161F' : '#FFFFFF';
}

interface StackedTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  segments: StackSegmentDef[];
}

function StackedTooltip({ active, payload, segments }: StackedTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as ChartRow | undefined;
  if (!row) return null;
  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">{row.label}</div>
      <ul className="space-y-0.5">
        {segments.map((seg) => {
          const sv = row.segments[seg.value];
          return (
            <li key={seg.value} className="flex items-baseline gap-2">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-sm shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-slate w-28 shrink-0">{seg.label}</span>
              {!sv || sv.suppressed || sv.value === null ? (
                <span className="text-slate">suppressed (n &lt; 30)</span>
              ) : (
                <span className="text-ink">
                  {formatPercent(sv.value)}{' '}
                  <span className="text-slate">
                    {formatCI(sv.ciLow, sv.ciHigh)} · n={formatN(sv.n)}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CompareStackedBar({ series, segments }: CompareStackedBarProps) {
  const chartData: ChartRow[] = series.map((d) => {
    const row: ChartRow = {
      label: d.label,
      platform_slug: d.platform_slug,
      segments: d.segments,
    };
    for (const seg of segments) {
      const sv = d.segments[seg.value];
      row[seg.value] = sv && !sv.suppressed ? sv.value : null;
    }
    return row;
  });

  if (chartData.length === 0) {
    return (
      <div
        className="py-16 text-center text-slate text-sm"
        style={{ fontFamily: CHART_FONTS.mono }}
      >
        No platforms with displayable data for this selection. Try
        selecting more platforms or a different wave.
      </div>
    );
  }

  const barHeight = 30;
  const height = Math.max(280, chartData.length * barHeight + 72);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 24, bottom: 16, left: 8 }}
          barCategoryGap="20%"
        >
          <CartesianGrid
            stroke="#E7E1EC"
            strokeDasharray="3 3"
            horizontal={false}
          />
          <XAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={(v) => `${Math.round((v as number) * 100)}%`}
            stroke="#605A6B"
            fontFamily={CHART_FONTS.mono}
            fontSize={12}
          />
          <YAxis
            dataKey="label"
            type="category"
            width={120}
            stroke="#605A6B"
            fontFamily={CHART_FONTS.mono}
            fontSize={12}
            tick={{ fill: '#18161F' }}
          />
          <Tooltip
            cursor={{ fill: '#E7E1EC', opacity: 0.4 }}
            content={(props) => (
              <StackedTooltip {...props} segments={segments} />
            )}
          />
          {segments.map((seg) => (
            <Bar
              key={seg.value}
              dataKey={seg.value}
              stackId="composition"
              fill={seg.color}
              isAnimationActive={false}
            >
              <LabelList
                dataKey={seg.value}
                position="center"
                fill={readableTextColor(seg.color)}
                fontSize={10}
                fontFamily="var(--font-mono)"
                formatter={(value: unknown) => {
                  const v = typeof value === 'number' ? value : Number(value);
                  return Number.isFinite(v) && v >= 0.05
                    ? `${Math.round(v * 100)}%`
                    : '';
                }}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      {/* Segment legend */}
      <div
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2 text-xs"
        style={{ fontFamily: CHART_FONTS.mono }}
      >
        {segments.map((seg) => (
          <span key={seg.value} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-ink">{seg.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
