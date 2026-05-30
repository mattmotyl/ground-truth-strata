// Adapters for the /explore route — respondent-level correlation views.
//
// Data source: correlations.json. Every row is a single precomputed
// Spearman ρ for an unordered variable pair at one wave:
//   { var1, var2, wave, method:'spearman', n, weighted_r,
//     weighted_n_eff, suppressed }
// There are NO raw respondent data points and NO confidence-interval
// fields in this file (verified empirically 2026-05-29). That means:
//   • a true scatter plot (point per respondent) is impossible here, and
//   • THE NUMBERS block can show ρ / n / weighted n_eff only — never CI.
//
// Scope: these views show RESPONDENT-LEVEL variables only. Platform-
// indexed predictors (time_per_day_min_*, platform_user_*) are handled
// by Finding 08's diverging bar and are intentionally excluded here.

import { magnitudeColor } from '@/lib/compare-adapters';
import { STRATA_PALETTES } from '@/lib/strata-charts';
import type { CorrelationRow, MetaJson, VariableDef } from '@/lib/strata-types';

// Variables dropped from the explore picker + matrix entirely.
//   - race, maritalstatus, vote2024: unordered (nominal) — a Spearman ρ
//     over an arbitrary code ordering is not interpretable.
//   - hisplatino (binary panel preload flag): cruder than a proper
//     race/ethnicity composite. Gender, education, income, race/ethnicity
//     are absent from this catalog; adding them requires a Track A
//     precompute decision on ordinal/nominal handling.
//   - ex003a, ex003b, ex003c: the three individual UCLA loneliness items.
//     Dropped in favour of the single binary composite ex003_lonely
//     ("Lonely"), which is the defensible summary measure — showing the
//     three sub-items alongside the composite is redundant and invites
//     double-counting in the matrix.
export const EXPLORE_EXCLUDED_VARS: ReadonlySet<string> = new Set([
  'race',
  'maritalstatus',
  'hisplatino',
  'vote2024',
  'ex003a',
  'ex003b',
  'ex003c',
]);

// Plain-language display labels, keyed by variable_name. These OVERRIDE
// meta's `construct` everywhere a label is shown to users (matrix axes,
// THE NUMBERS, both pickers, the pair explorer). Internal variable codes
// must never appear in user-facing text — only in THE NUMBERS code column
// and CSV/citation payloads.
// NOTE: ls002h ("happy most of the time") was NOT in the supplied rename
// table, so it keeps its construct label for now — flag for Matt.
export const RESPONDENT_VAR_LABELS: Record<string, string> = {
  ls002a: 'Satisfied With Physical Health',
  ls002b: 'Satisfied With Financial Situation',
  ls002c: 'Satisfied With Social Life',
  ls002d: 'Satisfied With Mental Health',
  ls002e: 'Satisfied With Leisure Time',
  ls002f: 'Satisfied With Work or Daily Activities',
  ls002g: 'Satisfied With Family Life',
  ls002i: "Doesn't Feel Negative Most of the Time",
  ls002j: 'Life Is Going Well',
  ls002k: 'Life Is Going Well (In Most Ways)',
  ls002l: 'Satisfied With Life Overall',
  ex003_lonely: 'Lonely',
  rate_self: 'Political Conservatism',
  age: 'Age',
  scim_therm_lib: 'Warmth Toward Liberals',
  scim_therm_con: 'Warmth Toward Conservatives',
  scim_friends_lib: 'Comfort With Liberal Friends',
  scim_friends_con: 'Comfort With Conservative Friends',
  us020: 'In-Person: Interaction Frequency',
  us021: 'In-Person: Meaningful Connection',
  us022: 'In-Person: Learned Something Useful',
  us023: 'In-Person: Bad-for-World Content',
  us024: 'In-Person: Negative Experience',
  us014: 'Refrained From Posting Online',
};

// Shorter labels for the MATRIX AXIS ONLY (column + row headers), where
// long construct strings overflow / clip. THE NUMBERS box and the picker
// keep the full label. Keyed by variable_name.
export const AXIS_SHORT_LABELS: Record<string, string> = {
  sc001f: 'Hard to Resist Social Media',
  sc001d: 'Good at Managing Social Media Use',
  sc001e: 'In Control of Social Media Use',
  sc001b: 'Social Media Strengthens Relationships',
  sc001c: 'Social Media Aids Learning',
  sc001a: 'Social Media Is a Waste of Time',
  ex002a: 'Feel Connected to Family via Social Media',
  ls002h: 'Feels Happy Most of the Time',
};

// Convert a display label into a grammatically correct noun phrase for
// use in prose titles/subtitles (the picker + axes keep the original
// adjective-style label). Only the cases that read wrong as a noun are
// rewritten; everything else passes through unchanged.
export function toNounPhrase(label: string): string {
  if (label.startsWith('Satisfied With ')) {
    return `Satisfaction With ${label.slice('Satisfied With '.length)}`;
  }
  if (label === 'Lonely') return 'Loneliness';
  return label;
}

