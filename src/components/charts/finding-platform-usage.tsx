'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  loadMeta,
  loadPlatformRates,
} from '@/lib/strata-data';
import type {
  MetaJson,
  PlatformRateRow,
} from '@/lib/strata-types';
import { CHART_FONTS, CHART_HEIGHTS, STRATA_PALETTES } from '@/lib/strata-charts';
import {
  formatCI,
  formatN,
  formatPercent,
} from '@/lib/strata-formatters';
import { StrataChartFrame } from './strata-chart-frame';
import { type Weighting } from './weighted-toggle';
import type { StatRow } from './numbers-meaning-block';

// Default visible set: the 8 platforms with the highest weighted usage
// rate in W1. The user can toggle individual platforms via the legend.
const DEFAULT_TOP_8: string[] = [
  'email',
  'text_messaging',
  'youtube',
  'facebook',
  'instagram',
  'facetime',
  'tiktok',
  'snapchat',
];

interface ChartDatum {
  wave: number;
  waveLabel: string;
  waveDates: string;
  // Per-platform value + ci_lo + ci_hi + n. Keys are platform slugs.
  // Values are `number | null` so suppressed cells produce gaps.
  [k: string]: number | string | null;
}

function buildChartData(
  rows: PlatformRateRow[],
  meta: MetaJson,
  weighting: Weighting,
  visibleSlugs: string[],
): ChartDatum[] {
  const waveDateMap = new Map(meta.waves.map((w) => [w.wave, w.dates]));
  const waves = [...new Set(rows.map((r) => r.wave))].sort();
  return waves.map((wave) => {
    const datum: ChartDatum = {
      wave,
      waveLabel: `W${wave}`,
      waveDates: waveDateMap.get(wave) ?? '',
    };
    for (const slug of visibleSlugs) {
      const row = rows.find(
        (r) => r.wave === wave && r.platform_slug === slug,
      );
      if (!row || row.suppressed) {
        datum[slug] = null;
        datum[`${slug}_ci_lo`] = null;
        datum[`${slug}_ci_hi`] = null;
        datum[`${slug}_n`] = null;
        continue;
      }
      datum[slug] =
        weighting === 'weighted' ? row.weighted_value : row.value;
      datum[`${slug}_ci_lo`] =
        weighting === 'weighted' ? row.weighted_ci_lower : row.ci_lower;
      datum[`${slug}_ci_hi`] =
        weighting === 'weighted' ? row.weighted_ci_upper : row.ci_upper;
      datum[`${slug}_n`] =
        weighting === 'weighted' ? row.weighted_n_eff : row.n;
    }
    return datum;
  });
}

// Recharts' Tooltip content prop passes a loosely-typed payload (dataKey
// can be a function, value can be of any type) — we narrow what we need
// at the use site rather than fight the generic contract.
interface PlatformTooltipProps {
  active?: boolean;
  payload?: readonly {
    dataKey?: string | number | ((d: unknown) => unknown);
    value?: unknown;
    color?: string;
    payload?: unknown;
  }[];
  label?: unknown;
  platformLabels: Map<string, string>;
}

