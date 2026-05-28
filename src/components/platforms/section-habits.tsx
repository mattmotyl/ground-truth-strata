'use client';

import { useRef, useState } from 'react';
import type {
  LikertBucket,
  MetaJson,
  PlatformRateRow,
} from '@/lib/strata-types';
import {
  habitWavesWithData,
  platformHabitsToSeries,
} from '@/lib/platform-report-adapters';
import { HABIT_ITEMS } from '@/lib/platform-report-labels';
import { fullWaveLabel } from '@/lib/strata-formatters';
import { CompareRankedBar } from '@/components/charts/compare-ranked-bar';
import { ChartActions } from '@/components/charts/chart-actions';
import { ReportSection } from './report-section';

const PLUM = '#4B2E63'; // % agree
const AMBER = '#FFC107'; // % disagree — matches /compare Theme B

type ResponseType = 'agree' | 'disagree';

interface SectionHabitsProps {
  rows: PlatformRateRow[];
  meta: MetaJson;
  platformSlug: string;
  platformLabel: string;
}

// Section 5 — How habitual is [Platform] use? Ranked bar of the seven
// us018 habit-scale items for one wave, with a local wave selector
// (W4–W6; W1–W3 ghosted, same logic as compare-explorer) and a
// % agree / % disagree toggle.
export function SectionHabits({
  rows,
  meta,
  platformSlug,
  platformLabel,
}: SectionHabitsProps) {
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [responseType, setResponseType] = useState<ResponseType>('agree');
  const [waveChoice, setWaveChoice] = useState<number | null>(null);

  const bucket: LikertBucket = responseType;
  const availableWaves = habitWavesWithData(rows, platformSlug, bucket);
  const availSet = new Set(availableWaves);
  const latest = availableWaves[availableWaves.length - 1] ?? null;
  const effectiveWave =
    waveChoice !== null && availSet.has(waveChoice) ? waveChoice : latest;

  const datesByWave = new Map(meta.waves.map((w) => [w.wave, w.dates]));
  const generatedAt = new Date(meta.generated_at).toLocaleDateString('en-US');

  const series =
    effectiveWave !== null
      ? platformHabitsToSeries(
          rows,
          platformSlug,
          effectiveWave,
          bucket,
          HABIT_ITEMS,
        )
      : [];

  const axisLabel = responseType === 'agree' ? '% who agree' : '% who disagree';
  const coloring = {
    mode: 'solid' as const,
    color: responseType === 'agree' ? PLUM : AMBER,
  };

  const subtitle = `Seven-item platform habit and attitude scale. Respondents rated their agreement with each statement about their use of ${platformLabel} on a 7-point scale (Strongly Disagree to Strongly Agree). Items are non-validated and appear in Waves 4–6 only.`;

  // ── controls (rendered above the exported card) ─────────────────────
  const waveSelector = (
    <div className="space-y-1">
      <p
        className="text-xs text-slate uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Wave
      </p>
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">Select wave</legend>
        {meta.waves.map((wv) => {
          const w = wv.wave;
          const avail = availSet.has(w);
          const tip = avail
            ? undefined
            : w < 4
              ? `This question was not asked in Wave ${w}.`
              : `No data for ${platformLabel} in Wave ${w}.`;
          const selected = avail && effectiveWave === w;
          return (
            <label
              key={w}
              title={tip}
              className={
                'text-xs rounded-md border px-2 py-1 ' +
                (avail ? 'cursor-pointer ' : 'cursor-not-allowed opacity-40 ') +
                (selected
                  ? 'border-plum bg-plum/5 text-plum font-medium'
                  : 'border-mist text-ink hover:border-mulberry')
              }
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <input
                type="radio"
                name="habit-wave"
                value={w}
                checked={selected}
                disabled={!avail}
                onChange={() => setWaveChoice(w)}
                className="sr-only"
              />
              W{w}
            </label>
          );
        })}
      </fieldset>
    </div>
  );

  const responseSelector = (
    <div className="space-y-1">
      <p
        className="text-xs text-slate uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Response type
      </p>
      <fieldset className="flex gap-4 text-sm">
        <legend className="sr-only">Select response type</legend>
        {(['agree', 'disagree'] as const).map((rt) => (
          <label key={rt} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="habit-response"
              value={rt}
              checked={responseType === rt}
              onChange={() => setResponseType(rt)}
              className="accent-plum"
            />
            <span
              className={responseType === rt ? 'text-ink' : 'text-slate'}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {rt === 'agree' ? '% who agree' : '% who disagree'}
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );

  const controls = (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
      {waveSelector}
      {responseSelector}
    </div>
  );

  // ── CSV + source note + citation ────────────────────────────────────
  const csvHeaders = [
    'platform_slug',
    'platform_label',
    'wave',
    'wave_dates',
    'metric',
    'item_label',
    'response_band',
    'weighted_value',
    'weighted_ci_lower',
    'weighted_ci_upper',
    'n',
    'suppressed',
  ];
  const csvRows: unknown[][] = series.map((d) => [
    platformSlug,
    platformLabel,
    effectiveWave,
    effectiveWave !== null ? datesByWave.get(effectiveWave) ?? '' : '',
    d.platform_slug, // repurposed as the us018 metric key
    d.label,
    responseType,
    d.value,
    d.ciLow,
    d.ciHigh,
    d.n,
    d.suppressed,
  ]);

  const waveLabel =
    effectiveWave !== null
      ? fullWaveLabel(effectiveWave, datesByWave.get(effectiveWave))
      : '';
  const suppressedItems = series
    .filter((d) => d.suppressed)
    .map((d) => d.label);
  const suppNote =
    suppressedItems.length > 0
      ? ` (this wave: ${suppressedItems.join(', ')})`
      : '';
  const sourceNote =
    effectiveWave !== null
      ? `Source: UAS panel ${waveLabel}, ${platformLabel} users. Weighted estimates. 95% CIs as error bars at bar tips and in the hover tooltip; n in tooltip. Platform habit/attitude scale, Waves 4–6 only; items are non-validated. Cells with n < 30 are suppressed by design${suppNote}. Precomputed JSON generated ${generatedAt}.`
      : undefined;

  return (
    <ReportSection
      id="habits"
      title={`How habitual is ${platformLabel} use?`}
      waveNote="Data available from Wave 4 onward."
      subtitle={subtitle}
      controls={effectiveWave !== null ? controls : undefined}
      exportRef={exportRef}
      sourceNote={sourceNote}
      seeMore={{
        href: '/compare',
        label: 'See how habit scores compare across platforms →',
      }}
      actions={
        effectiveWave !== null ? (
          <ChartActions
            chartRef={exportRef}
            csv={{ headers: csvHeaders, rows: csvRows }}
            filenameBase={`strata-${platformSlug}-habits-w${effectiveWave}`}
            citation={{
              findingTitle: `${platformLabel} — platform habit & attitude scale (${waveLabel})`,
              variables: HABIT_ITEMS.map((i) => i.metric),
              waves: [effectiveWave],
              source: 'Understanding America Study, USC CESR',
              generatedAt: meta.generated_at,
            }}
          />
        ) : undefined
      }
    >
      {effectiveWave === null ? (
        <p className="text-sm text-slate py-6">
          No habit-scale data available for {platformLabel}. The platform
          habit and attitude scale (Waves 4–6) requires at least 30 users per
          wave.
        </p>
      ) : (
        <CompareRankedBar
          series={series}
          coloring={coloring}
          xDomain={[0, 1]}
          isZoomed={false}
          axisLabel={axisLabel}
          yAxisWidth={210}
        />
      )}
    </ReportSection>
  );
}
