'use client';

import { getTheme, type CompareTheme, type ThemeId } from '@/lib/compare-themes';

// Step 1 (theme) + Step 2 (question) picker for /compare.
//
// Layout: Step 1 theme buttons in the left column, Step 2 radio list to
// their right. The Step-2 area reserves a min-height sized to the
// tallest theme (7 questions) so switching themes never shifts the chart
// below — per the spec's "content below the picker does not shift" rule.
// On narrow viewports the two steps stack (Step 2 below Step 1).
//
// Themes flagged `available: false` (C and D until Part 2) render as
// disabled buttons with a "soon" hint so the full theme set is visible.

interface TwoStepPickerProps {
  themes: CompareTheme[];
  activeTheme: ThemeId;
  activeQuestion: string;
  onThemeChange: (id: ThemeId) => void;
  onQuestionChange: (key: string) => void;
}

const EYEBROW =
  'text-xs text-slate uppercase tracking-wide';

export function TwoStepPicker({
  themes,
  activeTheme,
  activeQuestion,
  onThemeChange,
  onQuestionChange,
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

          {/* Step 2 — questions (reserved min-height prevents shift) */}
          <div className="flex-1 space-y-3 lg:min-h-[18rem]">
            <p className={EYEBROW} style={{ fontFamily: 'var(--font-mono)' }}>
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
                      <span className={isActive ? 'text-ink' : 'text-slate'}>
                        {q.label}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
