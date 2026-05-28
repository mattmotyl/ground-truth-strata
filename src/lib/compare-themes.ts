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
export type QuestionColoring =
  | { mode: 'magnitude'; scale: 'warm' | 'cool' }
  | { mode: 'responseType' };

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
  // True for Theme B (and Theme C bucketed items in Part 2).
  responseTypeApplies: boolean;
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
// Part 2: reads platform_user_* / group === "User" rows via
// getPlatformOutcomeComparison(); needs bucket handling + ls002i
// reverse-coding relabeling. Stubbed here so the picker shows all four
// themes; questions filled next session.
const THEME_C: CompareTheme = {
  id: 'C',
  label: 'Wellbeing of Users',
  available: false,
  questions: [],
};

// ── Theme D — Who Uses Each Platform (platform_demographics.json) ────
// Part 2: stacked horizontal bars over platform_demographics.json
// (grouping_var per question). Political composition reads
// grouping_var === "political_ideology_group" — platform_demographics
// is the single source of truth per the P3-C decision. Stubbed here.
const THEME_D: CompareTheme = {
  id: 'D',
  label: 'Who Uses Each Platform',
  available: false,
  questions: [],
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