// Per-variable domain reassignment. us020–us024 are about IN-PERSON
// interactions, not platform use, so they get their own domain header.
// us014 ("Refrained From Posting Online") stays under PLATFORM_USE.
const VAR_DOMAIN_OVERRIDES: Record<string, string> = {
  us020: 'IN_PERSON_EXPERIENCES',
  us021: 'IN_PERSON_EXPERIENCES',
  us022: 'IN_PERSON_EXPERIENCES',
  us023: 'IN_PERSON_EXPERIENCES',
  us024: 'IN_PERSON_EXPERIENCES',
};

// Domain display order + human labels for the picker groups and the
// heatmap axis grouping. Unknown domains sort last, label-cased as-is.
const DOMAIN_ORDER: readonly string[] = [
  'WELLBEING',
  'LONELINESS',
  'DEPRESSION_ANXIETY',
  'SOCIAL_MEDIA_BELIEFS',
  'TECH_IDENTITY',
  'TECH_REGULATION',
  'INSTITUTIONAL_TRUST',
  'POLITICAL',
  'IN_PERSON_EXPERIENCES',
  'PLATFORM_USE',
  'DEMOGRAPHICS',
];

const DOMAIN_LABELS: Record<string, string> = {
  WELLBEING: 'Well-being',
  LONELINESS: 'Loneliness',
  DEPRESSION_ANXIETY: 'Depression & anxiety',
  SOCIAL_MEDIA_BELIEFS: 'Social media beliefs',
  TECH_IDENTITY: 'Tech identity',
  TECH_REGULATION: 'Tech regulation',
  INSTITUTIONAL_TRUST: 'Institutional trust',
  POLITICAL: 'Political',
  IN_PERSON_EXPERIENCES: 'In-person experiences',
  PLATFORM_USE: 'Platform use',
  DEMOGRAPHICS: 'Demographics',
};

export function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain;
}

function domainRank(domain: string): number {
  const i = DOMAIN_ORDER.indexOf(domain);
  return i === -1 ? DOMAIN_ORDER.length : i;
}

export interface RespondentVar {
  name: string; // variable_name, the compact axis/tooltip code (e.g. "ls002l")
  label: string; // human-readable construct (e.g. "Wellbeing — Overall…")
  domain: string;
  domainLabel: string;
  responseType: string;
  waves: number[];
}

// Build the respondent-level variable catalog from meta.json:
// is_platform_indexed === false, not excluded from outputs, and not a
// dropped nominal category. Labelled by `construct` (meta has no
// dedicated label field). Sorted by domain order, then label.
export function buildRespondentVarCatalog(meta: MetaJson): RespondentVar[] {
  const out: RespondentVar[] = meta.variables
    .filter(
      (v: VariableDef) =>
        v.is_platform_indexed === false &&
        v.excluded_from_outputs !== true &&
        !EXPLORE_EXCLUDED_VARS.has(v.variable_name),
    )
    .map((v) => {
      const domain = VAR_DOMAIN_OVERRIDES[v.variable_name] ?? v.domain;
      return {
        name: v.variable_name,
        label:
          RESPONDENT_VAR_LABELS[v.variable_name] ??
          (v.construct || v.variable_name),
        domain,
        domainLabel: domainLabel(domain),
        responseType: v.response_type,
        waves: v.waves_present_in_data ?? [],
      };
    });
  out.sort((a, b) => {
    const dr = domainRank(a.domain) - domainRank(b.domain);
    if (dr !== 0) return dr;
    return a.label.localeCompare(b.label);
  });
  return out;
}

// Group a catalog into domain buckets, preserving the catalog's order.
export interface DomainGroup {
  domain: string;
  domainLabel: string;
  vars: RespondentVar[];
}

export function groupByDomain(catalog: RespondentVar[]): DomainGroup[] {
  const groups: DomainGroup[] = [];
  const index = new Map<string, DomainGroup>();
  for (const v of catalog) {
    let g = index.get(v.domain);
    if (!g) {
      g = { domain: v.domain, domainLabel: v.domainLabel, vars: [] };
      index.set(v.domain, g);
      groups.push(g);
    }
    g.vars.push(v);
  }
  return groups;
}

