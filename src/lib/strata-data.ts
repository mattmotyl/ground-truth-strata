// Client-side JSON loaders for public/data/*. Per CHART_COMPONENT_MAP.md
// the app is fully client-rendered ("No SSR data fetching"). Each loader
// caches its in-flight Promise at module scope so a second call returns
// the same Promise instead of issuing a duplicate fetch.
//
// Small files (meta / trends / distributions / platform_rates /
// conditional_breakdowns / contextual-events) are safe to load eagerly
// when a relevant route mounts. The two large files (group_comparisons,
// correlations) MUST stay lazy — only fetch them when the user actually
// activates an analysis that needs them.

'use client';

import type {
  ConditionalBreakdownRow,
  ContextualEventsJson,
  CorrelationRow,
  DistributionRow,
  GroupComparisonRow,
  MetaJson,
  PlatformDef,
  PlatformRateRow,
  TrendRow,
  VariableDef,
  WaveDef,
} from './strata-types';

const DATA_BASE = '/data';

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}/${file}`);
  if (!res.ok) {
    throw new Error(
      `Failed to load ${file}: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as T;
}

// Module-level Promise caches. Each loader is a Promise factory that
// returns the same Promise on every call — so concurrent callers share
// a single network request.

let _meta: Promise<MetaJson> | null = null;
let _trends: Promise<TrendRow[]> | null = null;
let _distributions: Promise<DistributionRow[]> | null = null;
let _platformRates: Promise<PlatformRateRow[]> | null = null;
let _conditional: Promise<ConditionalBreakdownRow[]> | null = null;
let _groupComparisons: Promise<GroupComparisonRow[]> | null = null;
let _correlations: Promise<CorrelationRow[]> | null = null;
let _contextualEvents: Promise<ContextualEventsJson> | null = null;

export function loadMeta(): Promise<MetaJson> {
  return (_meta ??= fetchJson<MetaJson>('meta.json'));
}

export function loadTrends(): Promise<TrendRow[]> {
  return (_trends ??= fetchJson<TrendRow[]>('trends.json'));
}

export function loadDistributions(): Promise<DistributionRow[]> {
  return (_distributions ??= fetchJson<DistributionRow[]>('distributions.json'));
}

export function loadPlatformRates(): Promise<PlatformRateRow[]> {
  return (_platformRates ??= fetchJson<PlatformRateRow[]>('platform_rates.json'));
}

export function loadConditionalBreakdowns(): Promise<ConditionalBreakdownRow[]> {
  return (_conditional ??= fetchJson<ConditionalBreakdownRow[]>(
    'conditional_breakdowns.json',
  ));
}

// LARGE — keep behind a user gesture.
export function loadGroupComparisons(): Promise<GroupComparisonRow[]> {
  return (_groupComparisons ??= fetchJson<GroupComparisonRow[]>(
    'group_comparisons.json',
  ));
}

// LARGE — keep behind a user gesture.
export function loadCorrelations(): Promise<CorrelationRow[]> {
  return (_correlations ??= fetchJson<CorrelationRow[]>('correlations.json'));
}

export function loadContextualEvents(): Promise<ContextualEventsJson> {
  return (_contextualEvents ??= fetchJson<ContextualEventsJson>(
    'contextual-events.json',
  ));
}

// =====================================================================
// Convenience accessors over meta.json
// =====================================================================

export async function getVariable(name: string): Promise<VariableDef | null> {
  const meta = await loadMeta();
  return meta.variables.find((v) => v.variable_name === name) ?? null;
}

export async function getVariablesByDomain(
  domain: string,
): Promise<VariableDef[]> {
  const meta = await loadMeta();
  return meta.variables.filter((v) => v.domain === domain);
}

export async function getAnalyzableVariables(): Promise<VariableDef[]> {
  // Filter to the data availability values whose rows actually exist in
  // the precomputed JSONs. The other values (external_text_files,
  // needs_runtime_expansion, missing) have no rows in trends /
  // distributions / etc., so the UI shouldn't list them in pickers.
  const meta = await loadMeta();
  return meta.variables.filter(
    (v) =>
      v.data_availability === 'in_cleaned_csv' ||
      v.data_availability === 'in_cleaned_csv_exploded',
  );
}

export async function getPlatform(slug: string): Promise<PlatformDef | null> {
  const meta = await loadMeta();
  return meta.platforms.find((p) => p.slug === slug) ?? null;
}

export async function getWave(wave: number): Promise<WaveDef | null> {
  const meta = await loadMeta();
  return meta.waves.find((w) => w.wave === wave) ?? null;
}

// Test-only: clears in-memory caches so tests can re-run loaders.
export function __resetStrataCaches(): void {
  _meta = null;
  _trends = null;
  _distributions = null;
  _platformRates = null;
  _conditional = null;
  _groupComparisons = null;
  _correlations = null;
  _contextualEvents = null;
}
