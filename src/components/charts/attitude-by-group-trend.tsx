'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { loadGroupComparisons } from '@/lib/strata-data';
import type { GroupComparisonRow, MetaJson } from '@/lib/strata-types';
import {
  CHART_FONTS,
  CHART_HEIGHTS,
  STRATA_PALETTES,
} from '@/lib/strata-charts';
import {
  formatNumber,
  splitWaveLabelLines,
  waveDateRangeLabel,
} from '@/lib/strata-formatters';
import { axisTicks, type PlatformFanDatum } from '@/lib/trends-adapters';
import type {
  AxisAnchor,
  FurtherReadingLink,
  GroupingDef,
} from '@/lib/trends-categories';
import { StrataChartFrame } from './strata-chart-frame';
import { renderPlatformInterpretation } from './trends-variable-trend';
import { useUrlSync } from '@/lib/use-url-sync';
import {
  encodeTrendsByGroupState,
  type TrendsYMode,
} from '@/lib/trends-url-state';
import {
  AxisAnchorLabels,
  BrokenYAxisIndicator,
  PlatformFanTooltip,
  YZoomControls,
  makeTwoLineXTick,
} from './trend-line-bits';

const TwoLineXTick = makeTwoLineXTick(splitWaveLabelLines);

// =====================================================================
// AttitudeByGroupTrend — two side-by-side small-multiple line panels for a
// pair of 0–10 attitude items (feeling thermometers, comfort having
// friends), each split into one line per value of a user-selectable
// respondent group (ideology default; also gender / age / education /
// race). Sourced from group_comparisons.json mean rows. The population
// average hides the partisan split these breakouts surface.
//
// Both panels share a Y domain so warmth toward liberals vs. conservatives
// is directly comparable. A shared legend (rather than per-line end labels)
// keeps long demographic group names readable in the half-width panels.
// =====================================================================

interface AttitudeByGroupTrendProps {
  meta: MetaJson;
  vars: [string, string];
  panelTitles: [string, string];
  valueDomain: [number, number];
  groupings: GroupingDef[];
  title: string;
  axisAnchors?: AxisAnchor[];
  interpretation?: string;
  furtherReading?: FurtherReadingLink[];
  filenameBase: string;
  category: string;
  questionKey: string;
  initialGroupBy?: string;
  initialYMode?: TrendsYMode;
  initialCustomMin?: number;
  initialCustomMax?: number;
}

// Per-group line colors. Ideology uses the fixed political semantics
// (blue / purple / red); demographic groupings use the qualitative palette.
function colorsForGrouping(g: GroupingDef): Map<string, string> {
  const m = new Map<string, string>();
  if (g.key === 'ideology') {
    m.set('Liberal', STRATA_PALETTES.political.liberal);
    m.set('Moderate', STRATA_PALETTES.political.moderate);
    m.set('Conservative', STRATA_PALETTES.political.conservative);
    return m;
  }
  g.groups.forEach((grp, i) =>
    m.set(grp, STRATA_PALETTES.qualitative8[i % STRATA_PALETTES.qualitative8.length]),
  );
  return m;
}

// Reshape group_comparisons mean rows to the PlatformFanDatum shape (one
// series per group value), so the chart reuses PlatformFanTooltip etc.
function buildGroupFanData(
  rows: GroupComparisonRow[],
  meta: MetaJson,
  outcome: string,
  groupingVar: string,
  groups: string[],
): PlatformFanDatum[] {
  const waveDates = new Map(meta.waves.map((w) => [w.wave, w.dates]));
  const relevant = rows.filter(
    (r) =>
      r.outcome === outcome &&
      r.grouping_var === groupingVar &&
      (r.bucket ?? null) === null,
  );
  const waves = [...new Set(relevant.map((r) => r.wave))].sort((a, b) => a - b);
  return waves.map((wave) => {
    const dates = waveDates.get(wave) ?? '';
    const datum: PlatformFanDatum = {
      wave,
      waveLabel: waveDateRangeLabel(dates),
      waveDates: dates,
    };
    for (const g of groups) {
      const row = relevant.find((r) => r.wave === wave && r.group === g);
      if (!row || row.suppressed || row.weighted_value === null) {
        datum[g] = null;
        datum[`${g}_ci_lo`] = null;
        datum[`${g}_ci_hi`] = null;
        datum[`${g}_n`] = null;
        continue;
      }
      datum[g] = row.weighted_value;
      datum[`${g}_ci_lo`] = row.weighted_ci_lower;
      datum[`${g}_ci_hi`] = row.weighted_ci_upper;
      datum[`${g}_n`] = row.n;
    }
    return datum;
  });
}

function latestValue(fan: PlatformFanDatum[], group: string): number | null {
  for (let i = fan.length - 1; i >= 0; i--) {
    const v = fan[i][group];
    if (typeof v === 'number') return v;
  }
  return null;
}

