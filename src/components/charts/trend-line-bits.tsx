'use client';

// Shared presentational bits for the /trends explorer's line charts.
// These intentionally duplicate Finding 01's inline equivalents so the
// legacy F01 component stays untouched (same house pattern as
// CompareRankedBar vs FindingPlatformRankedBar).

import { useState } from 'react';
import {
  ReferenceLine,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from 'recharts';
import { CHART_FONTS } from '@/lib/strata-charts';
import { formatCI, formatN } from '@/lib/strata-formatters';
import {
  eventContextSentence,
  groupEventsToRefLines,
  selectableEvents,
  type EventRefLine,
  type PlatformFanDatum,
  type TrendEvent,
  type TrendPoint,
} from '@/lib/trends-adapters';
import type { ContextualEventsJson, MetaJson } from '@/lib/strata-types';

// ── X-axis two-line wave tick ─────────────────────────────────────────

interface AxisTickProps {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
}

export function makeTwoLineXTick(
  splitLines: (label: string) => [string, string],
) {
  return function TwoLineXTick(props: AxisTickProps) {
    const value = props.payload?.value;
    if (typeof value !== 'string') return null;
    const [line1, line2] = splitLines(value);
    return (
      <g transform={`translate(${props.x ?? 0},${props.y ?? 0})`}>
        <text
          x={0}
          y={0}
          dy={14}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize={12}
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
          fontSize={12}
          fill="#605A6B"
        >
          {line2}
        </text>
      </g>
    );
  };
}

// ── Broken-axis (Y) indicator ─────────────────────────────────────────
// Zig-zag anchored to the Y-axis baseline when the axis is zoomed.

export function BrokenYAxisIndicator({ visible }: { visible: boolean }) {
  const plotArea = usePlotArea();
  if (!visible || !plotArea) return null;
  const xBaseline = plotArea.x;
  const yBaseline = plotArea.y + plotArea.height;
  return (
    <g
      aria-label="Y axis is zoomed (broken axis indicator)"
      transform={`translate(${xBaseline - 5}, ${yBaseline - 22})`}
    >
      <path
        d="M 0 0 L 10 4 L 0 10 L 10 14 L 0 20"
        stroke="#605A6B"
        strokeWidth="1.5"
        fill="none"
      />
    </g>
  );
}

// ── Y-axis endpoint anchor labels ─────────────────────────────────────
// Small slate labels placed directly on the axis at the min/max ticks
// (e.g. "very favorable" at 10, "very unfavorable" at 0). Rendered just
// inside the plot's left edge. Only meaningful at full scale, so callers
// pass visible={!isZoomed} — when zoomed the full-scale anchors no longer
// describe the visible range.

interface AxisAnchor {
  value: number;
  label: string;
}

export function AxisAnchorLabels({
  anchors,
  visible = true,
}: {
  anchors: AxisAnchor[];
  visible?: boolean;
}) {
  const plot = usePlotArea();
  const yScale = useYAxisScale();
  if (!visible || !plot || !yScale || anchors.length === 0) return null;
  const values = anchors.map((a) => a.value);
  const maxV = Math.max(...values);
  const minV = Math.min(...values);
  return (
    <g aria-hidden>
      {anchors.map((a, i) => {
        const y = yScale(a.value);
        if (typeof y !== 'number') return null;
        // Nudge the top label down off the edge and the bottom label up,
        // so each sits just inside the plot beside its tick.
        const dy = a.value === maxV ? 10 : a.value === minV ? -4 : 3;
        return (
          <text
            key={`anchor-${i}`}
            x={plot.x + 6}
            y={y + dy}
            fontSize={9}
            fontFamily="var(--font-mono)"
            fill="#605A6B"
            style={{ pointerEvents: 'none' }}
          >
            {a.label}
          </text>
        );
      })}
    </g>
  );
}

// ── Per-line end labels (platform fan-out) ────────────────────────────

interface LineEndLabelsProps {
  slugs: string[];
  chartData: PlatformFanDatum[];
  swatchBySlug: ReadonlyMap<string, string>;
  labelBySlug: ReadonlyMap<string, string>;
}

export function LineEndLabels({
  slugs,
  chartData,
  swatchBySlug,
  labelBySlug,
}: LineEndLabelsProps) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale || chartData.length === 0) return null;

  const COLLISION_PX = 14;
  type LabelEntry = {
    slug: string;
    label: string;
    color: string;
    x: number;
    y: number;
  };
  const labels: LabelEntry[] = [];
  for (const slug of slugs) {
    let lastDatum: PlatformFanDatum | null = null;
    for (let i = chartData.length - 1; i >= 0; i--) {
      if (typeof chartData[i][slug] === 'number') {
        lastDatum = chartData[i];
        break;
      }
    }
    if (!lastDatum) continue;
    const value = lastDatum[slug];
    if (typeof value !== 'number') continue;
    const xPx = xScale(lastDatum.waveLabel);
    const yPx = yScale(value);
    if (typeof xPx !== 'number' || typeof yPx !== 'number') continue;
    labels.push({
      slug,
      label: labelBySlug.get(slug) ?? slug,
      color: swatchBySlug.get(slug) ?? '#605A6B',
      x: xPx,
      y: yPx,
    });
  }

  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < COLLISION_PX) {
      labels[i].y = labels[i - 1].y + COLLISION_PX;
    }
  }

  return (
    <g aria-label="Line endpoint labels">
      {labels.map((l, i) => (
        <text
          key={`tick-label-${i}`}
          x={l.x + 6}
          y={l.y + 4}
          fontSize={11}
          fontFamily="var(--font-mono)"
          fill={l.color}
          style={{ pointerEvents: 'none' }}
        >
          {l.label}
        </text>
      ))}
    </g>
  );
}

