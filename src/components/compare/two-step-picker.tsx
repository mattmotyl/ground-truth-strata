'use client';

import { type ReactNode } from 'react';
import { getTheme, type CompareTheme, type ThemeId } from '@/lib/compare-themes';

// Step 1 (theme) + Step 2 (question) picker for /compare.
//
// Layout: Step 1 theme buttons in the left column, Step 2 radio list to
// their right. The picker band sizes to the taller of the two columns
// for the current theme — no fixed min-height (an earlier reserved
// height left a large empty gap above the chart for short question
// lists). On narrow viewports the two steps stack (Step 2 below Step 1).
//
// Themes flagged `available: false` (C and D until Part 2) render as
// disabled buttons with a "soon" hint so the full theme set is visible.

interface TwoStepPickerProps {
  themes: CompareTheme[];
  activeTheme: ThemeId;
  activeQuestion: string;
  onThemeChange: (id: ThemeId) => void;
  onQuestionChange: (key: string) => void;
  // Optional third column (rightward expansion) — used by Theme A for
  // the drill-down buttons. Rendered only when provided, so themes
  // without follow-ups leave no empty space.
  extra?: ReactNode;
}

const EYEBROW =
  'text-xs text-slate uppercase tracking-wide';

export function TwoStepPicker({
  themes,
  activeTheme,
  activeQuestion,
  onThemeChange,
  onQuestionChange,
  extra,
}: TwoStepPickerProps) {
  const questions = getTheme(activeTheme).questions;

  return (
    <div className="border-b border-mist bg-paper">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
          {/* Step 1 — themes */}
          <div className="lg:w-[300px] lg:shrink-0 space-y-3">
            <p className={EYEBROW} style={{ fontFamily: 'var(--font-mono)' }}>
              Step 1 · Pick a theme
            </p>
            <div className="flex flex-col gap-2">
              {themes.map((t) => {
                const isActive = t.id === activeTheme;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!t.available}
                    aria-pressed={isActive}
                    onClick={() => t.available && onThemeChange(t.id)}
                    className={
                      'text-left text-sm rounded-md border px-3 py-2 transition-colors ' +
                      (isActive
                        ? 'border-plum bg-plum/5 text-plum font-medium'
                        : t.available
                          ? 'border-mist text-ink hover:border-mulberry hover:text-plum'
                          : 'border-mist text-slate/60 cursor-not-allowed')
                    }
                    style={{
                      fontFamily: isActive
                        ? 'var(--font-serif)'
                        : undefined,
                    }}
                  >
                    {t.label}
                    {!t.available ? (
                      <span
                        className="ml-2 text-[10px] uppercase tracking-wider text-slate/70"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        soon
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2 + Step 3 grouped tightly so the Drill Into column
              sits immediately beside Step 2 (no wide gap). Step 2 sizes
              to its list — not flex-1. */}
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            <div className="space-y-3">
              <p
                className={EYEBROW}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                Step 2 · Pick a question
              </p>
              {questions.length === 0 ? (
                <p className="text-sm text-slate italic">
                  This theme arrives in the next build.
                </p>
              ) : (
                <fieldset className="flex flex-col gap-1.5 text-sm">
                  <legend className="sr-only">Select a question</legend>
                  {questions.map((q) => {
                    const isActive = q.key === activeQuestion;
                    return (
                      <label
                        key={q.key}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name={`compare-question-${activeTheme}`}
                          value={q.key}
                          checked={isActive}
                          onChange={() => onQuestionChange(q.key)}
                          className="accent-plum"
                        />
                        <span
                          className={isActive ? 'text-ink' : 'text-slate'}
                        >
                          {q.label}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              )}
            </div>

            {/* Step 3 (optional) — Theme A drill buttons, adjacent to
                Step 2. Absent entirely when no follow-ups apply. */}
            {extra ? <div className="space-y-3">{extra}</div> : null}
          </div>

          {/* Decorative illustration — fills the empty space on the
              right of the picker band. Always shown while the band is
              open; unaffected by drill-down state. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/compare-illustration.webp"
            alt=""
            aria-hidden
            className="hidden lg:block lg:ml-auto lg:self-center shrink-0"
            style={{ width: 180, opacity: 0.7 }}
          />
        </div>
      </div>
    </div>
  );
}
