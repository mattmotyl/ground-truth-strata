'use client';

import type { MetaJson, PlatformDemographicRow } from '@/lib/strata-types';
import {
  platformDemographicsToTable,
  platformDemographicWaves,
} from '@/lib/platform-report-adapters';
import { DEMOGRAPHIC_VARS } from '@/lib/platform-report-labels';
import { waveTableHeader } from '@/lib/strata-formatters';
import {
  WithinVariableTable,
  type WaveColumn,
} from './within-variable-table';
import { CsvDownloadButton } from './csv-download-button';
import { ReportSection } from './report-section';

interface SectionDemographicsProps {
  rows: PlatformDemographicRow[];
  meta: MetaJson;
  platformSlug: string;
  platformLabel: string;
}

// Section 2 — Who uses [Platform]? Demographic composition of the
// platform's users, all available waves shown as columns (no wave
// selector for this section per the multi-wave table design).
export function SectionDemographics({
  rows,
  meta,
  platformSlug,
  platformLabel,
}: SectionDemographicsProps) {
  const waves = platformDemographicWaves(rows, platformSlug);
  const datesByWave = new Map(meta.waves.map((w) => [w.wave, w.dates]));
  const waveColumns: WaveColumn[] = waves.map((w) => ({
    wave: w,
    header: waveTableHeader(datesByWave.get(w)),
  }));
  const groups = platformDemographicsToTable(
    rows,
    platformSlug,
    DEMOGRAPHIC_VARS,
    waves,
  );

  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');
  const sourceNote = `Source: UAS panel, ${platformLabel} users by survey wave. Weighted estimates; 95% CI and n shown on hover. Cells with n < 30 are suppressed (—) by design. Percentages within each variable group may not sum to 100% due to rounding, missing values, or suppressed cells. Race/ethnicity categories are non-Hispanic except “Hispanic.” Precomputed JSON generated ${generatedAt}.`;

  const csvHeaders = [
    'platform_slug',
    'platform_label',
    'grouping_var',
    'group_value',
    'wave',
    'wave_dates',
    'weighted_value',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'n',
    'suppressed',
  ];
  const csvRows: unknown[][] = [];
  for (const g of groups) {
    for (const r of g.rows) {
      for (const c of r.cells) {
        csvRows.push([
          platformSlug,
          platformLabel,
          g.groupingVar,
          r.categoryValue,
          c.wave,
          datesByWave.get(c.wave) ?? '',
          c.value,
          c.ciLow,
          c.ciHigh,
          c.n,
          c.suppressed,
        ]);
      }
    }
  }

  return (
    <ReportSection
      id="demographics"
      title={`Who uses ${platformLabel}?`}
      subtitle="Demographic composition of this platform’s users in each survey wave."
      sourceNote={sourceNote}
      seeMore={{
        href: '/compare',
        label: 'See how political composition compares across platforms →',
      }}
      actions={
        <CsvDownloadButton
          headers={csvHeaders}
          rows={csvRows}
          filenameBase={`strata-${platformSlug}-demographics`}
        />
      }
    >
      {waves.length === 0 ? (
        <p className="text-sm text-slate py-6">
          No demographic data available for {platformLabel}.
        </p>
      ) : (
        <WithinVariableTable groups={groups} waveColumns={waveColumns} />
      )}
    </ReportSection>
  );
}
