// Pure URL <-> /compare-state serialization. No React, no DOM — unit-
// testable in plain Node (probe lives in strata-local/audit/share/).
//
// This is the audited core of the share feature: every shared /compare
// link round-trips through here, and every decoded value is validated or
// clamped so a hand-edited, truncated, or stale URL can never put the
// explorer into an invalid state. Defaults are omitted on encode so a
// pristine view yields an empty query string (a clean, canonical URL).

import {
  BREAKDOWN_DEMOGRAPHICS,
  getTheme,
  type FollowUp,
  type ThemeId,
} from './compare-themes';
import {
  DEFAULT_CHART_PLATFORMS,
  MAX_CHART_PLATFORMS,
} from './platform-constants';

export type ResponseType = 'agree' | 'disagree';
export type XMode = 'full' | 'fit' | 'custom';

// Every field the /compare explorer owns, fully resolved (no undefined).
export interface ResolvedCompareState {
  theme: ThemeId;
  questionKey: string;
  platforms: string[];
  wave: number;
  responseType: ResponseType;
  xMode: XMode;
  customMin: number;
  customMax: number;
  breakdown: string | null;
  drilldown: FollowUp | null;
}

type SearchParamsLike = Record<string, string | string[] | undefined>;

const THEME_IDS: ThemeId[] = ['A', 'B', 'C', 'D'];
const VALID_WAVES = [1, 2, 3, 4, 5, 6];
const DEFAULT_WAVE = 6;
const BREAKDOWN_VALUES = BREAKDOWN_DEMOGRAPHICS.map((b) => b.groupingVar);

// The explorer's initial render: Theme A, its first question, the default
// platform set, Wave 6, % agree, full x-range, no breakdown / drill-down.
function defaultState(): ResolvedCompareState {
  return {
    theme: 'A',
    questionKey: getTheme('A').questions[0].key,
    platforms: [...DEFAULT_CHART_PLATFORMS],
    wave: DEFAULT_WAVE,
    responseType: 'agree',
    xMode: 'full',
    customMin: 0,
    customMax: 100,
    breakdown: null,
    drilldown: null,
  };
}

// searchParams values can be string | string[] | undefined; take the first.
function one(sp: SearchParamsLike, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Order-insensitive membership equality (platform selection order does not
// affect the chart, which ranks by value), so re-adding a removed default
// platform still counts as "default" and stays out of the URL.
function sameSlugSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((s) => setB.has(s));
}

// Validate + clamp a raw searchParams bag into a fully-resolved state.
// Unknown/invalid values fall back to their defaults; nothing throws.
export function decodeCompareState(sp: SearchParamsLike): ResolvedCompareState {
  const out = defaultState();

  // theme
  const themeRaw = one(sp, 'theme')?.toUpperCase();
  out.theme = (THEME_IDS as string[]).includes(themeRaw ?? '')
    ? (themeRaw as ThemeId)
    : 'A';
  const themeCfg = getTheme(out.theme);

  // question — must belong to the resolved theme, else its first question.
  const qRaw = one(sp, 'q');
  const question =
    (qRaw && themeCfg.questions.find((q) => q.key === qRaw)) ||
    themeCfg.questions[0];
  out.questionKey = question.key;

  // platforms — comma list, trimmed, de-duped, capped. We deliberately do
  // NOT validate slugs against the live platform list here: the canonical
  // set is runtime (meta.json), and an unknown slug simply matches no data
  // downstream (harmless) rather than being a reason to reject the URL.
  const platformsRaw = one(sp, 'platforms');
  if (platformsRaw != null) {
    const slugs = Array.from(
      new Set(platformsRaw.split(',').map((s) => s.trim()).filter(Boolean)),
    ).slice(0, MAX_CHART_PLATFORMS);
    if (slugs.length > 0) out.platforms = slugs;
  }

  // wave
  const waveRaw = Number(one(sp, 'wave'));
  out.wave = VALID_WAVES.includes(waveRaw) ? waveRaw : DEFAULT_WAVE;

  // response type
  out.responseType = one(sp, 'response') === 'disagree' ? 'disagree' : 'agree';

  // x-axis mode (+ custom bounds)
  const xRaw = one(sp, 'x');
  out.xMode = xRaw === 'fit' || xRaw === 'custom' ? xRaw : 'full';
  if (out.xMode === 'custom') {
    const lo = Number(one(sp, 'xmin'));
    const hi = Number(one(sp, 'xmax'));
    if (Number.isFinite(lo)) out.customMin = clampPercent(lo);
    if (Number.isFinite(hi)) out.customMax = clampPercent(hi);
  }

  // breakdown + drill-down are Theme A only.
  if (out.theme === 'A') {
    const breakdownRaw = one(sp, 'breakdown');
    if (breakdownRaw && BREAKDOWN_VALUES.includes(breakdownRaw)) {
      out.breakdown = breakdownRaw;
    }
    const drillRaw = one(sp, 'drill');
    if (drillRaw) {
      const fu = (question.followUps ?? []).find(
        (f) => f.construct === drillRaw,
      );
      if (fu) out.drilldown = fu;
    }
  }

  return out;
}

// Serialize state to a query string (no leading '?'), omitting any field
// equal to its default so a pristine view encodes to ''.
export function encodeCompareState(state: ResolvedCompareState): string {
  const p = new URLSearchParams();
  const themeCfg = getTheme(state.theme);
  const question =
    themeCfg.questions.find((q) => q.key === state.questionKey) ??
    themeCfg.questions[0];

  if (state.theme !== 'A') p.set('theme', state.theme.toLowerCase());
  if (state.questionKey !== themeCfg.questions[0].key) {
    p.set('q', state.questionKey);
  }
  if (!sameSlugSet(state.platforms, DEFAULT_CHART_PLATFORMS)) {
    p.set('platforms', state.platforms.join(','));
  }
  if (state.wave !== DEFAULT_WAVE) p.set('wave', String(state.wave));
  if (question.responseTypeApplies && state.responseType !== 'agree') {
    p.set('response', state.responseType);
  }
  if (state.xMode !== 'full') {
    p.set('x', state.xMode);
    if (state.xMode === 'custom') {
      p.set('xmin', String(state.customMin));
      p.set('xmax', String(state.customMax));
    }
  }
  if (state.theme === 'A' && state.breakdown) {
    p.set('breakdown', state.breakdown);
  }
  if (state.theme === 'A' && state.drilldown) {
    p.set('drill', state.drilldown.construct);
  }

  return p.toString();
}

// ── OG metadata helpers (Layer 3) ────────────────────────────────────────
// Plain-English title + description from config only — NO data reads and NO
// statistical claim (so no significance-gating obligation is incurred).

export function compareViewTitle(state: ResolvedCompareState): string {
  const themeCfg = getTheme(state.theme);
  const question =
    themeCfg.questions.find((q) => q.key === state.questionKey) ??
    themeCfg.questions[0];
  if (state.theme === 'A' && state.drilldown) {
    return state.drilldown.heatmapTitle;
  }
  return question.title;
}

export function compareViewDescription(state: ResolvedCompareState): string {
  const themeCfg = getTheme(state.theme);
  return `Platform comparison · ${themeCfg.label} · Wave ${state.wave}. An interactive chart from Ground Truth Strata, a data explorer for the Understanding America Study panel on social media and technology (2023–2025).`;
}
