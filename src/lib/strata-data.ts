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

// "None" and "Something else" are survey response options on the
// platform-usage checklist, not platforms. Their rows must never appear
// in any chart or table — they corrupt platform-experience analyses
// (a respondent who selected "None" has no platform-specific
// experience to report, and "Something else" is uncategorized). The
// filter lives at the data layer so no downstream component can
// reintroduce them by accident.
export const EXCLUDED_PLATFORM_SLUGS: ReadonlySet<string> = new Set([
  'none',
  'something_else',
]);

// Per-variable correlation-table tokens that mirror the excluded
// platform slugs. correlations.json uses variables like
// `platform_user_none` and `time_per_day_minutes_something_else`,
// so the slug-tail match below catches both prefixes.
function isExcludedCorrelationVar(name: string): boolean {
  for (const slug of EXCLUDED_PLATFORM_SLUGS) {
    if (name === slug || name.endsWith(`_${slug}`)) return true;
  }
  return false;
}

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
let _questionTexts: Promise<QuestionTextsJson> | null = null;

// Question-text dictionary served from public/data/question-texts.json,
// generated from docs/data-dictionary.csv by scripts/build-question-texts.mjs.
// Lets the UI display the verbatim survey question above each chart.
export interface QuestionTextEntry {
  question_text: string;
  construct: string | null;
  clean_variable_name: string | null;
  is_platform_indexed: boolean;
}

export interface QuestionTextsJson {
  generated_at: string;
  variables: Record<string, QuestionTextEntry>;
}

export function loadMeta(): Promise<MetaJson> {
  return (_meta ??= fetchJson<MetaJson>('meta.json').then((meta) => ({
    ...meta,
    platforms: meta.platforms.filter(
      (p) => !EXCLUDED_PLATFORM_SLUGS.has(p.slug),
    ),
  })));
}

export function loadTrends(): Promise<TrendRow[]> {
  return (_trends ??= fetchJson<TrendRow[]>('trends.json'));
}

export function loadDistributions(): Promise<DistributionRow[]> {
  return (_distributions ??= fetchJson<DistributionRow[]>('distributions.json'));
}

export function loadPlatformRates(): Promise<PlatformRateRow[]> {
  return (_platformRates ??= fetchJson<PlatformRateRow[]>(
    'platform_rates.json',
  ).then((rows) =>
    rows.filter((r) => !EXCLUDED_PLATFORM_SLUGS.has(r.platform_slug)),
  ));
}

export function loadConditionalBreakdowns(): Promise<ConditionalBreakdownRow[]> {
  return (_conditional ??= fetchJson<ConditionalBreakdownRow[]>(
    'conditional_breakdowns.json',
  ).then((rows) =>
    rows.filter((r) => !EXCLUDED_PLATFORM_SLUGS.has(r.platform_slug)),
  ));
}

// LARGE — keep behind a user gesture.
export function loadGroupComparisons(): Promise<GroupComparisonRow[]> {
  return (_groupComparisons ??= fetchJson<GroupComparisonRow[]>(
    'group_comparisons.json',
  ).then((rows) =>
    rows.filter(
      (r) =>
        r.platform_slug === null ||
        !EXCLUDED_PLATFORM_SLUGS.has(r.platform_slug),
    ),
  ));
}

// LARGE — keep behind a user gesture.
export function loadCorrelations(): Promise<CorrelationRow[]> {
  return (_correlations ??= fetchJson<CorrelationRow[]>(
    'correlations.json',
  ).then((rows) =>
    rows.filter(
      (r) =>
        !isExcludedCorrelationVar(r.var1) &&
        !isExcludedCorrelationVar(r.var2),
    ),
  ));
}

export function loadContextualEvents(): Promise<ContextualEventsJson> {
  return (_contextualEvents ??= fetchJson<ContextualEventsJson>(
    'contextual-events.json',
  ));
}

export function loadQuestionTexts(): Promise<QuestionTextsJson> {
  return (_questionTexts ??= fetchJson<QuestionTextsJson>(
    'question-texts.json',
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
  _questionTexts = null;
}
