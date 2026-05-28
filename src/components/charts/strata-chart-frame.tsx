'use client';

import { type ReactNode, type RefObject } from 'react';
import { ChartActions } from './chart-actions';
import {
  NumbersMeaningBlock,
  type StatRow,
} from './numbers-meaning-block';
import { type CitationMetadata } from './citation-widget';

interface StrataChartFrameProps {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  chart: ReactNode;
  chartRef: RefObject<HTMLDivElement | null>;
  stats?: StatRow[];
  customNumbers?: ReactNode;
  interpretation: ReactNode;
  isPlaceholderInterpretation?: boolean;
  methodologyFootnote: ReactNode;
  csv: { headers: string[]; rows: unknown[][] };
  citation: CitationMetadata;
  filenameBase: string;
  // Optional left-side controls slot (e.g., variable picker, wave filter).
  controls?: ReactNode;
  // T2-5: optional survey-question (or construct) line displayed
  // above the chart so a reader knows exactly what was asked of the
  // respondent for the variable being plotted. Recommend the
  // surveyQuestionText() helper from src/lib/strata-survey.ts.
  surveyQuestion?: ReactNode;
  // Optional content rendered immediately under the chart and above
  // the Numbers block — used by Finding 01 for the "Note: X hidden"
  // message and zoom controls.
  chartFooter?: ReactNode;
  // When true, the eyebrow / title / subtitle render INSIDE the chart
  // card (per the PHASE4_UI_SPEC chart anatomy: Title / Subtitle /
  // Chart / Source Note), and the article header is suppressed. Used by
  // /compare so the whole anatomy is self-contained and PNG-exported.
  // Legacy callers omit it and keep the header-above-card layout.
  titleInCard?: boolean;
  // Optional source note rendered inside the card, beneath the chart
  // (only meaningful with titleInCard). Distinct from methodologyFootnote
  // which renders outside the card next to the action buttons.
  sourceNote?: ReactNode;
}

export function StrataChartFrame({
  eyebrow,
  title,
  subtitle,
  chart,
  chartRef,
  stats,
  customNumbers,
  interpretation,
  isPlaceholderInterpretation,
  methodologyFootnote,
  csv,
  citation,
  filenameBase,
  controls,
  surveyQuestion,
  chartFooter,
  titleInCard = false,
  sourceNote,
}: StrataChartFrameProps) {
  const titleBlock = (
    <div className="space-y-1.5">
      <p
        className="text-xs text-slate uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {eyebrow}
      </p>
      <h1
        className={
          titleInCard
            ? 'text-2xl sm:text-3xl text-plum'
            : 'text-3xl sm:text-4xl text-plum'
        }
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {title}
      </h1>
      {subtitle ? (
        <p className="text-base text-ink/80 leading-relaxed max-w-3xl">
          {subtitle}
        </p>
      ) : null}
    </div>
  );

  return (
    <article className="mx-auto max-w-6xl px-6 py-10 space-y-6">
      {!titleInCard ? <header>{titleBlock}</header> : null}

      <div
        className={`grid gap-6 items-start ${
          controls ? 'lg:grid-cols-[280px_1fr]' : ''
        }`}
      >
        {controls ? (
          <aside className="space-y-4">{controls}</aside>
        ) : null}

        <div className="space-y-4">
          <div
            ref={chartRef}
            className="rounded-md border border-mist bg-white p-4 space-y-3"
          >
            {titleInCard ? titleBlock : null}
            {surveyQuestion ? (
              <h2
                className="text-base sm:text-lg font-semibold text-ink leading-snug"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {surveyQuestion}
              </h2>
            ) : null}
            {chart}
            {sourceNote ? (
              <p
                className="text-xs text-slate leading-relaxed pt-3 border-t border-mist"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {sourceNote}
              </p>
            ) : null}
          </div>

          {chartFooter}

          <NumbersMeaningBlock
            stats={stats}
            customNumbers={customNumbers}
            interpretation={interpretation}
            isPlaceholder={isPlaceholderInterpretation}
          />

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p
              className="text-xs text-slate leading-relaxed max-w-2xl"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {methodologyFootnote}
            </p>
            <ChartActions
              chartRef={chartRef}
              csv={csv}
              filenameBase={filenameBase}
              citation={citation}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