// ── Tooltips ──────────────────────────────────────────────────────────

interface FanTooltipProps {
  active?: boolean;
  payload?: readonly {
    dataKey?: string | number | ((d: unknown) => unknown);
    value?: unknown;
    color?: string;
    payload?: unknown;
  }[];
  label?: unknown;
  labelBySlug: ReadonlyMap<string, string>;
  formatValue: (v: number | null | undefined) => string;
}

export function PlatformFanTooltip({
  active,
  payload,
  label,
  labelBySlug,
  formatValue,
}: FanTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as PlatformFanDatum | undefined;
  if (!datum) return null;
  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1.5 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">
        {String(label ?? '')} · {datum.waveDates}
      </div>
      <ul className="space-y-1">
        {payload.map((p) => {
          if (typeof p.dataKey !== 'string') return null;
          const slug = p.dataKey;
          const value = typeof p.value === 'number' ? p.value : null;
          if (value === null) return null;
          const ciLo = datum[`${slug}_ci_lo`];
          const ciHi = datum[`${slug}_ci_hi`];
          const n = datum[`${slug}_n`];
          return (
            <li key={slug} className="flex items-baseline gap-2">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-sm shrink-0"
                style={{ backgroundColor: p.color }}
              />
              <span className="text-ink/85 flex-1">
                {labelBySlug.get(slug) ?? slug}
              </span>
              <span className="text-ink font-medium">{formatValue(value)}</span>
              {typeof ciLo === 'number' && typeof ciHi === 'number' ? (
                <span className="text-slate">{formatCI(ciLo, ciHi)}</span>
              ) : null}
              {typeof n === 'number' ? (
                <span className="text-slate">n={formatN(n)}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface SingleTooltipProps {
  active?: boolean;
  payload?: readonly { value?: unknown; payload?: unknown }[];
  seriesLabel: string;
  color: string;
  formatValue: (v: number | null | undefined) => string;
}

export function SingleSeriesTooltip({
  active,
  payload,
  seriesLabel,
  color,
  formatValue,
}: SingleTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as TrendPoint | undefined;
  if (!datum || datum.value === null) return null;
  return (
    <div
      className="bg-white border border-mist rounded-md shadow-sm p-3 text-xs space-y-1.5 max-w-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <div className="text-ink font-medium">
        Wave {datum.wave} · {datum.waveDates}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-sm shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-ink/85 flex-1">{seriesLabel}</span>
        <span className="text-ink font-medium">{formatValue(datum.value)}</span>
        {typeof datum.ciLo === 'number' && typeof datum.ciHi === 'number' ? (
          <span className="text-slate">
            {formatCI(datum.ciLo, datum.ciHi, formatValue)}
          </span>
        ) : null}
        {typeof datum.n === 'number' ? (
          <span className="text-slate">n={formatN(datum.n)}</span>
        ) : null}
      </div>
    </div>
  );
}

// ── Context-events state hook + renderers ─────────────────────────────
// Centralizes the per-event visibility state, snapped reference lines,
// and source-note context sentence so every trend renderer (the generic
// ones plus the legacy F01 usage chart) wires events identically.

export interface TrendEventsState {
  available: TrendEvent[];
  visible: TrendEvent[];
  refLines: EventRefLine[];
  hidden: ReadonlySet<string>;
  toggle: (id: string) => void;
  appendContext: (base: string) => string;
}

export function useTrendEvents(
  events: ContextualEventsJson | null,
  meta: MetaJson | null,
  presentWaves: number[],
): TrendEventsState {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const available =
    events && meta ? selectableEvents(events, meta, presentWaves) : [];
  const visible = available.filter((e) => !hidden.has(e.id));
  const refLines = groupEventsToRefLines(visible);
  const toggle = (id: string) =>
    setHidden((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const appendContext = (base: string) =>
    refLines.length > 0 ? `${base} ${eventContextSentence(refLines)}` : base;
  return { available, visible, refLines, hidden, toggle, appendContext };
}

// Bare vertical dashed reference lines (one per wave with visible events).
// Labels are drawn separately by EventLabels so they can be staggered and
// right-aligned. Returned as an array of <ReferenceLine> so Recharts
// detects them as chart children.
export function renderEventLines(refLines: EventRefLine[]) {
  return refLines.map((rl) => (
    <ReferenceLine
      key={rl.waveLabel}
      x={rl.waveLabel}
      stroke="#605A6B"
      strokeDasharray="4 2"
    />
  ));
}

// Per-event labels drawn to the RIGHT of each wave's reference line.
// Within a wave the events cascade downward in centerDist order so they
// never stack. Anchoring is uniform-right for every wave so adjacent
// waves' labels grow the SAME direction and never collide head-on (each
// fits in the gap to the next wave; the last wave grows into the chart's
// right margin). baseOffset clears the top Y-axis anchor where shown.
export function EventLabels({
  events,
  baseOffset,
}: {
  events: TrendEvent[];
  baseOffset: number;
}) {
  const xScale = useXAxisScale();
  const plot = usePlotArea();
  if (!xScale || !plot || events.length === 0) return null;

  const byWave = new Map<string, TrendEvent[]>();
  for (const ev of events) {
    const list = byWave.get(ev.waveLabel);
    if (list) list.push(ev);
    else byWave.set(ev.waveLabel, [ev]);
  }

  const STEP = 16;
  const out: React.ReactNode[] = [];
  for (const [waveLabel, group] of byWave) {
    const x = xScale(waveLabel);
    if (typeof x !== 'number') continue;
    const sorted = [...group].sort((a, b) => a.centerDist - b.centerDist);
    sorted.forEach((ev, i) => {
      out.push(
        <text
          key={ev.id}
          x={x + 6}
          y={plot.y + baseOffset + i * STEP}
          fontSize={10}
          fontFamily="var(--font-mono)"
          fill="#605A6B"
          textAnchor="start"
          style={{ pointerEvents: 'none' }}
        >
          {ev.shortLabel}
        </text>,
      );
    });
  }
  return <g aria-hidden>{out}</g>;
}

// ── Context-events control (per-event checkbox list) ──────────────────
// Scrollable list of individual macro events (one checkbox each), styled
// to match the platform multiselect. All checked by default; unchecking
// hides that event's reference line.

interface EventOption {
  id: string;
  shortLabel: string;
}

export function EventsControl({
  events,
  hidden,
  onToggle,
}: {
  events: EventOption[];
  hidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p
        className="text-xs text-slate uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Context events
      </p>
      <ul
        className="max-h-48 overflow-y-auto border border-mist rounded-md bg-paper px-2 py-1 space-y-0.5"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {events.map((ev) => {
          const checked = !hidden.has(ev.id);
          return (
            <li key={ev.id}>
              <label className="flex items-center gap-2 text-xs rounded px-1 py-0.5 cursor-pointer hover:bg-mist/50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(ev.id)}
                  className="accent-plum"
                />
                <span className={checked ? 'text-ink' : 'text-slate'}>
                  {ev.shortLabel}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Y-axis zoom controls ──────────────────────────────────────────────
// Mirrors Finding 01's Full / Fit / Custom control. In percent mode the
// custom inputs are percentage points (0–100); in raw mode they are in
// the variable's native units (e.g. 1–7 for a Likert mean).

interface YZoomControlsProps {
  mode: 'full' | 'fit' | 'custom';
  onMode: (m: 'full' | 'fit' | 'custom') => void;
  customMin: number;
  customMax: number;
  onCustomMin: (n: number) => void;
  onCustomMax: (n: number) => void;
  isPercent: boolean;
  fullLabel: string;
  rawMin?: number;
  rawMax?: number;
  rawStep?: number;
}

export function YZoomControls({
  mode,
  onMode,
  customMin,
  customMax,
  onCustomMin,
  onCustomMax,
  isPercent,
  fullLabel,
  rawMin = 0,
  rawMax = 100,
  rawStep = 0.1,
}: YZoomControlsProps) {
  return (
    <div className="space-y-2">
      <p
        className="text-xs text-slate uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Y axis
      </p>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="sr-only">Y axis zoom mode</legend>
        {(['full', 'fit', 'custom'] as const).map((m) => (
          <label key={m} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="trends-y-mode"
              value={m}
              checked={mode === m}
              onChange={() => onMode(m)}
              className="accent-plum"
            />
            <span
              className={mode === m ? 'text-ink' : 'text-slate'}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {m === 'full' ? fullLabel : m === 'fit' ? 'Fit to data' : 'Custom'}
            </span>
          </label>
        ))}
      </fieldset>
      {mode === 'custom' ? (
        <div
          className="grid grid-cols-2 gap-2 pt-1"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <label className="flex flex-col gap-1 text-xs text-slate">
            {isPercent ? 'Min %' : 'Min'}
            <input
              type="number"
              min={isPercent ? 0 : rawMin}
              max={isPercent ? 99 : rawMax}
              step={isPercent ? 1 : rawStep}
              value={customMin}
              onChange={(e) => onCustomMin(Number(e.target.value))}
              className="rounded border border-mist px-2 py-1 text-ink bg-paper"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate">
            {isPercent ? 'Max %' : 'Max'}
            <input
              type="number"
              min={isPercent ? 1 : rawMin}
              max={isPercent ? 100 : rawMax}
              step={isPercent ? 1 : rawStep}
              value={customMax}
              onChange={(e) => onCustomMax(Number(e.target.value))}
              className="rounded border border-mist px-2 py-1 text-ink bg-paper"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
