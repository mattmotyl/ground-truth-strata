'use client';

import { useEffect, useRef, useState } from 'react';
import {
  loadConditionalBreakdowns,
} from '@/lib/strata-data';
import type {
  ConditionalBreakdownRow,
  MetaJson,
  PlatformRateRow,
} from '@/lib/strata-types';
import {
  conditionalWavesForConstruct,
  platformConditionalHeatmap,
  platformExperienceTrends,
  type ExperienceTrend,
} from '@/lib/platform-report-adapters';
import { EXPERIENCE_ITEMS } from '@/lib/platform-report-labels';
import { formatPercent } from '@/lib/strata-formatters';
import { PlatformTrendLine } from '@/components/charts/platform-trend-line';
import { ChartActions } from '@/components/charts/chart-actions';
import { SinglePlatformHeatmap } from './single-platform-heatmap';
import { ReportSection } from './report-section';

const WARM = '#CC0000';
const COOL = '#00897B';

interface SectionExperiencesProps {
  rows: PlatformRateRow[];
  meta: MetaJson;
  platformSlug: string;
  platformLabel: string;
}

const ARROW: Record<ExperienceTrend['trend'], string> = {
  increased: '↑',
  decreased: '↓',
  stable: '→',
};

function MiniChartCell({
  trend,
  yDomain,
}: {
  trend: ExperienceTrend;
  yDomain: [number, number];
}) {
  const color = trend.colorIntent === 'warm' ? WARM : COOL;
  return (
    <div className="rounded-md border border-mist/70 p-3 space-y-1">
      <p className="text-sm font-medium text-ink">{trend.label}</p>
      <PlatformTrendLine
        data={trend.points}
        color={color}
        yDomain={yDomain}
        compact
        height={170}
        ariaLabel={`${trend.label} rate over time`}
      />
      <div className="flex items-baseline justify-end gap-2">
        <span className="text-2xl text-plum" style={{ fontFamily: 'var(--font-serif)' }}>
          {formatPercent(trend.latestValue)}
        </span>
        <span
          className="text-base text-slate"
          title={`Change from first to last wave with data: ${trend.trend} (95% significance rule)`}
        >
          {ARROW[trend.trend]}
        </span>
        {trend.latestWave !== null ? (
          <span
            className="text-xs text-slate"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            W{trend.latestWave}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// Section 3 — What do people experience on [Platform]? A 2×2 grid of
// experience-rate mini trends (all waves) with latest value + W1→W6
// trend arrow, plus a follow-up subsection of topic/impact heatmaps for
// the negative-experience and bad-for-world items. conditional_breakdowns
// (1.2 MB) lazy-loads when the follow-up subsection nears the viewport.
export function SectionExperiences({
  rows,
  meta,
  platformSlug,
  platformLabel,
}: SectionExperiencesProps) {
  const exportRef = useRef<HTMLDivElement | null>(null);
  const followupRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [condRows, setCondRows] = useState<ConditionalBreakdownRow[] | null>(
    null,
  );

  // Lazy-trigger: load conditional_breakdowns once the follow-up block
  // approaches the viewport.
  useEffect(() => {
    if (shouldLoad) return;
    const el = followupRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true);
          obs.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (shouldLoad && condRows === null) {
      loadConditionalBreakdowns().then(setCondRows).catch(() => {});
    }
  }, [shouldLoad, condRows]);

  const waves = meta.waves.map((w) => w.wave).sort((a, b) => a - b);
  const datesByWave = new Map(meta.waves.map((w) => [w.wave, w.dates]));
  const trends = platformExperienceTrends(
    rows,
    platformSlug,
    EXPERIENCE_ITEMS,
    waves,
    datesByWave,
  );

  // Shared Y axis across the four mini-charts: 0–50%, bumped to 0–100%
  // if any of the four rates exceeds 40%.
  let maxVal = 0;
  for (const t of trends) {
    for (const p of t.points) {
      if (p.value !== null && p.value > maxVal) maxVal = p.value;
    }
  }
  const yDomain: [number, number] = maxVal > 0.4 ? [0, 1] : [0, 0.5];

  const followUpItems = EXPERIENCE_ITEMS.filter((i) => i.followUps.length > 0);

  const sourceNote = `Source: UAS panel Waves 1–6, ${platformLabel} users. Weighted estimates; 95% CI as shaded bands on the trend charts and on hover. Trend arrows compare the first and last waves with data using a 95% significance rule (↑/↓ only when the change exceeds its margin of error; → otherwise). Follow-up breakdowns are among users who reported the experience; respondents could select multiple options, so percentages may sum to more than 100%. Cells with n < 30 are suppressed by design.`;

  // CSV — the four experience-rate trends in long format.
  const csvHeaders = [
    'platform_slug',
    'platform_label',
    'metric',
    'experience',
    'wave',
    'wave_dates',
    'weighted_value',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'n',
    'suppressed',
  ];
  const csvRows: unknown[][] = [];
  for (const t of trends) {
    for (const p of t.points) {
      csvRows.push([
        platformSlug,
        platformLabel,
        t.metric,
        t.label,
        p.wave,
        p.waveDates,
        p.value,
        p.ciLow,
        p.ciHigh,
        p.n,
        p.value === null,
      ]);
    }
  }

  return (
    <ReportSection
      id="experiences"
      title={`What do people experience on ${platformLabel}?`}
      exportRef={exportRef}
      sourceNote={sourceNote}
      seeMore={{
        href: '/compare',
        label: 'See ranked comparison across platforms →',
      }}
      actions={
        <ChartActions
          chartRef={exportRef}
          csv={{ headers: csvHeaders, rows: csvRows }}
          filenameBase={`strata-${platformSlug}-experiences`}
          citation={{
            findingTitle: `${platformLabel} — experiences (negative, bad-for-world, connection, useful)`,
            variables: ['us003', 'us007', 'us010', 'us012'],
            waves,
            source: 'Understanding America Study, USC CESR',
            generatedAt: meta.generated_at,
          }}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {trends.map((t) => (
          <MiniChartCell key={t.metric} trend={t} yDomain={yDomain} />
        ))}
      </div>

      <div ref={followupRef} className="pt-5 mt-2 border-t border-mist space-y-6">
        <h3
          className="text-lg text-plum"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          Follow-up breakdowns
        </h3>
        {!condRows ? (
          <p
            className="text-sm text-slate py-4"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Loading breakdowns…
          </p>
        ) : (
          followUpItems.map((item) => (
            <div key={item.metric} className="space-y-4">
              <h4 className="text-base font-semibold text-ink">{item.label}</h4>
              {item.followUps.map((fu) => {
                const condWaves = conditionalWavesForConstruct(
                  condRows,
                  platformSlug,
                  fu.construct,
                );
                const table = platformConditionalHeatmap(
                  condRows,
                  platformSlug,
                  fu.construct,
                  condWaves,
                );
                return (
                  <div key={fu.construct} className="space-y-1.5">
                    <p className="text-sm text-ink/85">
                      {fu.title} on {platformLabel}
                    </p>
                    {table.options.length === 0 ? (
                      <p
                        className="text-xs text-slate"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        No breakdown data available for {platformLabel}.
                      </p>
                    ) : (
                      <SinglePlatformHeatmap
                        table={table}
                        datesByWave={datesByWave}
                        ariaLabel={`${fu.title} on ${platformLabel}, by survey wave`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </ReportSection>
  );
}
