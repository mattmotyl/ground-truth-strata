'use client';

import { useState } from 'react';
import { CorrelationPairExplorer } from './correlation-pair-explorer';
import { CorrelationHeatmap } from './correlation-heatmap';
import type { ResolvedExploreState } from '@/lib/explore-url-state';
// DISABLED v0.1 — platform-minutes predictor unvalidated, restore post-precompute
// import { FindingUsageWellbeing } from './finding-usage-wellbeing';

// /explore view switcher. Two respondent-level correlation views, each
// backed by correlations.json:
//   • Variable pairs over time — any two respondent-level variables, ρ per wave.
//   • Correlation matrix — all pairwise ρ among respondent-level vars.
// The Platform correlations view (FindingUsageWellbeing, Finding 08) is
// disabled in v0.1 — its time-per-day predictor is unvalidated; restore
// once the per-platform correlations are precomputed. See comments below.
// Button-based switcher (not the base-ui Tabs primitive) to match the
// app's existing button-picker convention on /trends and /compare.

type ExploreView = 'pairs' | 'matrix';

const VIEWS: Array<{ id: ExploreView; label: string }> = [
  // DISABLED v0.1 — platform-minutes predictor unvalidated, restore post-precompute
  // { id: 'platforms', label: 'Platform correlations' },
  { id: 'pairs', label: 'Variable pairs over time' },
  { id: 'matrix', label: 'Correlation matrix' },
];

// `initial` is the share-link state decoded server-side in explore/page.tsx
// (tab + each view's slice). The mounted sub-view owns the URL writeback
// (see useUrlSync in each); ExploreViews only seeds the active view and
// hands each sub-view its slice.
export function ExploreViews({
  initial,
}: { initial?: ResolvedExploreState } = {}) {
  const [view, setView] = useState<ExploreView>(initial?.tab ?? 'pairs');

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

      {/* DISABLED v0.1 — platform-minutes predictor unvalidated, restore post-precompute */}
      {/* {view === 'platforms' ? <FindingUsageWellbeing /> : null} */}
      {view === 'pairs' ? (
        <CorrelationPairExplorer
          initialPredictor={initial?.predictor}
          initialOutcome={initial?.outcome}
        />
      ) : null}
      {view === 'matrix' ? (
        <CorrelationHeatmap
          initialWave={initial?.wave}
          initialSelected={initial?.vars}
        />
      ) : null}
    </div>
  );
}
