'use client';

import { useEffect, useState } from 'react';
import {
  loadGroupComparisons,
  type QuestionTextsJson,
} from '@/lib/strata-data';
import type {
  ContextualEventsJson,
  GroupComparisonRow,
  LikertBucket,
  MetaJson,
} from '@/lib/strata-types';
import {
  bandValueLabel,
  buildOutcomeRateRows,
} from '@/lib/trends-adapters';
import {
  formatSurveyQuestion,
  surveyQuestionFor,
} from '@/lib/strata-survey';
import { PlatformFanChart } from './trends-variable-trend';

// Well-Being category renderer (T3-B7). Respondent wellbeing outcomes
// split by platform use: one line per platform among that platform's
// USERS. Sourced from group_comparisons.json (platform_user_* / User
// rows), reshaped to PlatformRateRow so it reuses PlatformFanChart.
// ls002 items plot the "agree" band (% agree); ex003_lonely is a binary
// rate (% lonely).

interface WellbeingPlatformTrendProps {
  meta: MetaJson;
  questionTexts: QuestionTextsJson | null;
  events: ContextualEventsJson | null;
  outcome: string;
  bucket: LikertBucket | null;
  title: string;
  subtitle?: string;
  filenameBase: string;
}

export function WellbeingPlatformTrend({
  meta,
  questionTexts,
  events,
  outcome,
  bucket,
  title,
  subtitle,
  filenameBase,
}: WellbeingPlatformTrendProps) {
  const [groupRows, setGroupRows] = useState<GroupComparisonRow[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    loadGroupComparisons()
      .then((rows) => active && setGroupRows(rows))
      .catch((e) => active && setError(e));
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load wellbeing data: {error.message}</p>
      </div>
    );
  }
  if (!groupRows) {
    return (
      <div
        className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Loading wellbeing data…
      </div>
    );
  }

  const rows = buildOutcomeRateRows(groupRows, outcome, bucket, meta);
  const waves = [...new Set(rows.map((r) => r.wave))].sort((a, b) => a - b);
  // Value framing for copy: binary loneliness vs. the Likert agree band
  // (relabeled for the reverse-coded ls002i).
  const valueLabel =
    bucket === null ? '% who are lonely' : bandValueLabel(outcome, 'agree');
  const isReverse = outcome === 'ls002i';

  const subtitleText =
    subtitle ??
    formatSurveyQuestion(surveyQuestionFor(outcome, questionTexts, meta));

  const waveRange = waves.length
    ? `Waves ${Math.min(...waves)}–${Math.max(...waves)}`
    : '—';
  const reverseClause = isReverse
    ? ' This item is reverse-coded; the lines show the share who do NOT feel negative (the agree band, post-reversal).'
    : '';
  const sourceNote =
    `Source: UAS panel ${waveRange}. Weighted estimates among each ` +
    `platform’s users (conditional on platform use), shown as ${valueLabel}.` +
    `${reverseClause} 95% CIs available on hover. Cells with n < 30 are ` +
    `suppressed by design.`;

  const interpretation = `[WORK IN PROGRESS] ${title} over time, split by platform. Each line is ${valueLabel} among that platform's users, wave by wave; the table and tooltip carry the 95% CIs and user counts. Estimates are conditional on platform use.${reverseClause}`;

  return (
    <PlatformFanChart
      meta={meta}
      rows={rows}
      events={events}
      eyebrow="Trends over time · Well-Being"
      title={title}
      subtitle={subtitleText || undefined}
      sourceNote={sourceNote}
      interpretation={interpretation}
      filenameBase={filenameBase}
      citationVariables={[outcome]}
    />
  );
}
