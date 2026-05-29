'use client';

import { getTrendsCategory, type TrendsCategory } from '@/lib/trends-categories';

// Two-step category → question picker for /trends, mirroring the
// /compare TwoStepPicker layout (Step 1 buttons left, Step 2 radio list
// expanding rightward; stacks on narrow viewports). Question labels are
// resolved by the explorer (some are derived from meta construct), so
// this component stays presentational.

interface TrendsCategoryPickerProps {
  categories: TrendsCategory[];
  activeCategory: string;
  activeQuestion: string;
  questionLabels: Record<string, string>;
  onCategoryChange: (id: string) => void;
  onQuestionChange: (key: string) => void;
}

const EYEBROW = 'text-xs text-slate uppercase tracking-wide';

export function TrendsCategoryPicker({
  categories,
  activeCategory,
  activeQuestion,
  questionLabels,
  onCategoryChange,
  onQuestionChange,
}: TrendsCategoryPickerProps) {
  const questions = getTrendsCategory(activeCategory).questions;

  return (
    <div className="border-b border-mist bg-paper">
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Fixed min-height (desktop) so the band never resizes when a
            shorter category's Step 2 list is shown — the chart below must
            not shift. The Attitudes list (tallest) scrolls within its
            max-height. */}
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-10 lg:min-h-[300px]">
          {/* Step 1 — category */}
          <div className="lg:w-[300px] lg:shrink-0 space-y-3">
            <p className={EYEBROW} style={{ fontFamily: 'var(--font-mono)' }}>
              Step 1 · Pick a category
            </p>
            <div className="flex flex-col gap-2">
              {categories.map((c) => {
                const isActive = c.id === activeCategory;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onCategoryChange(c.id)}
                    className={
                      'text-left text-sm rounded-md border px-3 py-2 transition-colors ' +
                      (isActive
                        ? 'border-plum bg-plum/5 text-plum font-medium'
                        : 'border-mist text-ink hover:border-mulberry hover:text-plum')
                    }
                    style={{
                      fontFamily: isActive ? 'var(--font-serif)' : undefined,
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2 — question (radio list, sizes to its content) */}
          <div className="space-y-3">
            <p className={EYEBROW} style={{ fontFamily: 'var(--font-mono)' }}>
              Step 2 · Pick a variable
            </p>
            <fieldset className="flex flex-col gap-1.5 text-sm max-h-[256px] overflow-y-auto pr-2">
              <legend className="sr-only">Select a variable</legend>
              {questions.map((q) => {
                const isActive = q.key === activeQuestion;
                return (
                  <label
                    key={q.key}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name={`trends-question-${activeCategory}`}
                      value={q.key}
                      checked={isActive}
                      onChange={() => onQuestionChange(q.key)}
                      className="accent-plum"
                    />
                    <span className={isActive ? 'text-ink' : 'text-slate'}>
                      {questionLabels[q.key] ?? q.key}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          </div>
        </div>
      </div>
    </div>
  );
}
