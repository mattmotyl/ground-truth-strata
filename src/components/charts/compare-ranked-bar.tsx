'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  usePlotArea,
  useXAxisScale,
  XAxis,
  YAxis,
} from 'recharts';
import {
  comparisonColorScaleMax,
  magnitudeColor,
  type ComparisonSeries,
} from '@/lib/compare-adapters';
import { CHART_FONTS } from '@/lib/strata-charts';
import { formatCI, formatN, formatPercent } from '@/lib/strata-formatters';

// =====================================================================
// Dumb, presentational ranked horizontal bar for /compare (T3-B-Compare
// Part 1). It takes a pre-normalized ComparisonSeries and knows nothing
// about which theme / file produced it — all per-theme filtering lives
// in the adapters (src/lib/compare-adapters.ts) and the orchestrator
// (compare-explorer.tsx).
//
// The small SVG helpers below (broken-axis glyph, beyond-whisker value
// labels, magnitude color binning, tooltip) are INTENTIONALLY duplicated
// from finding-platform-ranked-bar.tsx rather than shared, so that the
// legacy ranked-bar component stays byte-for-byte untouched while the
// /compare redesign lands. Once the legacy scaffold is deleted in a
// later cleanup, these can be extracted to a shared chart-primitives
// module.
// =====================================================================

// Theme A colors bars by magnitude on a warm/cool scale; Theme B uses a
// single solid color keyed to the selected response type (plum = agree,
// amber = disagree). The discriminated union lets the caller pick.
export type RankedBarColoring =
  | { mode: 'magnitude'; scale: readonly string[] }
  | { mode: 'solid'; color: string };

interface ChartDatum {
  platform_slug: string;
  label: string;
  value: number;
  ciLow: number;
  ciHigh: number;
  ciErr: [number, number];
  n: number | null;
}

// Horizontal axis-break zig-zag on the X-axis line, signalling the
// percentage axis has been zoomed past 0.
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

// One percent label per bar at the RIGHT EDGE of the CI whisker, so the
// label is never crossed by the error bar.
function BarCiLabels({
  data,
  valueFormat,
}: {
  data: readonly ChartDatum[];
  valueFormat: (v: number | null | undefined) => string;
}) {
  const xScale = useXAxisScale();
  const plotArea = usePlotArea();
  if (!xScale || !plotArea || data.length === 0) return null;
  const bandStep = plotArea.height / data.length;
  const plotRight = plotArea.x + plotArea.width;
  return (
    <g aria-label="Bar value labels (positioned beyond CI tips)">
      {data.map((d, i) => {
        const labelX = xScale(d.ciHigh);
        if (typeof labelX !== 'number') return null;
        if (labelX > plotRight) return null;
        const cy = plotArea.y + (i + 0.5) * bandStep;
        return (
          <text
            key={d.platform_slug}
            x={labelX + 6}
            y={cy}
            dominantBaseline="middle"
            textAnchor="start"
            fontFamily="var(--font-mono)"
            fontSize={11}
            fill="#18161F"
          >
            {valueFormat(d.value)}
          </text>
        );
      })}
    </g>
  );
}

// Word-wrap a category label into at most two lines so long labels (e.g.
// the §5 habit-scale phrasings) stay legible. Short labels (platform
// names on /compare) fit on one line and are returned unchanged.
function wrapLabel(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChars) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + ' ' + w : w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) return [lines[0], lines.slice(1).join(' ')];
  return lines;
}

interface RankedYTickProps {
  maxChars: number;
  x?: number;
  y?: number;
  payload?: { value?: string | number };
}

// Custom YAxis tick: vertically-centered, up to two wrapped lines.
function RankedYTick({ maxChars, x = 0, y = 0, payload }: RankedYTickProps) {
  const value = payload?.value;
  if (typeof value !== 'string') return null;
  const lines = wrapLabel(value, maxChars);
  const lineH = 12;
  const startDy = -((lines.length - 1) * lineH) / 2;
  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((ln, i) => (
        <text
          key={i}
          x={-3}
          y={0}
          dy={startDy + i * lineH + 4}
          textAnchor="end"
          fontFamily="var(--font-mono)"
          fontSize={12}
          fill="#18161F"
        >
          {ln}
        </text>
      ))}
    </g>
  );
}

