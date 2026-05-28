// Registry of composite (derived) variables — measures that are not a
// single survey question but a value computed from two or more raw
// items in the data dictionary. The platform-rates pipeline and the
// correlations pipeline both bind to logical composite names; the UI
// needs a way to surface a readable header above the chart since no
// single question_text from data-dictionary.csv applies.
//
// Add a new entry whenever the data pipeline starts using a composite
// (or otherwise derived) variable that the UI references by name. The
// `description` is what surfaces in the bold chart header. The
// `component_variables` list is documentary so a reader can trace
// where the composite came from.

export interface CompositeVariableInfo {
  description: string;
  cleanVariableName?: string;
  isPlatformIndexed: boolean;
  componentVariables: readonly string[];
  // Optional longer note shown in a tooltip / methodology footnote.
  note?: string;
}

export const COMPOSITE_VARIABLES: Record<string, CompositeVariableInfo> = {
  // Time-per-day in minutes is computed from us019_hours and
  // us019_minutes (asked separately as the "Hours portion" and
  // "Minutes portion" of the same question). Strata binds to
  // `time_per_day_min_<slug>` in correlations.json and
  // `time_per_day_minutes` in platform_rates.json.
  time_per_day_minutes: {
    description: 'Self-Reported Minutes On a Platform Per Day',
    cleanVariableName: 'time_per_day_minutes',
    isPlatformIndexed: true,
    componentVariables: ['us019_hours', 'us019_minutes'],
    note: 'Composite of two survey items asked for each platform — hours-per-day and minutes-per-day — converted to total minutes per day.',
  },
  // Binary loneliness indicator derived from the UCLA 3-item scale.
  // Surfaced on /compare Theme C. Header text authored by Matt.
  ex003_lonely: {
    description:
      'Loneliness is measured using the UCLA 3-item loneliness scale. Respondents reported how often they feel they lack companionship, feel left out, and feel isolated from others (Hardly ever / Some of the time / Often). Respondents scoring 6 or higher out of 9 are classified as lonely.',
    cleanVariableName: 'ex003_lonely',
    isPlatformIndexed: false,
    componentVariables: ['ex003a', 'ex003b', 'ex003c'],
  },
};

export function lookupComposite(
  variableName: string,
): CompositeVariableInfo | null {
  return COMPOSITE_VARIABLES[variableName] ?? null;
}
