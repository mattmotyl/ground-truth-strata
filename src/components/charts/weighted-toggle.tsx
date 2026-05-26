'use client';

import { cn } from '@/lib/utils';

export type Weighting = 'weighted' | 'unweighted';

interface WeightedToggleProps {
  value: Weighting;
  onChange: (next: Weighting) => void;
  className?: string;
}

const OPTIONS: { value: Weighting; label: string; hint: string }[] = [
  {
    value: 'weighted',
    label: 'Weighted',
    hint: 'Population-generalizable estimates (UAS panel weights)',
  },
  {
    value: 'unweighted',
    label: 'Unweighted',
    hint: 'Sample-only estimates (panel respondents as observed)',
  },
];

export function WeightedToggle({
  value,
  onChange,
  className,
}: WeightedToggleProps) {
  return (
    <fieldset
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-mist bg-paper p-1',
        className,
      )}
    >
      <legend className="sr-only">Weighting</legend>
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            title={opt.hint}
            className={cn(
              'px-3 py-1 rounded text-sm transition-colors',
              active
                ? 'bg-plum text-paper font-medium'
                : 'text-slate hover:text-plum',
            )}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {opt.label}
          </button>
        );
      })}
    </fieldset>
  );
}
