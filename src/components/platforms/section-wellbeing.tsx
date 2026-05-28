'use client';

import { useEffect, useRef, useState } from 'react';
import { loadGroupComparisons } from '@/lib/strata-data';
import type { GroupComparisonRow, MetaJson } from '@/lib/strata-types';
import {
  platformWellbeingTable,
  wellbeingWaves,
} from '@/lib/platform-report-adapters';
import { WELLBEING_ITEMS } from '@/lib/platform-report-labels';
import { waveTableHeader } from '@/lib/strata-formatters';
import {
  WithinVariableTable,
  type WaveColumn,
} from './within-variable-table';
import { CsvDownloadButton } from './csv-download-button';
import { ReportSection } from './report-section';

interface SectionWellbeingProps {
  meta: MetaJson;
  platformSlug: string;
  platformLabel: string;
}

// Section 4 — How do [Platform] users feel? Loneliness + the 12 ls002
// life-satisfaction items among the platform's users, all waves as
// columns. group_comparisons.json (6.8 MB) lazy-loads via
// IntersectionObserver when the section nears the viewport.
export function SectionWellbeing({
  meta,
  platformSlug,
  platformLabel,
}: SectionWellbeingProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [groupRows, setGroupRows] = useState<GroupComparisonRow[] | null>(
    null,
  );

  useEffect(() => {
    if (shouldLoad) return;
    const el = rootRef.current;
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
    if (shouldLoad && groupRows === null) {
      loadGroupComparisons().then(setGroupRows).catch(() => {});
    }
  }, [shouldLoad, groupRows]);

  const datesByWave = new Map(meta.waves.map((w) => [w.wave, w.dates]));
  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');

  const waves = groupRows ? wellbeingWaves(groupRows, platformSlug) : [];
  const waveColumns: WaveColumn[] = waves.map((w) => ({
    wave: w,
    header: waveTableHeader(datesByWave.get(w)),
  }));
  const groups = groupRows
    ? platformWellbeingTable(groupRows, platformSlug, WELLBEING_ITEMS, waves)
    : [];

  const sourceNote = `Source: UAS panel, ${platformLabel} users by survey wave. Weighted estimates; 95% CI and n shown on hover. Life-satisfaction items group the 7-point scale into Agree (5–7) / Neutral (4) / Disagree (1–3). “Feels negative most of the time” is reverse-coded: “Doesn’t feel negative” is the wellbeing-positive direction. Loneliness (UCLA 3-item) was measured in Waves 2, 5, and 6 only; blank cells in other waves mean the item was not asked, not suppression. Cells with n < 30 are suppressed (—) by design. Precomputed JSON generated ${generatedAt}.`;

  const csvHeaders = [
    'platform_slug',
    'platform_label',
    'outcome',
    'category',
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
          r.categoryLabel,
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
      id="wellbeing"
      title={`How do ${platformLabel} users feel?`}
      subtitle="Self-reported wellbeing among this platform’s users, by survey wave."
      sourceNote={groupRows ? sourceNote : undefined}
      seeMore={[
        {
          href: '/compare',
          label: 'See how loneliness compares across platforms →',
        },
        {
          href: '/explore',
          label: 'See how platform use correlates with wellbeing →',
        },
      ]}
      actions={
        groupRows ? (
          <CsvDownloadButton
            headers={csvHeaders}
            rows={csvRows}
            filenameBase={`strata-${platformSlug}-wellbeing`}
          />
        ) : undefined
      }
    >
      <div ref={rootRef}>
        {!groupRows ? (
          <p
            className="text-sm text-slate py-6"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Loading wellbeing data…
          </p>
        ) : waves.length === 0 ? (
          <p className="text-sm text-slate py-6">
            No wellbeing data available for {platformLabel}.
          </p>
        ) : (
          <WithinVariableTable
            groups={groups}
            waveColumns={waveColumns}
            ariaLabel={`Wellbeing of ${platformLabel} users by survey wave`}
          />
        )}
      </div>
    </ReportSection>
  );
}
