'use client';

import { useRef } from 'react';
import type { MetaJson, PlatformRateRow } from '@/lib/strata-types';
import type { QuestionTextsJson } from '@/lib/strata-data';
import { platformMetricTrend } from '@/lib/platform-report-adapters';
import { PlatformTrendLine } from '@/components/charts/platform-trend-line';
import { ChartActions } from '@/components/charts/chart-actions';
import { formatSurveyQuestion, surveyQuestionFor } from '@/lib/strata-survey';
import { ReportSection } from './report-section';

interface SectionUsageProps {
  // All platform_rates rows (already loaded by the orchestrator).
  rows: PlatformRateRow[];
  meta: MetaJson;
  questionTexts: QuestionTextsJson | null;
  platformSlug: string;
  platformLabel: string;
}

// Section 1 — Platform Usage Over Time. A single-platform usage-rate line
// spanning every wave the platform has data for; the global wave selector
// intentionally does NOT scope this section (it shows the whole trend).
export function SectionUsage({
  rows,
  meta,
  questionTexts,
  platformSlug,
  platformLabel,
}: SectionUsageProps) {
  const exportRef = useRef<HTMLDivElement | null>(null);

  const waves = meta.waves.map((w) => w.wave).sort((a, b) => a - b);
  const waveDatesByWave = new Map(meta.waves.map((w) => [w.wave, w.dates]));
  const data = platformMetricTrend(
    rows,
    platformSlug,
    'usage_rate',
    waves,
    waveDatesByWave,
  );

  const wavesWithData = data.filter((p) => p.value !== null).map((p) => p.wave);  const waveSpan =
    waves.length > 0
      ? `Waves ${Math.min(...waves)}–${Math.max(...waves)}`
      : '';

  const subtitle = formatSurveyQuestion(
    surveyQuestionFor('us001', questionTexts, meta),
  );

  const csvHeaders = [
    'platform_slug',
    'platform_label',
    'wave',
    'wave_dates',
    'weighted_value',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'n',
    'suppressed',
  ];
  const csvRows: unknown[][] = data.map((p) => [
    platformSlug,
    platformLabel,
    p.wave,
    p.waveDates,
    p.value,
    p.ciLow,
    p.ciHigh,
    p.n,
    p.value === null,
  ]);

  const sourceNote = `Source: UAS panel ${waveSpan} (2023–2025). Weighted estimates. 95% CI shown as the shaded band and in the hover tooltip; n shown in tooltip. Cells with n < 30 are suppressed by design.`;

  return (
    <ReportSection
      id="usage"
      title="Platform Usage Over Time"
      subtitle={subtitle}
      exportRef={exportRef}
      sourceNote={sourceNote}
      seeMore={{
        href: '/trends',
        label: 'See full cross-platform usage comparison →',
      }}
      actions={
        <ChartActions
          chartRef={exportRef}
          csv={{ headers: csvHeaders, rows: csvRows }}
          filenameBase={`strata-${platformSlug}-usage`}
          citation={{
            findingTitle: `${platformLabel} — platform usage over time`,
            variables: ['us001 (platforms_used)'],
            waves: wavesWithData.length > 0 ? wavesWithData : waves,
            source: 'Understanding America Study, USC CESR',
            generatedAt: meta.generated_at,
          }}
        />
      }
    >
      <PlatformTrendLine
        data={data}
        ariaLabel={`${platformLabel} usage rate across survey waves`}
      />
    </ReportSection>
  );
}
