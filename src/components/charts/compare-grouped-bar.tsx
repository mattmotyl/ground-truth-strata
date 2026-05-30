'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  usePlotArea,
  XAxis,
  YAxis,
} from 'recharts';
import type { GroupedDatum, GroupedSeries } from '@/lib/compare-adapters';
import { CHART_FONTS } from '@/lib/strata-charts';
import { formatCI, formatN, formatPercent } from '@/lib/strata-formatters';

// =====================================================================
// Dumb, presentational CLUSTERED horizontal bar for the /compare Theme A
// demographic group-split (T3-B6). Each platform is one cluster: an
// Overall baseline bar first (neutral ink, distinct from the group
// palette) followed by one bar per demographic group level. It consumes
// the pre-normalized GroupedSeries from platformGroupComparisonsToGrouped
// and knows nothing about which outcome / demographic produced it.
//
// CompareRankedBar is intentionally left untouched; the small SVG helper
// (broken-axis glyph) is duplicated here rather than shared, matching the
// /compare convention until a later chart-primitives extraction.
// =====================================================================

// Overall baseline bar color — a muted warm grey so the baseline reads as
// a low-prominence reference, never competing with the demographic group
// bars. Deliberately outside the qualitative/political group palettes.
const OVERALL_COLOR = '#C8C3BC';

interface BarMeta {
  key: string; // synthetic data key (overall | g0 | g1 …)
  label: string; // legend / tooltip label
  color: string;
}

type ChartRow = Record<string, number | [number, number] | string>;

// Horizontal axis-break zig-zag — signals the % axis is zoomed past 0.
function BrokenXAxisIndicator({ visible }: { visible: boolean }) {
  const plotArea = usePlotArea();
  if (!visible || !plotArea) return null;
  return (
    <g
      aria-label="X axis is zoomed (broken axis indicator)"
      transform={`translate(${plotArea.x + 2}, ${plotArea.y + plotArea.height})`}
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

interface GroupedTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: ChartRow }[];
  bars: readonly BarMeta[];
  lookup: ReadonlyMap<string, GroupedDatum>;
  valueFormat: (v: number | null | undefined) => string;
}

function GroupedTooltip({
  active,
  payload,
  bars,
  lookup,
  valueFormat,
}: GroupedTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  const label = row?.label;
  if (typeof label !== 'string') return null;
  const datum = lookup.get(label);
  if (!datum) return null;

  // Build display lines from the source datum (carries CI + n that the
  // chart rows omit). Suppressed / missing values render as "—".
  const lines = bars.map((b) => {
    if (b.key === 'overall') {
      const o = datum.overall;
      return {
        key: b.key,
        label: 'Overall',
        color: b.color,
        text:
          o && !o.suppressed && o.value != null
            ? `${valueFormat(o.value)} ${formatCI(o.ciLow, o.ciHigh)} · n=${formatN(o.n)}`
            : '—',
      };
    }
    const idx = Number(b.key.slice(1));
    const g = datum.groups[idx];
    return {
      key: b.key,
      label: g?.label ?? b.label,
      color: b.color,
      text:
        g && !g.suppressed && g.value != null
          ? `${valueFormat(g.value)} ${formatCI(g.ciLow, g.ciHigh)} · n=${formatN(g.n)}`
          : g?.suppressed
            ? '— (n < 30)'
            : '—',
    };
  });

  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">{datum.label}</div>
      {lines.map((ln) => (
        <div key={ln.key} className="flex items-baseline gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-sm shrink-0"
            style={{ backgroundColor: ln.color }}
          />
          <span className="text-ink/85">{ln.label}:</span>
          <span className="text-slate">{ln.text}</span>
        </div>
      ))}
    </div>
  );
}

interface CompareGroupedBarProps {
  series: GroupedSeries;
  // X-axis domain as proportions, e.g. [0, 1] for full range.
  xDomain: [number, number];
  isZoomed: boolean;
  // Caption rendered under the chart (e.g. "% of platform users reporting this").
  axisLabel: string;
  valueFormat?: (v: number | null | undefined) => string;
  yAxisWidth?: number;
}

export function CompareGroupedBar({
  series,
  xDomain,
  isZoomed,
  axisLabel,
  valueFormat = formatPercent,
  yAxisWidth = 120,
}: CompareGroupedBarProps) {
  // All platforms share the same group order/colors (the adapter maps
  // every groupDef per platform), so the first datum is representative.
  const groupDefs = series[0]?.groups ?? [];
  const bars: BarMeta[] = [
    { key: 'overall', label: 'Overall', color: OVERALL_COLOR },
    ...groupDefs.map((g, i) => ({ key: `g${i}`, label: g.label, color: g.color })),
  ];

  const lookup = new Map<string, GroupedDatum>(series.map((d) => [d.label, d]));

  const errOf = (
    value: number,
    lo: number | null,
    hi: number | null,
  ): [number, number] => [
    Math.max(0, value - (lo ?? value)),
    Math.max(0, (hi ?? value) - value),
  ];

  const data: ChartRow[] = [];
  for (const d of series) {
    const row: ChartRow = { label: d.label, platform_slug: d.platform_slug };
    let any = false;
    if (d.overall && !d.overall.suppressed && d.overall.value != null) {
      row.overall = d.overall.value;
      row.overall_err = errOf(d.overall.value, d.overall.ciLow, d.overall.ciHigh);
      any = true;
    }
    d.groups.forEach((g, i) => {
      if (!g.suppressed && g.value != null) {
        row[`g${i}`] = g.value;
        row[`g${i}_err`] = errOf(g.value, g.ciLow, g.ciHigh);
        any = true;
      }
    });
    if (any) data.push(row);
  }

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

  const barThickness = 12;
  const clusterPad = 16;
  const height = Math.max(
    300,
    data.length * (bars.length * barThickness + clusterPad) + 64,
  );

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          barGap={1}
          barCategoryGap="20%"
          margin={{ top: 8, right: 60, bottom: 16, left: 8 }}
        >
          <CartesianGrid stroke="#E7E1EC" strokeDasharray="3 3" horizontal={false} />
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
          />
          <Tooltip
            cursor={{ fill: '#E7E1EC', opacity: 0.4 }}
            content={(props) => (
              <GroupedTooltip
                {...props}
                bars={bars}
                lookup={lookup}
                valueFormat={valueFormat}
              />
            )}
          />
          {bars.map((b) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              fill={b.color}
              barSize={barThickness}
              radius={[0, 2, 2, 0]}
              isAnimationActive={false}
            >
              <ErrorBar
                dataKey={`${b.key}_err`}
                direction="x"
                width={3}
                stroke="#605A6B"
                strokeWidth={1}
              />
            </Bar>
          ))}
          <BrokenXAxisIndicator visible={isZoomed} />
        </BarChart>
      </ResponsiveContainer>

      {/* Legend — bars within a cluster are distinguished only by color. */}
      <div
        className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate"
        style={{ fontFamily: CHART_FONTS.mono }}
      >
        {bars.map((b) => (
          <span key={b.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: b.color }}
            />
            <span>{b.label}</span>
          </span>
        ))}
      </div>

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
