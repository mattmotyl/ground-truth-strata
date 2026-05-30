// /trends category registry (T3-B7 redesign). Three categories, each
// driving a distinct data source + chart behavior, mirroring the
// /compare theme → question model. Curated variable set only — no raw
// dump of every trends.json variable.

import type { LikertBucket } from './strata-types';

export type TrendsRendererKind =
  | 'f01' // existing platform-usage chart (FindingPlatformUsage)
  | 'platformMetric' // platform_rates.json fan-out (experience rates)
  | 'wellbeing' // group_comparisons.json platform-split (User rows)
  | 'attitudeSingle' // trends.json single population line
  | 'attitudePaired'; // trends.json two population lines on one chart

// Endpoint anchor shown directly on the Y-axis (slate xs) for
// non-percentage mean variables — e.g. {value: 10, label: 'very warm'}.
export interface AxisAnchor {
  value: number;
  label: string;
}

export interface TrendsQuestion {
  key: string;
  kind: TrendsRendererKind;
  // Picker radio label. When omitted, the explorer derives it from the
  // variable's meta `construct` (domain prefix stripped).
  label?: string;
  // Chart title slug. Omitted for attitudeSingle (RespondentTrend derives
  // it from meta).
  title?: string;
  filenameBase: string;
  // platformMetric:
  metric?: string;
  surveyVar?: string;
  // wellbeing:
  outcome?: string;
  bucket?: LikertBucket | null;
  subtitle?: string; // override (e.g. ex003_lonely has no survey question)
  // attitudeSingle:
  variable?: string;
  // attitudePaired:
  pair?: [string, string];
  pairLabels?: [string, string];
  pairSubtitle?: string;
  // Y-axis endpoint anchors (min/max) for non-percentage mean variables,
  // rendered on the axis itself. Omitted for percentage variables
  // (Platform Use & Experiences, Well-Being).
  axisAnchors?: AxisAnchor[];
}

export interface TrendsCategory {
  id: string;
  label: string;
  questions: TrendsQuestion[];
}