interface BarTooltipProps {
  active?: boolean;
  payload?: readonly {
    payload?: unknown;
  }[];
  valueFormat: (v: number | null | undefined) => string;
}

function BarTooltip({ active, payload, valueFormat }: BarTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as ChartDatum | undefined;
  if (!datum) return null;
  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">{datum.label}</div>
      <div className="text-ink">
        {valueFormat(datum.value)}{' '}
        <span className="text-slate">
          {formatCI(datum.ciLow, datum.ciHigh)}
        </span>
      </div>
      <div className="text-slate">n = {formatN(datum.n)} users</div>
    </div>
  );
}

interface CompareRankedBarProps {
  series: ComparisonSeries;
  coloring: RankedBarColoring;
  // X-axis domain as proportions, e.g. [0, 1] for full range.
  xDomain: [number, number];
  isZoomed: boolean;
  // Caption rendered under the chart (e.g. "% who agree").
  axisLabel: string;
  valueFormat?: (v: number | null | undefined) => string;
  // Width reserved for the category-label (Y) axis. Defaults to 120 for
  // short platform labels; pass a larger value for long category labels
  // (e.g. §5 habit-scale items), which also wrap onto two lines.
  yAxisWidth?: number;
}

export function CompareRankedBar({
  series,
  coloring,
  xDomain,
  isZoomed,
  axisLabel,
  valueFormat = formatPercent,
  yAxisWidth = 120,
}: CompareRankedBarProps) {
  const data: ChartDatum[] = series
    .filter((d) => !d.suppressed && d.value !== null)
    .map((d) => {
      const value = d.value ?? 0;
      const lo = d.ciLow ?? value;
      const hi = d.ciHigh ?? value;
      return {
        platform_slug: d.platform_slug,
        label: d.label,
        value,
        ciLow: lo,
        ciHigh: hi,
        ciErr: [Math.max(0, value - lo), Math.max(0, hi - value)],
        n: d.n,
      };
    });

  if (data.length === 0) {
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

  // Magnitude scale stays bound to the visible data so colors stretch
  // across the displayed bars regardless of axis zoom. Computed from the
  // full series (not just `data`) via the shared helper so the
  // Numbers-block swatches in CompareExplorer match these fills exactly.
  const colorScaleMax = comparisonColorScaleMax(series);
  const barHeight = 26;
  const height = Math.max(260, data.length * barHeight + 64);

  const fillFor = (d: ChartDatum): string =>
    coloring.mode === 'solid'
      ? coloring.color
      : magnitudeColor(d.value, colorScaleMax, coloring.scale);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 60, bottom: 16, left: 8 }}
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
            tickFormatter={(v) => `${Math.round((v as number) * 100)}%`}
            stroke="#605A6B"
            fontFamily={CHART_FONTS.mono}
            fontSize={12}
          />
          <YAxis
            dataKey="label"
            type="category"
            width={yAxisWidth}
            stroke="#605A6B"
            fontFamily={CHART_FONTS.mono}
            fontSize={12}
            tick={<RankedYTick maxChars={Math.max(8, Math.floor(yAxisWidth / 8))} />}
          />
          <Tooltip
            cursor={{ fill: '#E7E1EC', opacity: 0.4 }}
            content={(props) => (
              <BarTooltip {...props} valueFormat={valueFormat} />
            )}
          />
          <Bar dataKey="value" radius={[0, 2, 2, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.platform_slug} fill={fillFor(d)} />
            ))}
            <ErrorBar
              dataKey="ciErr"
              direction="x"
              width={4}
              stroke="#605A6B"
              strokeWidth={1}
            />
          </Bar>
          <BarCiLabels data={data} valueFormat={valueFormat} />
          <BrokenXAxisIndicator visible={isZoomed} />
        </BarChart>
      </ResponsiveContainer>
      {axisLabel ? (
        <p
          className="text-center text-xs text-slate mt-1"
          style={{ fontFamily: CHART_FONTS.mono }}
        >
          {axisLabel}
        </p>
      ) : null}
    </div>
  );
}
