// Plain-English label + ordering registries for the /platforms report
// card. Centralized so section components and adapters agree on display
// names and category order. Labels follow PHASE4_UI_SPEC.md; the registry
// grows as later sections (wellbeing, habits) land.

import type { ConditionalConstruct, PlatformRateMetric } from './strata-types';

// One demographic breakdown variable shown in the §2 "Who uses
// [Platform]?" table: its JSON grouping_var, display label, and the
// ordered categories (group_value → display label) in row order.
export interface DemographicVarConfig {
  groupingVar: string;
  label: string;
  categories: ReadonlyArray<{ value: string; label: string }>;
}

// Six variables per the spec. political_ideology_group is "Politics";
// pol_incl_leaners (party) is intentionally excluded. Category order and
// labels confirmed 2026-05-28: Women-first, Education low→high, Age
// ascending, Income low→high, Race White→Black→Hispanic→Asian→Other.
export const DEMOGRAPHIC_VARS: ReadonlyArray<DemographicVarConfig> = [
  {
    groupingVar: 'gender',
    label: 'Gender',
    categories: [
      { value: 'Women', label: 'Women' },
      { value: 'Men', label: 'Men' },
    ],
  },
  {
    groupingVar: 'age',
    label: 'Age',
    categories: [
      { value: '18-29', label: '18–29' },
      { value: '30-44', label: '30–44' },
      { value: '45-59', label: '45–59' },
      { value: '60+', label: '60+' },
    ],
  },
  {
    groupingVar: 'education',
    label: 'Education',
    categories: [
      {
        value: 'Grade School / Some High School',
        label: 'Grade School / Some High School',
      },
      { value: 'High School Diploma', label: 'High School Diploma' },
      { value: 'Some College', label: 'Some College' },
      { value: 'College Degree / Post-grad', label: 'College Degree / Post-grad' },
    ],
  },
  {
    groupingVar: 'hhincome',
    label: 'Income',
    categories: [
      { value: '<30,000', label: '<$30k' },
      { value: '30,000-59,999', label: '$30–60k' },
      { value: '60,000-99,999', label: '$60–100k' },
      { value: '100,000-149,999', label: '$100–150k' },
      { value: '>150,000', label: '$150k+' },
    ],
  },
  {
    groupingVar: 'race',
    label: 'Race/Ethnicity',
    categories: [
      { value: 'White, non-Hispanic', label: 'White' },
      { value: 'Black, non-Hispanic', label: 'Black' },
      { value: 'Hispanic', label: 'Hispanic' },
      { value: 'Asian, non-Hispanic', label: 'Asian' },
      { value: 'Other/Multiple races, non-Hispanic', label: 'Other/Multiple' },
    ],
  },
  {
    groupingVar: 'political_ideology_group',
    label: 'Politics',
    categories: [
      { value: 'Liberal', label: 'Liberal' },
      { value: 'Moderate', label: 'Moderate' },
      { value: 'Conservative', label: 'Conservative' },
    ],
  },
];

// §5 platform habit/attitude scale items (us018a–g, Waves 4–6). Bars use
// these short phrasings; `metric` is the platform_rates.json metric name.
export interface HabitItemConfig {
  metric: PlatformRateMetric;
  label: string;
}

export const HABIT_ITEMS: ReadonlyArray<HabitItemConfig> = [
  { metric: 'us018a_mean', label: 'Uses it without thinking' },
  { metric: 'us018b_mean', label: 'Thinks about using it a lot' },
  { metric: 'us018c_mean', label: 'Has a positive feeling about using it' },
  { metric: 'us018d_mean', label: 'Has a negative feeling about using it' },
  { metric: 'us018e_mean', label: 'Spends more time than intended' },
  { metric: 'us018f_mean', label: 'Learns things from using it' },
  { metric: 'us018g_mean', label: 'Feels connected to others from using it' },
];

// §3 experience rates (us003/007/010/012). The 2×2 grid renders these in
// order. `colorIntent` picks the mini-line color (warm = harm, cool =
// positive). `followUps` are the conditional-breakdown drill tables shown
// below the grid — only negative-experience and bad-for-world have them.
export interface ExperienceFollowUp {
  construct: ConditionalConstruct;
  title: string;
}

export interface ExperienceItemConfig {
  metric: PlatformRateMetric;
  label: string;
  colorIntent: 'warm' | 'cool';
  followUps: ReadonlyArray<ExperienceFollowUp>;
}

export const EXPERIENCE_ITEMS: ReadonlyArray<ExperienceItemConfig> = [
  {
    metric: 'nux_rate',
    label: 'Negative personal experiences',
    colorIntent: 'warm',
    followUps: [
      { construct: 'nuxtopic', title: 'Topics involved in negative experiences' },
      { construct: 'nuximpact', title: 'How these experiences impacted users' },
    ],
  },
  {
    metric: 'bftw_rate',
    label: 'Content considered bad for the world',
    colorIntent: 'warm',
    followUps: [
      {
        construct: 'bftwtopic',
        title: 'Topics of content considered bad for the world',
      },
      {
        construct: 'bftwimpact',
        title: 'Expected impacts of bad-for-world content',
      },
    ],
  },
  {
    metric: 'mcxn_rate',
    label: 'Meaningful connections',
    colorIntent: 'cool',
    followUps: [],
  },
  {
    metric: 'useful_rate',
    label: 'Learning something useful',
    colorIntent: 'cool',
    followUps: [],
  },
];
