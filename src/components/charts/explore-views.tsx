'use client';

import { useState } from 'react';
import { FindingUsageWellbeing } from './finding-usage-wellbeing';
import { CorrelationPairExplorer } from './correlation-pair-explorer';
import { CorrelationHeatmap } from './correlation-heatmap';

// /explore view switcher. Three genuinely different correlation views,
// each backed by correlations.json:
//   • Platform correlations — Finding 08, platform-indexed predictor
//     (time-per-day) vs a wellbeing outcome, one bar per platform.
//   • Variable pairs — any two respondent-level variables, ρ per wave.
//   • Correlation matrix — all pairwise ρ among respondent-level vars.
// Button-based switcher (not the base-ui Tabs primitive) to match the
// app's existing button-picker convention on /trends and /compare.

type ExploreView = 'platforms' | 'pairs' | 'matrix';

const VIEWS: Array<{ id: ExploreView; label: string }> = [
  { id: 'platforms', label: 'Platform correlations' },
  { id: 'pairs', label: 'Variable pairs' },
  { id: 'matrix', label: 'Correlation matrix' },
];

export function ExploreViews() {
  const [view, setView] = useState<ExploreView>('platforms');

  return (
    <div className="space-y-2">
      <div
        role="tablist"
        aria-label="Correlation views"
        className="mx-auto max-w-6xl px-6 pt-8 flex flex-wrap gap-2"
      >
        {VIEWS.map((v) => {
          const active = v.id === view;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(v.id)}
              className={
                'text-sm rounded-md border px-3 py-1.5 transition-colors ' +
                (active
                  ? 'border-plum bg-plum/5 text-plum font-medium'
                  : 'border-mist text-ink hover:border-mulberry hover:text-plum')
              }
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {view === 'platforms' ? <FindingUsageWellbeing /> : null}
      {view === 'pairs' ? <CorrelationPairExplorer /> : null}
      {view === 'matrix' ? <CorrelationHeatmap /> : null}
    </div>
  );
}
