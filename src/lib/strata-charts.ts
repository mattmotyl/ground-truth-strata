// Shared chart configuration — palettes, fonts, margin defaults.
// Matches PHASE4_UI_SPEC.md and CHART_COMPONENT_MAP.md.

export const STRATA_PALETTES = {
  // Warm scale for harms / negative outcomes (light → dark).
  harm: ['#FFF3CD', '#FFC107', '#FF8C00', '#CC0000'] as const,
  // Cool scale for positive outcomes.
  positive: ['#E8F4F8', '#4DB6AC', '#00897B', '#004D40'] as const,
  // Political composition (fixed semantic colors).
  political: {
    liberal: '#2196F3',
    moderate: '#7B1FA2',
    conservative: '#F44336',
  },
  // Diverging from a zero reference (national average).
  diverging: {
    below: '#FFC107',
    above: '#4DB6AC',
    zero: '#18161F',
  },
  // Qualitative 8-color palette for trend lines / categorical series.
  // Order chosen to avoid red/green collisions for colorblindness.
  qualitative8: [
    '#4B2E63', // plum
    '#00897B', // teal
    '#FFC107', // amber
    '#2196F3', // blue
    '#F44336', // red
    '#7B1FA2', // purple
    '#FF8C00', // orange
    '#4DB6AC', // mint
  ] as const,
} as const;

export const CHART_FONTS = {
  body: 'var(--font-sans), DM Sans, sans-serif',
  mono: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
};

// Default chart heights. Per CHART_COMPONENT_MAP.md:
//   bar charts  = 40px per bar (min 300)
//   line charts = 400px fixed
export const CHART_HEIGHTS = {
  line: 400,
  scatter: 400,
  stackedBar: 360,
  barPerBar: 40,
  barMin: 300,
};

// Standard Recharts margins. Wide left margin accommodates platform
// labels on horizontal bar charts; line charts override.
export const CHART_MARGIN = {
  default: { top: 16, right: 24, bottom: 16, left: 60 },
  horizontalBar: { top: 16, right: 24, bottom: 16, left: 120 },
};
