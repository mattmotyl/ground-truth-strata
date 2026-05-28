// /compare theme + question registry (T3-B-Compare).
//
// The two-step picker and the orchestrator are config-driven: this file
// is the single place that declares which themes exist, which questions
// each theme offers, and how each question maps to a precomputed source,
// a chart title, and a coloring intent. Adding Theme C / Theme D in
// Part 2 is a matter of filling in their `questions` and flipping
// `available` to true — no picker or chart code changes.
//
// Titles come verbatim from the Title Registry in PHASE4_UI_SPEC.md
// (lines 898-923). Radio labels come from the per-theme Step-2 option
// lists in the same spec. Never surface variable names in the UI.

import type { PlatformRateMetric } from './strata-types';

export type ThemeId = 'A' | 'B' | 'C' | 'D';

export type CompareSource =
  | 'platform_rates'
  | 'group_comparisons'
  | 'platform_demographics';

export type CompareChartType = 'rankedBar' | 'stackedBar';

// Abstract coloring intent per question. The orchestrator resolves this
// to a concrete RankedBarColoring once it knows the live response type:
//   - magnitude/warm  → harm palette  (Theme A negative outcomes)
//   - magnitude/cool  → positive palette (Theme A positive outcomes)
//   - responseType    → solid plum (% agree) / amber (% disagree)
//   - binary          → solid warm amber (Theme C loneliness rate)
export type QuestionColoring =
  | { mode: 'magnitude'; scale: 'warm' | 'cool' }
  | { mode: 'responseType' }
  | { mode: 'binary' };

export interface CompareQuestion {
  // Stable id used as the Step-2 radio value (and, later, URL state).
  key: string;
  // Plain-English radio label shown in Step 2.
  label: string;
  // Chart title (Title Registry). Plain English; never a variable name.
  title: string;
  // Survey variable used for the question-text subtitle lookup
  // (surveyQuestionFor). Not shown directly as a label.
  variable: string;
  source: CompareSource;
  // platform_rates source only — the metric column to read.
  metric?: PlatformRateMetric;
  coloring: QuestionColoring;
  // Whether the RESPONSE TYPE control (% agree / % disagree) applies.
  // True for Theme B and Theme C bucketed (ls002*) items.
  responseTypeApplies: boolean;
  // ls002i only. The item is reverse-coded (reversed at data-load time),
  // so the post-reversal "agree" bucket means the respondent does NOT
  // feel negative. The orchestrator relabels the response-type control
  // and axis and adds a footnote when this is set.
  reverseCoded?: boolean;
  chartType: CompareChartType;
}

export interface CompareTheme {
  id: ThemeId;
  // Theme button label (Step 1).
  label: string;
  // false = Part 2 stub. The picker shows it disabled with a
  // "coming soon" affordance so the full theme set is visible.
  available: boolean;
  questions: CompareQuestion[];
}

// ── Theme D demographic-composition config ───────────────────────────
// Stacked-bar segments per grouping_var: their stack order, display
// labels, and how to color them. Values match platform_demographics.json
// group_value strings verbatim. Platforms are sorted by the leading
// (first) segment's share, descending.
export interface DemographicSegment {
  value: string; // exact group_value in platform_demographics.json
  label: string;
}

export interface DemographicConfig {
  // 'political' → fixed blue/purple/red; 'qualitative' → qualitative16.
  colorMode: 'political' | 'qualitative';
  // Stack order (also the sort key: platforms sort by segments[0]).
  segments: DemographicSegment[];
}