// The subset of catalog variables that actually appear in at least one
// correlation row (either position). Use this to populate pickers so a
// user can't choose a variable that has no correlations at all.
export function catalogVarsPresentInData(
  catalog: RespondentVar[],
  rows: CorrelationRow[],
): RespondentVar[] {
  const present = new Set<string>();
  for (const r of rows) {
    present.add(r.var1);
    present.add(r.var2);
  }
  return catalog.filter((v) => present.has(v.name));
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

// ── Heatmap matrix ──────────────────────────────────────────────────
// ρ is per-wave; cross-wave values cannot be combined, so a matrix is
// always for ONE wave. Within a wave the respondent×respondent matrix is
// fully populated and unsuppressed (verified), so missing cells only
// happen on the diagonal or when one of the two variables wasn't fielded
// that wave.

export interface MatrixCell {
  r: number;
  n: number | null;
  nEff: number | null;
}

export interface CorrelationMatrix {
  wave: number;
  vars: RespondentVar[]; // present this wave, within enabled domains, in catalog order
  maxAbs: number; // largest |ρ| among off-diagonal cells (color scaling)
  pairCount: number;
  get: (a: string, b: string) => MatrixCell | null;
}

export function buildCorrelationMatrix(
  rows: CorrelationRow[],
  catalog: RespondentVar[],
  wave: number,
  selectedNames?: ReadonlySet<string>,
): CorrelationMatrix {
  // Individual-variable selection: only the named variables are included
  // (in catalog order). When `selectedNames` is omitted, the whole
  // catalog is eligible.
  const allowed = new Map<string, RespondentVar>();
  for (const v of catalog) {
    if (selectedNames && !selectedNames.has(v.name)) continue;
    allowed.set(v.name, v);
  }

  const cells = new Map<string, MatrixCell>();
  const present = new Set<string>();
  let maxAbs = 0;
  let pairCount = 0;

  for (const r of rows) {
    if (r.wave !== wave) continue;
    if (r.suppressed || r.weighted_r === null) continue;
    if (!allowed.has(r.var1) || !allowed.has(r.var2)) continue;
    if (r.var1 === r.var2) continue;
    cells.set(pairKey(r.var1, r.var2), {
      r: r.weighted_r,
      n: r.n,
      nEff: r.weighted_n_eff,
    });
    present.add(r.var1);
    present.add(r.var2);
    pairCount += 1;
    const a = Math.abs(r.weighted_r);
    if (a > maxAbs) maxAbs = a;
  }

  const vars = catalog.filter(
    (v) => allowed.has(v.name) && present.has(v.name),
  );

  return {
    wave,
    vars,
    maxAbs,
    pairCount,
    get: (a, b) => (a === b ? null : cells.get(pairKey(a, b)) ?? null),
  };
}

// Waves for which at least one respondent-level correlation pair exists.
export function wavesWithRespondentPairs(
  rows: CorrelationRow[],
  catalog: RespondentVar[],
): number[] {
  const names = new Set(catalog.map((v) => v.name));
  const set = new Set<number>();
  for (const r of rows) {
    if (r.suppressed || r.weighted_r === null) continue;
    if (names.has(r.var1) && names.has(r.var2) && r.var1 !== r.var2) {
      set.add(r.wave);
    }
  }
  return [...set].sort((a, b) => a - b);
}

// ── Pair series (over waves) ────────────────────────────────────────

export interface PairWavePoint {
  wave: number;
  r: number;
  n: number | null;
  nEff: number | null;
}

// All waves where this unordered pair has a non-suppressed ρ, ascending.
// Often a single wave (61% of respondent pairs are single-wave because
// the variables themselves were fielded in only one wave).
export function buildPairSeries(
  rows: CorrelationRow[],
  var1: string,
  var2: string,
): PairWavePoint[] {
  const key = pairKey(var1, var2);
  const out: PairWavePoint[] = [];
  for (const r of rows) {
    if (r.suppressed || r.weighted_r === null) continue;
    if (pairKey(r.var1, r.var2) !== key) continue;
    out.push({ wave: r.wave, r: r.weighted_r, n: r.n, nEff: r.weighted_n_eff });
  }
  out.sort((a, b) => a.wave - b.wave);
  return out;
}

// ── Color + magnitude helpers ───────────────────────────────────────

// Diverging cell color for the heatmap: teal ramp for positive ρ, warm
// (amber→red) ramp for negative ρ, lightest near 0. Intensity is scaled
// to the largest |ρ| visible in the matrix so small-but-real values stay
// distinguishable (real-world |ρ| here is almost always < 0.4).
export function correlationColor(r: number, maxAbs: number): string {
  const m = maxAbs > 0 ? maxAbs : 0.05;
  return r >= 0
    ? magnitudeColor(r, m, STRATA_PALETTES.positive)
    : magnitudeColor(-r, m, STRATA_PALETTES.harm);
}

export type EffectBand = 'none' | 'weak' | 'moderate' | 'strong';

export function effectBandOf(r: number): EffectBand {
  const a = Math.abs(r);
  if (a < 0.1) return 'none';
  if (a < 0.3) return 'weak';
  if (a < 0.5) return 'moderate';
  return 'strong';
}

// Single-hue (plum) intensity ramp keyed to magnitude band; the bar's
// position relative to the zero line conveys sign. Negligible (|ρ|<0.1)
// is a muted grey so noise-level associations don't read as findings.
export const BAND_COLOR: Record<EffectBand, string> = {
  none: '#C8C3BC',
  weak: '#B08CC7',
  moderate: '#7A5A8F',
  strong: '#4B2E63',
};

export const BAND_LABEL: Record<EffectBand, string> = {
  none: 'negligible (|ρ| < 0.1)',
  weak: 'weak (0.1–0.3)',
  moderate: 'moderate (0.3–0.5)',
  strong: 'strong (≥ 0.5)',
};
