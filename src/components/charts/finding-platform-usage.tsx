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
  shortWaveLabel,
} from '@/lib/strata-formatters';
import { PlatformWaveTable } from './platform-wave-table';
import { StrataChartFrame } from './strata-chart-frame';
import { type Weighting } from './weighted-toggle';

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

// Count of respondents who reported using a given platform in a given
// wave. For usage_rate rows, n_panel is the wave sample size (the
// denominator), and value is the share reporting yes; the count of
// users is therefore round(value * n_panel). We always derive this
// from the UNWEIGHTED row (raw counts in the sample) so the display
// is stable across the weighted/unweighted toggle — weighting affects
// the rate ESTIMATE, not the count of respondents who actually
// reported using the platform.
function userCount(row: PlatformRateRow): number | null {
  if (row.suppressed) return null;
  if (row.value === null || row.n === null) return null;
  return Math.round(row.value * row.n);
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
    const dates = waveDateMap.get(wave) ?? '';
    const datum: ChartDatum = {
      wave,
      waveLabel: shortWaveLabel(wave, dates),
      waveDates: dates,
    };
    for (const slug of visibleSlugs) {
      const row = rows.find(
        (r) => r.wave === wave && r.platform_slug === slug,
      );
      if (!row || row.suppressed) {
        datum[slug] = null;
        datum[`${slug}_ci_lo`] = null;
        datum[`${slug}_ci_hi`] = null;
        datum[`${slug}_users`] = null;
        continue;
      }
      datum[slug] =
        weighting === 'weighted' ? row.weighted_value : row.value;
      datum[`${slug}_ci_lo`] =
        weighting === 'weighted' ? row.weighted_ci_lower : row.ci_lower;
      datum[`${slug}_ci_hi`] =
        weighting === 'weighted' ? row.weighted_ci_upper : row.ci_upper;
      // Always show the actual user count (unweighted-derived), not
      // weighted_n_eff — see userCount() comment.
      datum[`${slug}_users`] = userCount(row);
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
          const nUsers = datum[`${slug}_users`];
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
              {typeof nUsers === 'number' ? (
                <span className="text-slate">n={formatN(nUsers)}</span>
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
  // The 8 platforms that have a line in the chart legend. Fixed across
  // the session — they don't move when the user hides one.
  const chartPlatforms = initialPlatforms ?? DEFAULT_TOP_8;
  // Set of platforms the user has hidden from the chart via legend
  // click. Hidden lines stay in the legend (so the user can restore
  // them) and stay in the Numbers table (grayed out).
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
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
    return buildChartData(rows, meta, weighting, chartPlatforms);
  }, [rows, meta, weighting, chartPlatforms]);

  // Swatch lookup so the Numbers table can show the same colored marker
  // next to platforms that have a corresponding line in the chart.
  // Stable across hiding/showing — each chartPlatforms slug gets its
  // assigned color regardless of which others are currently hidden.
  const swatchBySlug = useMemo(() => {
    const m = new Map<string, string>();
    chartPlatforms.forEach((slug, i) => {
      m.set(
        slug,
        STRATA_PALETTES.qualitative8[
          i % STRATA_PALETTES.qualitative8.length
        ],
      );
    });
    return m;
  }, [chartPlatforms]);

  const toggleHidden = (slug: string) => {
    setHidden((curr) => {
      const next = new Set(curr);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const showAll = () => setHidden(new Set());

  const hiddenLabels = [...hidden].map(
    (s) => platformLabels.get(s) ?? s,
  );

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
            cursor: 'pointer',
          }}
          formatter={(value) => {
            const slug = String(value);
            const label = platformLabels.get(slug) ?? slug;
            const isHidden = hidden.has(slug);
            return (
              <span
                style={{
                  color: isHidden ? '#605A6B' : '#18161F',
                  textDecoration: isHidden ? 'line-through' : 'none',
                }}
              >
                {label}
              </span>
            );
          }}
          onClick={(entry) => {
            const slug = entry.dataKey as string;
            toggleHidden(slug);
          }}
        />
        {chartPlatforms.map((slug, i) => (
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
            hide={hidden.has(slug)}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );

  // Hidden-platforms note rendered between chart and Numbers table.
  let hiddenNote: string | null = null;
  if (hidden.size === 1) {
    hiddenNote =
      'Note: ' +
      hiddenLabels[0] +
      ' hidden. Click legend to restore.';
  } else if (hidden.size > 1 && hidden.size <= 3) {
    const last = hiddenLabels[hiddenLabels.length - 1];
    const head = hiddenLabels.slice(0, -1).join(', ');
    hiddenNote =
      'Note: ' + head + ' and ' + last + ' hidden. Click legend to restore.';
  } else if (hidden.size > 3) {
    hiddenNote =
      'Note: ' + hidden.size + ' platforms hidden. Click legend to restore.';
  }

  // CSV: long format mirroring the underlying platform_rates.json (one
  // row per platform-wave). Includes both weighted and unweighted
  // estimates regardless of toggle so the CSV is the whole truth, not
  // just the current view. Adds a derived n_users column (count of
  // respondents who reported using the platform).
  const csvHeaders = [
    'platform_slug',
    'platform_label',
    'wave',
    'wave_dates',
    'value',
    'ci_lower',
    'ci_upper',
    'n_panel',
    'n_users',
    'weighted_value',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'weighted_n_eff',
    'suppressed',
  ];
  const csvRows: unknown[][] = rows
    .filter((r) => chartPlatforms.includes(r.platform_slug))
    .map((r) => [
      r.platform_slug,
      r.platform_label,
      r.wave,
      meta.waves.find((w) => w.wave === r.wave)?.dates ?? '',
      r.value,
      r.ci_lower,
      r.ci_upper,
      r.n,
      userCount(r),
      r.weighted_value,
      r.weighted_ci_lower,
      r.weighted_ci_upper,
      r.weighted_n_eff,
      r.suppressed,
    ]);

  const waveCount = meta.waves.length;
  const weightingLabel =
    weighting === 'weighted' ? 'Weighted' : 'Unweighted';
  const subtitleText =
    'Share of U.S. adults reporting each platform among the services they use, across ' +
    wavesSpan +
    ' (' +
    waveCount +
    ' survey waves, 2023–2025). Click a platform in the legend to hide or show its line.';
  const interpretationText =
    'The two highest-usage tools across the panel are workhorse communication channels — email and text messaging — not social-media platforms. Among purely social services, YouTube and Facebook have the broadest reach, with Instagram third. TikTok’s share has grown across waves while Snapchat’s has stayed roughly flat. The numbers table below covers all 23 platforms across the six survey waves; hover any cell for its 95% confidence interval and user count.';
  const methodologyFootnoteText =
    'Source: UAS panel waves 1–6 (UAS514–UAS519), 2023–2025. ' +
    weightingLabel +
    ' estimates. 95% CIs available on hover (chart line + Numbers table cells). Cells with n < 30 are suppressed by design. Precomputed JSON generated ' +
    generatedAt +
    '.';

  const chartFooter = hiddenNote ? (
    <div
      className="flex items-center justify-between gap-3 flex-wrap text-xs"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <span className="text-slate">{hiddenNote}</span>
      <button
        type="button"
        onClick={showAll}
        className="text-mulberry hover:text-plum underline-offset-2 hover:underline"
      >
        Show all
      </button>
    </div>
  ) : null;

  return (
    <StrataChartFrame
      eyebrow="Finding 01 · Trends over time"
      title="Who uses what?"
      subtitle={subtitleText}
      weighting={weighting}
      onWeightingChange={setWeighting}
      chart={chart}
      chartRef={chartRef}
      chartFooter={chartFooter}
      customNumbers={
        <PlatformWaveTable
          rows={rows}
          meta={meta}
          weighting={weighting}
          hidden={hidden}
          swatchBySlug={swatchBySlug}
        />
      }
      isPlaceholderInterpretation
      interpretation={interpretationText}
      methodologyFootnote={methodologyFootnoteText}
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