export const DEMOGRAPHIC_CONFIGS: Record<string, DemographicConfig> = {
  political_ideology_group: {
    colorMode: 'political',
    segments: [
      { value: 'Liberal', label: 'Liberal' },
      { value: 'Moderate', label: 'Moderate' },
      { value: 'Conservative', label: 'Conservative' },
    ],
  },
  gender: {
    colorMode: 'qualitative',
    segments: [
      { value: 'Women', label: 'Women' },
      { value: 'Men', label: 'Men' },
    ],
  },
  age: {
    colorMode: 'qualitative',
    segments: [
      { value: '18-29', label: '18–29' },
      { value: '30-44', label: '30–44' },
      { value: '45-59', label: '45–59' },
      { value: '60+', label: '60+' },
    ],
  },
  education: {
    colorMode: 'qualitative',
    segments: [
      {
        value: 'Grade School / Some High School',
        label: 'Grade School / Some High School',
      },
      { value: 'High School Diploma', label: 'High School Diploma' },
      { value: 'Some College', label: 'Some College' },
      {
        value: 'College Degree / Post-grad',
        label: 'College Degree / Post-grad',
      },
    ],
  },
  hhincome: {
    colorMode: 'qualitative',
    segments: [
      { value: '<30,000', label: '<$30k' },
      { value: '30,000-59,999', label: '$30k–60k' },
      { value: '60,000-99,999', label: '$60k–100k' },
      { value: '100,000-149,999', label: '$100k–150k' },
      { value: '>150,000', label: '>$150k' },
    ],
  },
  race: {
    // Descending population size (Matt-specified fixed order).
    colorMode: 'qualitative',
    segments: [
      { value: 'White, non-Hispanic', label: 'White' },
      { value: 'Hispanic', label: 'Hispanic' },
      { value: 'Black, non-Hispanic', label: 'Black' },
      { value: 'Asian, non-Hispanic', label: 'Asian' },
      {
        value: 'Other/Multiple races, non-Hispanic',
        label: 'Other / Multiple',
      },
    ],
  },
};

// ── Theme A — Experiences on Platforms (platform_rates.json) ─────────
const THEME_A: CompareTheme = {
  id: 'A',
  label: 'Experiences on Platforms',
  available: true,
  questions: [
    {
      key: 'negative-experience',
      label: 'Negative personal experience',
      title: 'Negative Personal Experiences',
      variable: 'us003',
      source: 'platform_rates',
      metric: 'nux_rate',
      coloring: { mode: 'magnitude', scale: 'warm' },
      responseTypeApplies: false,
      chartType: 'rankedBar',
    },
    {
      key: 'bad-for-world',
      label: 'Content bad for the world',
      title: 'Content Considered Bad for the World',
      variable: 'us007',
      source: 'platform_rates',
      metric: 'bftw_rate',
      coloring: { mode: 'magnitude', scale: 'warm' },
      responseTypeApplies: false,
      chartType: 'rankedBar',
    },
    {
      key: 'meaningful-connection',
      label: 'Meaningful connection',
      title: 'Meaningful Connections Made',
      variable: 'us010',
      source: 'platform_rates',
      metric: 'mcxn_rate',
      coloring: { mode: 'magnitude', scale: 'cool' },
      responseTypeApplies: false,
      chartType: 'rankedBar',
    },
    {
      key: 'learned-useful',
      label: 'Learned something useful',
      title: 'Learning Something Useful',
      variable: 'us012',
      source: 'platform_rates',
      metric: 'useful_rate',
      coloring: { mode: 'magnitude', scale: 'cool' },
      responseTypeApplies: false,
      chartType: 'rankedBar',
    },
  ],
};

