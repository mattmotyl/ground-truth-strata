// Pure URL <-> /explore-state serialization. No React, no DOM — unit-
// testable in plain Node (probe in strata-local/audit/share/). Mirrors
// compare-url-state: every decoded value validated/clamped, defaults
// omitted on encode so a pristine view yields an empty query string.
//
// /explore has two views, each with its own slice of state:
//   • pairs  — predictor + outcome variable (?a=&b=)
//   • matrix — wave + selected variables    (?tab=matrix&wave=&vars=)
// Only one view is mounted at a time, so the mounted sub-view is the sole
// URL writer; its encode carries its own tab + slice (the other slice stays
// at defaults and is omitted). 'pairs' is the default tab, so it needs no
// `tab` param.

export type ExploreTab = 'pairs' | 'matrix';

export const DEFAULT_PREDICTOR = 'rate_self';
export const DEFAULT_OUTCOME = 'ls002l';
export const DEFAULT_MATRIX_WAVE = 6;
export const MAX_MATRIX_VARS = 12;
// The 7 well-being / loneliness measures fielded in Wave 6 — the matrix's
// default selection (renders immediately on first load).
export const DEFAULT_MATRIX_VARS: readonly string[] = [
  'ls002k',
  'ls002l',
  'ls002j',
  'ls002d',
  'ls002i',
  'ls002c',
  'ex003_lonely',
];

export interface ResolvedExploreState {
  tab: ExploreTab;
  predictor: string;
  outcome: string;
  wave: number;
  vars: string[];
}

type SearchParamsLike = Record<string, string | string[] | undefined>;

const VALID_WAVES = [1, 2, 3, 4, 5, 6];

function defaultState(): ResolvedExploreState {
  return {
    tab: 'pairs',
    predictor: DEFAULT_PREDICTOR,
    outcome: DEFAULT_OUTCOME,
    wave: DEFAULT_MATRIX_WAVE,
    vars: [...DEFAULT_MATRIX_VARS],
  };
}

function one(sp: SearchParamsLike, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

// Order-insensitive set equality (selection order doesn't affect the
// matrix), so a reordered-but-identical selection still counts as default.
function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((s) => setB.has(s));
}

export function decodeExploreState(sp: SearchParamsLike): ResolvedExploreState {
  const out = defaultState();

  out.tab = one(sp, 'tab') === 'matrix' ? 'matrix' : 'pairs';

  // Variable names are validated at render time against the live catalog
  // (built from meta.json); an unknown name simply yields no data rather
  // than a reason to reject the URL — same philosophy as compare platforms.
  const a = one(sp, 'a');
  if (a) out.predictor = a;
  const b = one(sp, 'b');
  if (b) out.outcome = b;

  const waveRaw = Number(one(sp, 'wave'));
  out.wave = VALID_WAVES.includes(waveRaw) ? waveRaw : DEFAULT_MATRIX_WAVE;

  const varsRaw = one(sp, 'vars');
  if (varsRaw != null) {
    const v = Array.from(
      new Set(varsRaw.split(',').map((s) => s.trim()).filter(Boolean)),
    ).slice(0, MAX_MATRIX_VARS);
    if (v.length > 0) out.vars = v;
  }

  return out;
}

export function encodeExploreState(state: ResolvedExploreState): string {
  const p = new URLSearchParams();
  if (state.tab !== 'pairs') p.set('tab', state.tab);
  if (state.tab === 'pairs') {
    if (state.predictor !== DEFAULT_PREDICTOR) p.set('a', state.predictor);
    if (state.outcome !== DEFAULT_OUTCOME) p.set('b', state.outcome);
  } else {
    if (state.wave !== DEFAULT_MATRIX_WAVE) p.set('wave', String(state.wave));
    if (!sameStringSet(state.vars, DEFAULT_MATRIX_VARS)) {
      p.set('vars', state.vars.join(','));
    }
  }
  return p.toString();
}

// Convenience encoders so a sub-view doesn't need to know the other view's
// defaults — it passes only its own slice.
export function encodePairsState(predictor: string, outcome: string): string {
  return encodeExploreState({ ...defaultState(), tab: 'pairs', predictor, outcome });
}

export function encodeMatrixState(wave: number, vars: string[]): string {
  return encodeExploreState({ ...defaultState(), tab: 'matrix', wave, vars });
}

// ── OG metadata helpers ──────────────────────────────────────────────────
// Generic-but-clear, config-only (no meta.json read, and no variable names
// surfaced — the app never shows raw variable names). The specific picks
// live in the linked URL; the card text describes the view.

export function exploreViewTitle(state: ResolvedExploreState): string {
  return state.tab === 'matrix'
    ? 'How measures relate'
    : 'How measures relate over time';
}

export function exploreViewDescription(state: ResolvedExploreState): string {
  const tail =
    'An interactive chart from Ground Truth Strata, a data explorer for the Understanding America Study panel on social media and technology (2023–2025).';
  return state.tab === 'matrix'
    ? `Pairwise Spearman correlations among respondent-level survey measures · Wave ${state.wave}. ${tail}`
    : `Weighted Spearman correlation between two respondent-level survey measures across waves. ${tail}`;
}
