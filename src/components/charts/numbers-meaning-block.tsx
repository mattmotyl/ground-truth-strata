'use client';

import type { ReactNode } from 'react';

// Provisional-copy disclaimer. Interpretation prose is Matt-authored and not
// yet finalized; until a box's `isPlaceholder` flag is cleared we flag it two
// ways (top strip + faint diagonal watermark) so viewers heed the caution.
const WIP_DISCLAIMER =
  'Work in progress — interpretation is provisional; confirm all claims against the data.';

export interface StatRow {
  key: string;
  label: string;
  value: ReactNode;
  // Optional secondary text shown beneath the value, e.g., n + CI.
  sub?: ReactNode;
  // Optional swatch color (for ranked lists where each row has a series
  // color matching the chart).
  swatch?: string;
}

interface NumbersMeaningBlockProps {
  // Use either `stats` (the default ranked-list layout) or
  // `customNumbers` (any ReactNode — e.g. a per-finding table).
  // If `customNumbers` is provided, `stats` is ignored.
  stats?: StatRow[];
  customNumbers?: ReactNode;
  interpretation: ReactNode;
  // Marks the interpretation as awaiting Matt's review. Renders a badge
  // next to "What the numbers mean" so chart copy that hasn't been
  // hand-edited is visually obvious.
  isPlaceholder?: boolean;
}

export function NumbersMeaningBlock({
  stats,
  customNumbers,
  interpretation,
  isPlaceholder = false,
}: NumbersMeaningBlockProps) {
  // When customNumbers is provided (e.g. Finding 01's platform x wave
  // table) the data view is too wide for a 50/50 column split — stack
  // Numbers above Meaning so each gets the full panel width. The
  // default stats-list layout keeps the side-by-side grid.
  const stacked = !!customNumbers;
  const containerClasses = stacked
    ? 'gap-px bg-mist border border-mist rounded-md overflow-hidden flex flex-col'
    : 'grid gap-px bg-mist border border-mist rounded-md overflow-hidden md:grid-cols-2';
  return (
    <div className={containerClasses}>
      <div
        className="bg-mist/50 p-5 space-y-3"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <p className="text-xs text-slate uppercase tracking-wide">
          The numbers
        </p>
        {customNumbers ? (
          customNumbers
        ) : (
          <ul className="space-y-2 text-sm">
            {(stats ?? []).map((s) => (
              <li key={s.key} className="flex items-baseline gap-2">
                {s.swatch ? (
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-sm shrink-0 mt-1"
                    style={{ backgroundColor: s.swatch }}
                  />
                ) : null}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="text-ink/85">{s.label}</span>
                    <span className="font-medium text-ink">{s.value}</span>
                  </div>
                  {s.sub ? (
                    <div className="text-xs text-slate">{s.sub}</div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative overflow-hidden bg-white flex flex-col">
        {isPlaceholder ? (
          <>
            {/* Faint diagonal watermark behind the interpretation text.
             * Centered (not clipped via overflow) so it survives the
             * overflow:visible PNG-export pass. Decorative only. */}
            <div
              aria-hidden
              className="pointer-events-none select-none absolute inset-0 z-0 flex items-center justify-center"
            >
              <span
                className="whitespace-nowrap font-black uppercase tracking-[0.3em] text-2xl sm:text-4xl text-mulberry/[0.25] -rotate-[18deg]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                Work in progress
              </span>
            </div>
            {/* Full-width caution strip flush with the column edges. */}
            <div
              className="relative z-10 flex items-start gap-2 border-b border-amber-300/70 bg-amber-50 px-5 py-2 text-amber-900"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <span aria-hidden className="leading-none">
                ⚠
              </span>
              <span className="text-[11px] uppercase tracking-wide leading-snug">
                {WIP_DISCLAIMER}
              </span>
            </div>
          </>
        ) : null}
        <div className="relative z-10 p-5 space-y-3">
          <p
            className="text-xs text-slate uppercase tracking-wide"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            What the numbers mean
          </p>
          <div className="text-base text-ink leading-relaxed">
            {interpretation}
          </div>
        </div>
      </div>
    </div>
  );
}
