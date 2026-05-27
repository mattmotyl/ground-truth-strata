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
  // Step 1 (output exclusions) — present on all variables after the
  // 2026-05 exclusions pass. `excluded_from_outputs` is true on
  // variables that downstream build scripts skip; the reason carries
  // the matching rule (var-list / domain=X / suffix=Y / type=Z).
  excluded_from_outputs?: boolean;
  exclusion_reason?: string | null;
  // Step D (derived variables) — present only on synthetic records
  // for variables computed at data-load time by transforms.R
  // (currently just ex003_lonely). Dict-sourced variables lack
  // these fields; treat missing as is_derived === false.
  is_derived?: boolean;
  question_text?: string | null;
}

// =====================================================================
// Bucket row discriminant — how to tell bucket rows apart from
// continuous rows in trends / platform_rates / group_comparisons.
//
// Continuous rows have `metric_type === 'mean'` or `metric_type ===
// 'rate'` and DO NOT have a `bucket` field set (it's absent or null).
//
// Bucket rows always have `metric_type === 'rate'` (they emit a
// weighted proportion of respondents in this Likert-band) AND have a
// non-null `bucket` field set to one of "disagree" / "neutral" /
// "agree". The bucket field is the SOLE reliable discriminant:
// `metric_type === 'rate'` alone is NOT sufficient because regular
// rate rows (e.g. trends.json BINARY_YESNO outcomes) also use 'rate'.
//
// Bucket rows uniformly use `weighted_value` for the share-in-bucket
// estimate — unlike continuous rate rows in trends.json which use
// `weighted_prop`, and continuous mean rows which use `weighted_mean`.
// PlatformRateRow and GroupComparisonRow already use `weighted_value`
// for their continuous rows, so the only difference there is the
// presence of the bucket fields.
// =====================================================================

export type LikertBucket = 'disagree' | 'neutral' | 'agree';

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

// Bucket variant — emitted alongside the continuous row for variables
// in BUCKETED_VARS (the ls002a-l set in trends). Does NOT extend
// TrendRowBase because the field shape differs: `weighted_value`
// replaces `weighted_prop` / `weighted_mean`, and the stale
// unweighted point-estimate fields (se / ci_lower / ci_upper / prop /
// mean) are not emitted for bucket rows.
export interface TrendBucketRow {
  variable_name: string;
  wave: number;
  metric_type: 'rate';
  bucket: LikertBucket;
  bucket_label: string;
  n: number | null;
  weighted_value: number | null;
  weighted_se: number | null;
  weighted_ci_lower: number | null;
  weighted_ci_upper: number | null;
  weighted_n_eff: number | null;
  suppressed: boolean;
}

export type TrendRow = TrendMeanRow | TrendRateRow | TrendBucketRow;

// Narrow a TrendRow to a TrendBucketRow. Sufficient because `bucket`
// is only ever set on TrendBucketRow; continuous variants lack the
// field entirely.
export function isTrendBucketRow(row: TrendRow): row is TrendBucketRow {
  return 'bucket' in row && (row as TrendBucketRow).bucket != null;
}

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
  | 'time_per_day_minutes'
  | 'us018a_mean'
  | 'us018b_mean'
  | 'us018c_mean'
  | 'us018d_mean'
  | 'us018e_mean'
  | 'us018f_mean'
  | 'us018g_mean';

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
  // Bucket fields — present on bucket rows for metrics whose
  // source_variable is in BUCKETED_VARS (currently us018a-g). Absent
  // / null on continuous mean and rate rows. See the bucket-row
  // discriminant docstring at the top of this file.
  bucket?: LikertBucket | null;
  bucket_label?: string | null;
}

// Narrowed bucket-row view of a PlatformRateRow. Same shape with the
// two bucket fields promoted to required.
export interface PlatformRateBucketRow extends PlatformRateRow {
  bucket: LikertBucket;
  bucket_label: string;
}

export function isPlatformRateBucketRow(
  row: PlatformRateRow,
): row is PlatformRateBucketRow {
  return row.bucket != null;
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
  // Bucket fields — present on bucket rows for outcomes in
  // BUCKETED_VARS (currently ls002a-l only; us018a-g are
  // platform-indexed and never reach this file). See the bucket-row
  // discriminant docstring at the top of this file.
  bucket?: LikertBucket | null;
  bucket_label?: string | null;
}

// Narrowed bucket-row view of a GroupComparisonRow.
export interface GroupComparisonBucketRow extends GroupComparisonRow {
  bucket: LikertBucket;
  bucket_label: string;
}

export function isGroupComparisonBucketRow(
  row: GroupComparisonRow,
): row is GroupComparisonBucketRow {
  return row.bucket != null;
}

// =====================================================================
// platform_group_comparisons.json
// =====================================================================

// Per (outcome × platform × wave × grouping_var × group) weighted
// estimates for platform-indexed outcomes broken out by respondent
// demographic. Outcomes in scope:
//   - us019_time_min (mean minutes per day, W4-W5)
//   - us003 (negative experience rate, W1-W6)
//   - us007 (bad-for-the-world experience rate, W1-W6)
//   - us010 (meaningful connection rate, W1-W6)
//   - us012 (learned something useful rate, W1-W6)
//
// IMPORTANT: every row in this file is CONDITIONAL ON PLATFORM USE.
// The four experience items are shown only to platform users by survey
// skip logic, so non-users have NA in the underlying per-platform wide
// columns and are dropped by the weighted estimator. Time-per-day is
// likewise only asked of users. Denominators are platform users in the
// named demographic group, NOT all respondents in that group.
// Interpret weighted_value as "of this platform's users in this
// demographic group, weighted % who report X" (rate rows) or "weighted
// mean minutes per day among users in this demographic group" (mean
// rows). Surface this caveat in UI copy — same convention as
// conditional_breakdowns.json.
//
// Schema notes:
//   - platform_slug is REQUIRED (never null) — narrower than
//     GroupComparisonRow's nullable platform_slug.
//   - Weighted point estimates only (no value/se/ci_lower/ci_upper).
//     This file post-dates Step 2's unweighted strip, so unlike
//     GroupComparisonRow the stale unweighted fields are not present
//     in the JSON at all.
//   - grouping_var is restricted to base demographics (gender, age,
//     education, race, pol_incl_leaners, political_ideology_group).
//     platform_user_* cuts are intentionally excluded.
//   - No bucket rows. The four experience vars are binary and
//     us019_time_min is continuous; neither is in BUCKETED_VARS.
export interface PlatformGroupComparisonRow {
  outcome: string;
  platform_slug: string;
  grouping_var: string;
  group: string;
  wave: number;
  metric_type: GroupComparisonMetricType;
  n: number | null;
  weighted_value: number | null;
  weighted_se: number | null;
  weighted_ci_lower: number | null;
  weighted_ci_upper: number | null;
  weighted_n_eff: number | null;
  suppressed: boolean;
}

// =====================================================================
// platform_demographics.json
// =====================================================================

// Per (platform × wave × grouping_var × group_value) weighted % within
// each platform's user base. Built post-Step-2, so this file has only
// weighted point estimates — no unweighted value/se/ci. The `n` here
// is the platform-user denominator (count of users with a non-NA
// grouping value); it's the same across every level of the same
// (platform × wave × grouping_var) breakdown and drives suppression
// uniformly across that breakdown.
export interface PlatformDemographicRow {
  platform_slug: string;
  platform_code: number;
  platform_label: string;
  wave: number;
  grouping_var: string;
  group_value: string;
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