function PlatformTooltip({
  active,
  payload,
  label,
  platformLabels,
}: PlatformTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload as ChartDatum | undefined;
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
          const value =
            typeof p.value === 'number' ? p.value : null;
          const ciLo = datum[`${slug}_ci_lo`];
          const ciHi = datum[`${slug}_ci_hi`];
          const n = datum[`${slug}_n`];
          if (value === null) return null;
          return (
            <li key={slug} className="flex items-baseline gap-2">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-sm shrink-0"
                style={{ backgroundColor: p.color }}
              />
              <span className="text-ink/85 flex-1">
                {platformLabels.get(slug) ?? slug}
              </span>
              <span className="text-ink font-medium">
                {formatPercent(value)}
              </span>
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

interface FindingPlatformUsageProps {
  // Optional override for default visible set (e.g., set by a URL query
  // param in a later milestone).
  initialPlatforms?: string[];
}

export function FindingPlatformUsage({
  initialPlatforms,
}: FindingPlatformUsageProps = {}) {
  const [rows, setRows] = useState<PlatformRateRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [weighting, setWeighting] = useState<Weighting>('weighted');
  const [visible, setVisible] = useState<string[]>(
    initialPlatforms ?? DEFAULT_TOP_8,
  );
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([loadPlatformRates(), loadMeta()])
      .then(([allRows, m]) => {
        setRows(allRows.filter((r) => r.metric === 'usage_rate'));
        setMeta(m);
      })
      .catch(setError);
  }, []);

  const platformLabels = useMemo(() => {
    if (!meta) return new Map<string, string>();
    return new Map(meta.platforms.map((p) => [p.slug, p.label]));
  }, [meta]);

  const chartData = useMemo(() => {
    if (!rows || !meta) return [];
    return buildChartData(rows, meta, weighting, visible);
  }, [rows, meta, weighting, visible]);

  const w6Stats = useMemo<StatRow[]>(() => {
    if (!rows) return [];
    type Ranked = StatRow & { _sortBy: number };
    const ranked: Ranked[] = [];
    for (const slug of visible) {
      const row = rows.find(
        (r) => r.wave === 6 && r.platform_slug === slug,
      );
      if (!row) continue;
      const value =
        weighting === 'weighted' ? row.weighted_value : row.value;
      const ciLo =
        weighting === 'weighted' ? row.weighted_ci_lower : row.ci_lower;
      const ciHi =
        weighting === 'weighted' ? row.weighted_ci_upper : row.ci_upper;
      const n = weighting === 'weighted' ? row.weighted_n_eff : row.n;
      const swatch =
        STRATA_PALETTES.qualitative8[
          visible.indexOf(slug) % STRATA_PALETTES.qualitative8.length
        ];
      ranked.push({
        key: slug,
        label: platformLabels.get(slug) ?? slug,
        value: row.suppressed ? 'insufficient n' : formatPercent(value),
        sub: row.suppressed ? null : (
          <>
            {formatCI(ciLo, ciHi)} · n={formatN(n)}
          </>
        ),
        swatch,
        _sortBy: value ?? -1,
      });
    }
    ranked.sort((a, b) => b._sortBy - a._sortBy);
    return ranked.map(({ _sortBy, ...rest }) => {
      void _sortBy;
      return rest;
    });
  }, [rows, visible, weighting, platformLabels]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load platform usage data: {error.message}</p>
      </div>
    );
  }

  if (!rows || !meta) {
    return (
      <div
        className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Loading platform usage data…
      </div>
    );
  }

  const allWaves = meta.waves.map((w) => w.wave);
  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');
  const wavesSpan = `W${Math.min(...allWaves)}–W${Math.max(...allWaves)}`;

  const chart = (
    <ResponsiveContainer width="100%" height={CHART_HEIGHTS.line}>
      <LineChart
        data={chartData}
        margin={{ top: 16, right: 32, bottom: 24, left: 8 }}
      >
        <CartesianGrid stroke="#E7E1EC" strokeDasharray="3 3" />
        <XAxis
          dataKey="waveLabel"
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
          tickMargin={6}
        />
        <YAxis
          domain={[0, 1]}
          tickFormatter={(v) => `${Math.round((v as number) * 100)}%`}
          stroke="#605A6B"
          fontFamily={CHART_FONTS.mono}
          fontSize={12}
          tickMargin={4}
        />
        <Tooltip
          content={(props) => (
            <PlatformTooltip {...props} platformLabels={platformLabels} />
          )}
        />
        <Legend
          verticalAlign="bottom"
          height={32}
          wrapperStyle={{
            fontFamily: CHART_FONTS.mono,
            fontSize: 12,
            paddingTop: 8,
          }}
          formatter={(value) => platformLabels.get(value) ?? value}
          onClick={(entry) => {
            const slug = entry.dataKey as string;
            // Toggle: hide if visible (but keep at least one platform shown),
            // re-show at the end if hidden. Since visible is the source of
            // truth, removing it stops rendering its line.
            setVisible((curr) =>
              curr.includes(slug)
                ? curr.filter((s) => s !== slug)
                : [...curr, slug],
            );
          }}
        />
        {visible.map((slug, i) => (
          <Line
            key={slug}
            type="monotone"
            dataKey={slug}
            stroke={
              STRATA_PALETTES.qualitative8[
                i % STRATA_PALETTES.qualitative8.length
              ]
            }
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );

  // CSV: long format mirroring the underlying platform_rates.json (one
  // row per platform-wave-weighting). Includes both weighted and
  // unweighted estimates regardless of toggle so the CSV is the whole
  // truth, not just the current view.
  const csvHeaders = [
    'platform_slug',
    'platform_label',
    'wave',
    'wave_dates',
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
  const csvRows: unknown[][] = rows
    .filter((r) => visible.includes(r.platform_slug))
    .map((r) => [
      r.platform_slug,
      r.platform_label,
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

  return (
    <StrataChartFrame
      eyebrow="Finding 01 · Trends over time"
      title="Who uses what?"
      subtitle={
        <>
          Share of U.S. adults reporting each platform among the services
          they use, across {wavesSpan} ({meta.waves.length} survey waves,
          2023&ndash;2025). Click a platform in the legend to hide or
          show its line.
        </>
      }
      weighting={weighting}
      onWeightingChange={setWeighting}
      chart={chart}
      chartRef={chartRef}
      stats={w6Stats}
      isPlaceholderInterpretation
      interpretation={
        <>
          The two highest-usage tools across the panel are workhorse
          communication channels — <strong>email</strong> and{' '}
          <strong>text messaging</strong> — not social-media platforms.
          Among purely social services, <strong>YouTube</strong> and{' '}
          <strong>Facebook</strong> have the broadest reach, with{' '}
          <strong>Instagram</strong> third. TikTok&rsquo;s share has
          grown across waves while Snapchat&rsquo;s has stayed roughly
          flat. Click a platform in the legend to focus on its
          trajectory; see <em>The numbers</em> for wave-6 point
          estimates with 95% confidence intervals.
        </>
      }
      methodologyFootnote={
        <>
          Source: UAS panel waves 1–6 (UAS514–UAS519), 2023–2025.{' '}
          {weighting === 'weighted' ? 'Weighted' : 'Unweighted'}{' '}
          estimates. 95% CIs in tooltip and <em>The numbers</em>.
          Cells with n &lt; 30 are suppressed by design. Precomputed
          JSON generated {generatedAt}.
        </>
      }
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle: 'Who uses what? Platform usage rates',
        variables: ['us001 (platforms_used)'],
        waves: allWaves,
        weighting,
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={`strata_platform_usage_${weighting}`}
    />
  );
}
