'use client';

import { type ReactNode, type RefObject } from 'react';
import { ChartActions } from './chart-actions';
import {
  NumbersMeaningBlock,
  type StatRow,
} from './numbers-meaning-block';
import { WeightedToggle, type Weighting } from './weighted-toggle';
import { type CitationMetadata } from './citation-widget';

interface StrataChartFrameProps {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  weighting: Weighting;
  onWeightingChange: (next: Weighting) => void;
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
}

export function StrataChartFrame({
  eyebrow,
  title,
  subtitle,
  weighting,
  onWeightingChange,
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
}: StrataChartFrameProps) {
  return (
    <article className="mx-auto max-w-6xl px-6 py-10 space-y-6">
      <header className="space-y-2">
        <p
          className="text-xs text-slate uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {eyebrow}
        </p>
        <h1
          className="text-3xl sm:text-4xl text-plum"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="text-base text-ink/80 leading-relaxed max-w-3xl">
            {subtitle}
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr] items-start">
        <aside className="space-y-4">
          {controls}
          <div className="space-y-2">
            <p
              className="text-xs text-slate uppercase tracking-wide"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Weighting
            </p>
            <WeightedToggle
              value={weighting}
              onChange={onWeightingChange}
            />
            <p className="text-xs text-slate leading-relaxed">
              Weighted estimates use the UAS panel weights and generalize
              to U.S. adults. Unweighted describes the panel itself.
            </p>
          </div>
        </aside>

        <div className="space-y-4">
          <div
            ref={chartRef}
            className="rounded-md border border-mist bg-white p-4 space-y-3"
          >
            {surveyQuestion ? (
              <h2
                className="text-base sm:text-lg font-semibold text-ink leading-snug"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {surveyQuestion}
              </h2>
            ) : null}
            {chart}
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