export function AttitudeByGroupTrend({
  meta,
  vars,
  panelTitles,
  valueDomain,
  groupings,
  title,
  axisAnchors,
  interpretation,
  furtherReading,
  filenameBase,
  category,
  questionKey,
  initialGroupBy,
  initialYMode,
  initialCustomMin,
  initialCustomMax,
}: AttitudeByGroupTrendProps) {
  const [groupBy, setGroupBy] = useState<string>(
    () => initialGroupBy ?? groupings[0]?.key ?? 'ideology',
  );
  const [yMode, setYMode] = useState<TrendsYMode>(initialYMode ?? 'full');
  const [customMin, setCustomMin] = useState(initialCustomMin ?? valueDomain[0]);
  const [customMax, setCustomMax] = useState(initialCustomMax ?? valueDomain[1]);
  const [rows, setRows] = useState<GroupComparisonRow[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);

  useUrlSync(
    encodeTrendsByGroupState(
      category,
      questionKey,
      groupBy,
      yMode,
      customMin,
      customMax,
    ),
  );

  useEffect(() => {
    let active = true;
    loadGroupComparisons()
      .then((all) => active && setRows(all))
      .catch((e) => active && setError(e));
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load attitude data: {error.message}</p>
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

  const grouping =
    groupings.find((g) => g.key === groupBy) ?? groupings[0];
  const groups = grouping.groups;
  const colorMap = colorsForGrouping(grouping);
  const labelByGroup = new Map(groups.map((g) => [g, g]));

  const fanA = buildGroupFanData(rows, meta, vars[0], grouping.groupingVar, groups);
  const fanB = buildGroupFanData(rows, meta, vars[1], grouping.groupingVar, groups);
  const waves = fanA.map((d) => d.wave);

  // Shared Y domain so both panels are directly comparable.
  const fitValues: number[] = [];
  for (const fan of [fanA, fanB]) {
    for (const d of fan) {
      for (const g of groups) {
        const v = d[g];
        if (typeof v === 'number') fitValues.push(v);
      }
    }
  }
  const yDomain: [number, number] = (() => {
    if (yMode === 'full') return valueDomain;
    if (yMode === 'custom') {
      return customMax > customMin ? [customMin, customMax] : valueDomain;
    }
    if (!fitValues.length) return valueDomain;
    const lo = Math.min(...fitValues);
    const hi = Math.max(...fitValues);
    const pad = Math.max(0.2, (hi - lo) * 0.1);
    return [
      Math.max(valueDomain[0], lo - pad),
      Math.min(valueDomain[1], hi + pad),
    ];
  })();
  const isZoomed = yMode !== 'full';

  const renderPanel = (panelTitle: string, fan: PlatformFanDatum[]) => (
    <div className="space-y-1">
      <p
        className="text-sm text-ink font-medium text-center"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {panelTitle}
      </p>
      <div className="relative">
        <ResponsiveContainer width="100%" height={CHART_HEIGHTS.line - 60}>
          <LineChart data={fan} margin={{ top: 16, right: 18, bottom: 24, left: 0 }}>
            <CartesianGrid stroke="#E7E1EC" strokeDasharray="3 3" />
            <XAxis
              dataKey="waveLabel"
              stroke="#605A6B"
              fontFamily={CHART_FONTS.mono}
              fontSize={12}
              tickMargin={6}
              height={48}
              interval={0}
              tick={<TwoLineXTick />}
            />
            <YAxis
              domain={yDomain}
              ticks={axisTicks(yDomain)}
              allowDecimals={false}
              tickFormatter={(v) => formatNumber(v as number, 0)}
              stroke="#605A6B"
              fontFamily={CHART_FONTS.mono}
              fontSize={12}
              tickMargin={4}
              width={32}
            />
            <Tooltip
              content={(props) => (
                <PlatformFanTooltip
                  {...props}
                  labelBySlug={labelByGroup}
                  formatValue={(v) => formatNumber(v, 1)}
                />
              )}
            />
            {groups.map((g) => (
              <Line
                key={g}
                type="monotone"
                dataKey={g}
                stroke={colorMap.get(g) ?? '#605A6B'}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
            {axisAnchors ? (
              <AxisAnchorLabels anchors={axisAnchors} visible={!isZoomed} />
            ) : null}
            <BrokenYAxisIndicator visible={isZoomed} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const legend = (
    <div
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3 text-xs"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      {groups.map((g) => (
        <span key={g} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: colorMap.get(g) }}
          />
          <span className="text-ink">{g}</span>
        </span>
      ))}
    </div>
  );

  const chart = (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderPanel(panelTitles[0], fanA)}
        {renderPanel(panelTitles[1], fanB)}
      </div>
      {legend}
    </div>
  );

  const controls = (
    <div className="space-y-5">
      <div className="space-y-2">
        <p
          className="text-xs text-slate uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Group by
        </p>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="sr-only">Respondent grouping</legend>
          {groupings.map((g) => (
            <label key={g.key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="attitude-group-by"
                value={g.key}
                checked={groupBy === g.key}
                onChange={() => setGroupBy(g.key)}
                className="accent-plum"
              />
              <span
                className={groupBy === g.key ? 'text-ink' : 'text-slate'}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {g.label}
              </span>
            </label>
          ))}
        </fieldset>
      </div>
      <YZoomControls
        mode={yMode}
        onMode={setYMode}
        customMin={customMin}
        customMax={customMax}
        onCustomMin={setCustomMin}
        onCustomMax={setCustomMax}
        isPercent={false}
        fullLabel={`Full range (${valueDomain[0]}–${valueDomain[1]})`}
        rawMin={valueDomain[0]}
        rawMax={valueDomain[1]}
        rawStep={0.5}
      />
    </div>
  );

  const chartFooter = isZoomed ? (
    <div
      className="flex items-center justify-between gap-3 flex-wrap text-xs"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <span className="text-slate">Note: Y axis is zoomed. Full range not shown.</span>
      <button
        type="button"
        onClick={() => setYMode('full')}
        className="text-mulberry hover:text-plum underline-offset-2 hover:underline"
      >
        Reset to full range
      </button>
    </div>
  ) : null;

  const lo = valueDomain[0];
  const hi = valueDomain[1];
  const anchLo = axisAnchors?.find((a) => a.value === lo)?.label;
  const anchHi = axisAnchors?.find((a) => a.value === hi)?.label;
  const scaleClause =
    anchLo && anchHi
      ? `a ${lo} to ${hi} scale (${lo} = ${anchLo}, ${hi} = ${anchHi})`
      : `a ${lo} to ${hi} scale`;
  const subtitle = `Average rating on ${scaleClause}, with a separate line for each respondent group.`;

  const waveRange = waves.length
    ? `waves ${Math.min(...waves)}–${Math.max(...waves)}`
    : '—';
  const sourceNote =
    `Source: UAS panel ${waveRange}. Population-level weighted means, split ` +
    `by ${grouping.label.toLowerCase()}. 95% CIs available on hover. Cells ` +
    `with n < 30 are suppressed by design.`;

  const latestWave = waves.length ? Math.max(...waves) : null;
  const latestDates =
    latestWave != null
      ? (meta.waves.find((w) => w.wave === latestWave)?.dates ?? '')
      : '';

  const numbers = (
    <>
      <table
        className="text-xs w-full border-collapse"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <thead>
          <tr className="text-slate border-b border-mist">
            <th className="text-left font-normal py-2 pr-2">{grouping.label}</th>
            {panelTitles.map((t) => (
              <th key={t} className="text-right font-normal py-2 px-2">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const v0 = latestValue(fanA, g);
            const v1 = latestValue(fanB, g);
            return (
              <tr key={g} className="border-b border-mist/60">
                <th
                  scope="row"
                  className="text-left font-normal py-1.5 pr-2 text-ink"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ backgroundColor: colorMap.get(g) }}
                    />
                    {g}
                  </span>
                </th>
                <td className="text-right py-1.5 px-2 text-ink tabular-nums">
                  {v0 !== null ? formatNumber(v0, 1) : '—'}
                </td>
                <td className="text-right py-1.5 px-2 text-ink tabular-nums">
                  {v1 !== null ? formatNumber(v1, 1) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p
        className="text-xs text-slate italic mt-3"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Weighted means at the most recent wave
        {latestWave != null ? ` (Wave ${latestWave}${latestDates ? `, ${latestDates}` : ''})` : ''}.
        Hover any point for that wave&rsquo;s value, 95% CI, and n.
      </p>
    </>
  );

  const csvHeaders = [
    'outcome',
    'grouping_var',
    'group',
    'wave',
    'wave_dates',
    'weighted_value',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'n',
    'suppressed',
  ];
  const csvRows: unknown[][] = [];
  for (const [outcome, fan] of [
    [vars[0], fanA] as const,
    [vars[1], fanB] as const,
  ]) {
    for (const d of fan) {
      for (const g of groups) {
        const v = d[g];
        csvRows.push([
          outcome,
          grouping.groupingVar,
          g,
          d.wave,
          d.waveDates,
          typeof v === 'number' ? v : null,
          d[`${g}_ci_lo`] ?? null,
          d[`${g}_ci_hi`] ?? null,
          d[`${g}_n`] ?? null,
          typeof v !== 'number',
        ]);
      }
    }
  }

  const interpretationNode: ReactNode = interpretation
    ? renderPlatformInterpretation(interpretation, '', furtherReading)
    : `[WORK IN PROGRESS] ${title}. Each panel plots one of the two items, with a separate line per ${grouping.label.toLowerCase()} group, wave by wave; hover any point for its 95% CI and n.`;

  return (
    <StrataChartFrame
      enableShare
      eyebrow="Trends over time · Attitudes"
      title={title}
      subtitle={subtitle}
      titleInCard
      chart={chart}
      chartRef={chartRef}
      controls={controls}
      chartFooter={chartFooter}
      customNumbers={numbers}
      isPlaceholderInterpretation={interpretation == null}
      interpretation={interpretationNode}
      methodologyFootnote=""
      sourceNote={sourceNote}
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle: title,
        variables: [...vars],
        waves,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={filenameBase}
    />
  );
}
