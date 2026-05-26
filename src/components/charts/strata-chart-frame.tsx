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
  stats: StatRow[];
  interpretation: ReactNode;
  isPlaceholderInterpretation?: boolean;
  methodologyFootnote: ReactNode;
  csv: { headers: string[]; rows: unknown[][] };
  citation: CitationMetadata;
  filenameBase: string;
  // Optional left-side controls slot (e.g., variable picker, wave filter).
  controls?: ReactNode;
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
  interpretation,
  isPlaceholderInterpretation,
  methodologyFootnote,
  csv,
  citation,
  filenameBase,
  controls,
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
            className="rounded-md border border-mist bg-white p-4"
          >
            {chart}
          </div>

          <NumbersMeaningBlock
            stats={stats}
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