// ── Theme B — Platform Habits, W4-W6 only (platform_rates.json) ──────
// Each question reads a us018a-g metric's bucket rows. Continuous mean
// rows are never displayed (the scale is unvalidated — spec line 695).
const THEME_B: CompareTheme = {
  id: 'B',
  label: 'Platform Habits',
  available: true,
  questions: [
    {
      key: 'without-thinking',
      label: 'Uses it without thinking',
      title: 'Using Platform Without Thinking',
      variable: 'us018a',
      source: 'platform_rates',
      metric: 'us018a_mean',
      coloring: { mode: 'responseType' },
      responseTypeApplies: true,
      chartType: 'rankedBar',
    },
    {
      key: 'thinks-a-lot',
      label: 'Thinks about using it a lot',
      title: 'Thinking About Using the Platform',
      variable: 'us018b',
      source: 'platform_rates',
      metric: 'us018b_mean',
      coloring: { mode: 'responseType' },
      responseTypeApplies: true,
      chartType: 'rankedBar',
    },
    {
      key: 'positive-feeling',
      label: 'Has a positive feeling about using it',
      title: 'Positive Feelings About Platform Use',
      variable: 'us018c',
      source: 'platform_rates',
      metric: 'us018c_mean',
      coloring: { mode: 'responseType' },
      responseTypeApplies: true,
      chartType: 'rankedBar',
    },
    {
      key: 'negative-feeling',
      label: 'Has a negative feeling about using it',
      title: 'Negative Feelings About Platform Use',
      variable: 'us018d',
      source: 'platform_rates',
      metric: 'us018d_mean',
      coloring: { mode: 'responseType' },
      responseTypeApplies: true,
      chartType: 'rankedBar',
    },
    {
      key: 'more-time-than-intended',
      label: 'Spends more time than intended',
      title: 'Spending More Time Than Intended',
      variable: 'us018e',
      source: 'platform_rates',
      metric: 'us018e_mean',
      coloring: { mode: 'responseType' },
      responseTypeApplies: true,
      chartType: 'rankedBar',
    },
    {
      key: 'learns-things',
      label: 'Learns things from using it',
      title: 'Learning Things From the Platform',
      variable: 'us018f',
      source: 'platform_rates',
      metric: 'us018f_mean',
      coloring: { mode: 'responseType' },
      responseTypeApplies: true,
      chartType: 'rankedBar',
    },
    {
      key: 'feels-connected',
      label: 'Feels connected to others from using it',
      title: 'Feeling Connected to Others',
      variable: 'us018g',
      source: 'platform_rates',
      metric: 'us018g_mean',
      coloring: { mode: 'responseType' },
      responseTypeApplies: true,
      chartType: 'rankedBar',
    },
  ],
};

// ── Theme C — Wellbeing of Users (group_comparisons.json) ────────────
// Reads respondent-level wellbeing outcomes among each platform's USERS,
// via getPlatformOutcomeComparison() (platform_user_* / group "User").
// `variable` doubles as the group_comparisons `outcome` key.
const THEME_C: CompareTheme = {
  id: 'C',
  label: 'Wellbeing of Users',
  available: true,
  questions: [
    {
      key: 'lonely',
      label: 'Lonely (% of users)',
      title: 'Loneliness Among Platform Users',
      variable: 'ex003_lonely',
      source: 'group_comparisons',
      // INTENTIONAL PALETTE OVERRIDE: loneliness is a harm, so it uses
      // warm amber (#FFC107) — NOT the cool teal that a "binary rate"
      // might otherwise suggest. Teal is reserved for positive outcomes
      // in the Strata palette; coloring a harm teal would mislead.
      coloring: { mode: 'binary' },
      responseTypeApplies: false,
      chartType: 'rankedBar',
    },
    {
      key: 'life-overall',
      label: 'Satisfied with life overall',
      title: 'Overall Life Satisfaction',
      variable: 'ls002l',
      source: 'group_comparisons',
      coloring: { mode: 'responseType' },
      responseTypeApplies: true,
      chartType: 'rankedBar',
    },
    {
      key: 'physical-health',
      label: 'Satisfied with physical health',
      title: 'Satisfaction With Physical Health',
      variable: 'ls002a',
      source: 'group_comparisons',
      coloring: { mode: 'responseType' },
      responseTypeApplies: true,
      chartType: 'rankedBar',
    },
    {
      key: 'mental-health',
      label: 'Satisfied with mental health',
      title: 'Satisfaction With Mental Health',
      variable: 'ls002d',
      source: 'group_comparisons',
      coloring: { mode: 'responseType' },
      responseTypeApplies: true,
      chartType: 'rankedBar',
    },
    {
      key: 'social-life',
      label: 'Satisfied with social life',
      title: 'Satisfaction With Social Life',
      variable: 'ls002c',
      source: 'group_comparisons',
      coloring: { mode: 'responseType' },
      responseTypeApplies: true,
      chartType: 'rankedBar',
    },
    {
      key: 'happy',
      label: 'Feels happy most of the time',
      title: 'Feeling Happy Most of the Time',
      variable: 'ls002h',
      source: 'group_comparisons',
      coloring: { mode: 'responseType' },
      responseTypeApplies: true,
      chartType: 'rankedBar',
    },
    {
      key: 'feels-negative',
      label: 'Feels negative most of the time',
      title: 'Feeling Negative Most of the Time (Reverse-Coded)',
      variable: 'ls002i',
      source: 'group_comparisons',
      coloring: { mode: 'responseType' },
      responseTypeApplies: true,
      reverseCoded: true,
      chartType: 'rankedBar',
    },
  ],
};

