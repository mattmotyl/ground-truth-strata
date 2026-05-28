// Plain-English label + ordering registries for the /platforms report
// card. Centralized so section components and adapters agree on display
// names and category order. Labels follow PHASE4_UI_SPEC.md; the registry
// grows as later sections (wellbeing, habits) land.

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
