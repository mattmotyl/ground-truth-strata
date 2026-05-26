// TypeScript shapes of the 8 precomputed JSON files under public/data/.
// Mirrors the schemas documented in PHASE4_HANDOFF.md — keep in sync if
// r/precompute/build_*.R adds/removes/renames any field. Suppression
// convention: when `suppressed: true`, all stat fields (value / mean /
// prop / r / se / ci_lower / ci_upper / n / weighted_*) are `null`.

// =====================================================================
// meta.json
// =====================================================================

export interface MetaJson {
  generated_at: string;
  _meta: MetaInfo;
  waves: WaveDef[];
  platforms: PlatformDef[];
  variables: VariableDef[];
}

export interface MetaInfo {
  generated_by: string;
  source_data: string;
  source_dictionary: string;
  presence_rule: string;
  cell_floor: number;
  suppression_policy: string;
  data_availability_legend: Record<DataAvailability, string>;
}

export interface WaveDef {
  wave: number;
  uas_num: number;
  dates: string;
  targeted_n: number;
  completed_n: number;
  n_in_cleaned: number;
}

export interface PlatformDef {
  code: number;
  slug: string;
  label: string;
}

export type DataAvailability =
  | 'in_cleaned_csv'
  | 'in_cleaned_csv_exploded'
  | 'external_text_files'
  | 'needs_runtime_expansion'
  | 'missing';

export interface VariableDef {
  variable_name: string;
  clean_variable_name: string | null;
  cleaned_column: string | null;
  expansion_columns: string[] | null;
  aggregation_note: string | null;
  construct: string;
  domain: string;
  response_type: string;
  response_options: Record<string, string> | null;
  is_platform_indexed: boolean;
  dict_is_platform_indexed: boolean;
  platform_codes_applicable: number[] | null;
  is_reverse_coded: boolean;
  out_of_range_codes: number[] | null;
  waves_present_in_dict: number[];
  waves_present_in_data: number[];
  data_availability: DataAvailability;
  presence_discrepancy: string | null;
}

// =====================================================================
// trends.json
// =====================================================================

interface TrendRowBase {
  variable_name: string;
  wave: number;
  n: number | null;
  se: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  weighted_se: number | null;
  weighted_ci_lower: number | null;
  weighted_ci_upper: number | null;
  weighted_n_eff: number | null;
  suppressed: boolean;
}

export interface TrendMeanRow extends TrendRowBase {
  metric_type: 'mean';
  mean: number | null;
  weighted_mean: number | null;
}

export interface TrendRateRow extends TrendRowBase {
  metric_type: 'rate';
  prop: number | null;
  weighted_prop: number | null;
}

export type TrendRow = TrendMeanRow | TrendRateRow;

// =====================================================================
// distributions.json
// =====================================================================

export type DistributionMetricType =
  | 'likert_option'
  | 'scale_int_bin'
  | 'count_bin';

export interface DistributionRow {
  variable_name: string;
  wave: number;
  bin_index: number;
  bin_label: string;
  metric_type: DistributionMetricType;
  value: number | null;
  se: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  n: number | null;
  weighted_value: number | null;
  weighted_se: number | null;
  weighted_ci_lower: number | null;
  weighted_ci_upper: number | null;
  weighted_n_eff: number | null;
  suppressed: boolean;
}

// =====================================================================
// platform_rates.json
// =====================================================================

export type PlatformRateMetric =
  | 'usage_rate'
  | 'frequency_mean'
  | 'nux_rate'
  | 'bftw_rate'
  | 'mcxn_rate'
  | 'useful_rate'
  | 'time_per_day_minutes';

export type PlatformRateMetricType = 'rate' | 'mean';

export interface PlatformRateRow {
  platform_slug: string;
  platform_code: number;
  platform_label: string;
  wave: number;
  metric: PlatformRateMetric;
  metric_type: PlatformRateMetricType;
  source_variable: string;
  value: number | null;
  se: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  n: number | null;
  weighted_value: number | null;
  weighted_se: number | null;
  weighted_ci_lower: number | null;
  weighted_ci_upper: number | null;
  weighted_n_eff: number | null;
  suppressed: boolean;
}

// =====================================================================
// conditional_breakdowns.json
// =====================================================================

export type ConditionalConstruct =
  | 'nuximpact'
  | 'nuxtopic'
  | 'bftwimpact'
  | 'bftwtopic'
  | 'mcxntopic'
  | 'usefultopic';

export interface ConditionalBreakdownRow {
  construct: ConditionalConstruct;
  child_variable: string;
  parent_variable: string;
  parent_clean: string;
  platform_slug: string;
  platform_label: string;
  wave: number;
  option_index: number;
  option_label: string;
  value: number | null;
  se: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  n: number | null;
  weighted_value: number | null;
  weighted_se: number | null;
  weighted_ci_lower: number | null;
  weighted_ci_upper: number | null;
  weighted_n_eff: number | null;
  suppressed: boolean;
}

// =====================================================================
// group_comparisons.json
// =====================================================================

export type GroupComparisonMetricType = 'rate' | 'mean';

export interface GroupComparisonRow {
  outcome: string;
  platform_slug: string | null;
  grouping_var: string;
  group: string;
  wave: number;
  metric_type: GroupComparisonMetricType;
  value: number | null;
  se: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  n: number | null;
  weighted_value: number | null;
  weighted_se: number | null;
  weighted_ci_lower: number | null;
  weighted_ci_upper: number | null;
  weighted_n_eff: number | null;
  suppressed: boolean;
}

// =====================================================================
// correlations.json
// =====================================================================

export interface CorrelationRow {
  var1: string;
  var2: string;
  wave: number;
  method: 'spearman';
  r: number | null;
  p_value: number | null;
  n: number | null;
  weighted_r: number | null;
  weighted_n_eff: number | null;
  suppressed: boolean;
}

// =====================================================================
// contextual-events.json
// =====================================================================

export interface ContextualEventsJson {
  _meta: ContextualEventsMeta;
  event_annotations: EventAnnotation[];
  external_benchmarks: ExternalBenchmark[];
  category_definitions: Record<string, string>;
}

export interface ContextualEventsMeta {
  description: string;
  purpose: string;
  note_on_benchmarks: string;
  last_updated: string;
  survey_date_ranges: Record<string, SurveyDateRange>;
}

export interface SurveyDateRange {
  uas: string;
  start: string;
  end: string;
  label: string;
}

export interface EventAnnotation {
  id: string;
  date: string;
  label: string;
  short_label: string;
  category: string;
  platforms: string[];
  description: string;
  relevance: string;
  source: string;
  source_url: string;
}

export interface ExternalBenchmark {
  id: string;
  metric: string;
  value: number;
  value_label: string;
  date_range: string;
  source: string;
  source_url: string;
  comparability_note: string;
  use_in_strata: boolean;
  use_note?: string;
}

// =====================================================================
// Shared aliases
// =====================================================================

// Statistic fields are nullable on every row regardless of file. Suppressed
// rows have ALL of them null; non-suppressed rows have them as numbers.
// This helper narrows a row by its suppressed flag.
export type NotSuppressed<T extends { suppressed: boolean }> = T & {
  suppressed: false;
};