// ── Theme D — Who Uses Each Platform (platform_demographics.json) ────
// Stacked horizontal bars; `variable` is the grouping_var (also the key
// into DEMOGRAPHIC_CONFIGS). platform_demographics.json is the single
// source of truth for political composition (P3-C decision). No survey
// question (these are panel-provided), no response-type/x-axis controls.
const THEME_D: CompareTheme = {
  id: 'D',
  label: 'Who Uses Each Platform',
  available: true,
  questions: [
    {
      key: 'political-composition',
      label: 'Political composition',
      title: 'Political Composition of Platform Users',
      variable: 'political_ideology_group',
      source: 'platform_demographics',
      coloring: { mode: 'magnitude', scale: 'cool' }, // unused (stacked)
      responseTypeApplies: false,
      chartType: 'stackedBar',
    },
    {
      key: 'gender',
      label: 'Gender',
      title: 'Gender Composition of Platform Users',
      variable: 'gender',
      source: 'platform_demographics',
      coloring: { mode: 'magnitude', scale: 'cool' },
      responseTypeApplies: false,
      chartType: 'stackedBar',
    },
    {
      key: 'age',
      label: 'Age group',
      title: 'Age Composition of Platform Users',
      variable: 'age',
      source: 'platform_demographics',
      coloring: { mode: 'magnitude', scale: 'cool' },
      responseTypeApplies: false,
      chartType: 'stackedBar',
    },
    {
      key: 'education',
      label: 'Education',
      title: 'Education Composition of Platform Users',
      variable: 'education',
      source: 'platform_demographics',
      coloring: { mode: 'magnitude', scale: 'cool' },
      responseTypeApplies: false,
      chartType: 'stackedBar',
    },
    {
      key: 'income',
      label: 'Income',
      title: 'Income Composition of Platform Users',
      variable: 'hhincome',
      source: 'platform_demographics',
      coloring: { mode: 'magnitude', scale: 'cool' },
      responseTypeApplies: false,
      chartType: 'stackedBar',
    },
    {
      key: 'race',
      label: 'Race/ethnicity',
      title: 'Racial/Ethnic Composition of Platform Users',
      variable: 'race',
      source: 'platform_demographics',
      coloring: { mode: 'magnitude', scale: 'cool' },
      responseTypeApplies: false,
      chartType: 'stackedBar',
    },
  ],
};

export const COMPARE_THEMES: CompareTheme[] = [
  THEME_A,
  THEME_B,
  THEME_C,
  THEME_D,
];

export function getTheme(id: ThemeId): CompareTheme {
  const theme = COMPARE_THEMES.find((t) => t.id === id);
  if (!theme) throw new Error(`Unknown compare theme: ${id}`);
  return theme;
}