export const TRENDS_CATEGORIES: TrendsCategory[] = [
  {
    id: 'platform',
    label: 'Platform Use & Experiences',
    questions: [
      {
        key: 'usage',
        kind: 'f01',
        label: 'Platform usage',
        title: 'Who uses what?',
        filenameBase: 'strata_platform_usage',
      },
      {
        key: 'nux',
        kind: 'platformMetric',
        label: 'Negative personal experiences',
        title: 'Negative Personal Experiences',
        metric: 'nux_rate',
        surveyVar: 'us003',
        filenameBase: 'strata_trends_nux',
      },
      {
        key: 'bftw',
        kind: 'platformMetric',
        label: 'Content considered bad for the world',
        title: 'Content Considered Bad for the World',
        metric: 'bftw_rate',
        surveyVar: 'us007',
        filenameBase: 'strata_trends_bftw',
      },
      {
        key: 'mcxn',
        kind: 'platformMetric',
        label: 'Meaningful connections made',
        title: 'Meaningful Connections Made',
        metric: 'mcxn_rate',
        surveyVar: 'us010',
        filenameBase: 'strata_trends_mcxn',
      },
      {
        key: 'useful',
        kind: 'platformMetric',
        label: 'Learning something useful',
        title: 'Learning Something Useful',
        metric: 'useful_rate',
        surveyVar: 'us012',
        filenameBase: 'strata_trends_useful',
      },
    ],
  },
  {
    id: 'wellbeing',
    label: 'Well-Being',
    questions: [
      {
        key: 'lonely',
        kind: 'wellbeing',
        label: 'Loneliness',
        title: 'Loneliness Among Platform Users',
        outcome: 'ex003_lonely',
        bucket: null,
        subtitle:
          'Share of each platform’s users who score as lonely on the UCLA 3-item loneliness scale (sum of three items ≥ 6). Asked in Waves 2, 5, and 6 only.',
        filenameBase: 'strata_trends_lonely',
      },
      {
        key: 'ls002l',
        kind: 'wellbeing',
        label: 'Overall life satisfaction',
        title: 'Overall Life Satisfaction',
        outcome: 'ls002l',
        bucket: 'agree',
        filenameBase: 'strata_trends_ls002l',
      },
      {
        key: 'ls002a',
        kind: 'wellbeing',
        label: 'Satisfied with physical health',
        title: 'Satisfaction With Physical Health',
        outcome: 'ls002a',
        bucket: 'agree',
        filenameBase: 'strata_trends_ls002a',
      },
      {
        key: 'ls002d',
        kind: 'wellbeing',
        label: 'Satisfied with mental health',
        title: 'Satisfaction With Mental Health',
        outcome: 'ls002d',
        bucket: 'agree',
        filenameBase: 'strata_trends_ls002d',
      },
      {
        key: 'ls002c',
        kind: 'wellbeing',
        label: 'Satisfied with social life',
        title: 'Satisfaction With Social Life',
        outcome: 'ls002c',
        bucket: 'agree',
        filenameBase: 'strata_trends_ls002c',
      },
      {
        key: 'ls002h',
        kind: 'wellbeing',
        label: 'Feels happy most of the time',
        title: 'Feeling Happy Most of the Time',
        outcome: 'ls002h',
        bucket: 'agree',
        filenameBase: 'strata_trends_ls002h',
      },
      {
        key: 'ls002i',
        kind: 'wellbeing',
        label: 'Feels negative most of the time',
        title: 'Feeling Negative Most of the Time (Reverse-Coded)',
        outcome: 'ls002i',
        bucket: 'agree',
        filenameBase: 'strata_trends_ls002i',
      },
    ],
  },
  {
    id: 'attitudes',
    label: 'Attitudes',
    questions: [
      {
        key: 'thermometers',
        kind: 'attitudePaired',
        label: 'Feeling thermometers (liberals vs. conservatives)',
        title: 'Feeling Thermometers — Liberals vs. Conservatives',
        pair: ['scim_therm_lib', 'scim_therm_con'],
        pairLabels: ['Liberals', 'Conservatives'],
        pairSubtitle:
          'Average warmth toward liberals and conservatives on a 0–10 feeling thermometer.',
        axisAnchors: [
          { value: 0, label: 'very unfavorable' },
          { value: 10, label: 'very favorable' },
        ],
        filenameBase: 'strata_trends_thermometers',
      },
      {
        key: 'friends',
        kind: 'attitudePaired',
        label: 'Comfort having friends (liberal vs. conservative)',
        title: 'Comfort Having Friends — Liberal vs. Conservative',
        pair: ['scim_friends_lib', 'scim_friends_con'],
        pairLabels: ['Liberal friends', 'Conservative friends'],
        pairSubtitle:
          'Average comfort having liberal vs. conservative friends on a 0–10 scale.',
        axisAnchors: [
          { value: 0, label: 'not comfortable at all' },
          { value: 10, label: 'extremely comfortable' },
        ],
        filenameBase: 'strata_trends_friends',
      },
      {
        key: 'sc001a',
        kind: 'attitudeSingle',
        variable: 'sc001a',
        axisAnchors: [
          { value: 1, label: 'strongly disagree' },
          { value: 5, label: 'strongly agree' },
        ],
        filenameBase: 'strata_trends_sc001a',
      },
      {
        key: 'sc001b',
        kind: 'attitudeSingle',
        variable: 'sc001b',
        axisAnchors: [
          { value: 1, label: 'strongly disagree' },
          { value: 5, label: 'strongly agree' },
        ],
        filenameBase: 'strata_trends_sc001b',
      },
      {
        key: 'sc001c',
        kind: 'attitudeSingle',
        variable: 'sc001c',
        axisAnchors: [
          { value: 1, label: 'strongly disagree' },
          { value: 5, label: 'strongly agree' },
        ],
        filenameBase: 'strata_trends_sc001c',
      },
      {
        key: 'sc001d',
        kind: 'attitudeSingle',
        variable: 'sc001d',
        axisAnchors: [
          { value: 1, label: 'strongly disagree' },
          { value: 5, label: 'strongly agree' },
        ],
        filenameBase: 'strata_trends_sc001d',
      },
      {
        key: 'sc001e',
        kind: 'attitudeSingle',
        variable: 'sc001e',
        axisAnchors: [
          { value: 1, label: 'strongly disagree' },
          { value: 5, label: 'strongly agree' },
        ],
        filenameBase: 'strata_trends_sc001e',
      },
      {
        key: 'sc001f',
        kind: 'attitudeSingle',
        variable: 'sc001f',
        axisAnchors: [
          { value: 1, label: 'strongly disagree' },
          { value: 5, label: 'strongly agree' },
        ],
        filenameBase: 'strata_trends_sc001f',
      },
      {
        key: 'ex004a',
        kind: 'attitudeSingle',
        variable: 'ex004a',
        axisAnchors: [
          { value: 1, label: 'much less than now' },
          { value: 5, label: 'much more than now' },
        ],
        filenameBase: 'strata_trends_ex004a',
      },
      {
        key: 'rate_self',
        kind: 'attitudeSingle',
        label: 'Political ideology',
        variable: 'rate_self',
        axisAnchors: [
          { value: 0, label: 'very liberal' },
          { value: 100, label: 'very conservative' },
        ],
        filenameBase: 'strata_trends_rate_self',
      },
    ],
  },
];

export function getTrendsCategory(id: string): TrendsCategory {
  return TRENDS_CATEGORIES.find((c) => c.id === id) ?? TRENDS_CATEGORIES[0];
}
