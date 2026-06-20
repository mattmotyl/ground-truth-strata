// Pure URL <-> /trends-state serialization. No React, no DOM — unit-
// testable in plain Node (probe in strata-local/audit/share/). Mirrors the
// compare/explore url-state modules: validated/clamped decode, defaults
// omitted on encode.
//
// /trends has an orchestrator (category + question) plus a per-question
// renderer that owns a slice of controls. Only one renderer mounts at a
// time, so the mounted renderer is the sole URL writer; it encodes the
// orchestrator's category + question (passed down) together with its own
// slice. Platform-fan renderers carry `platforms`; attitude renderers do
// not. Y-axis zoom (`y` + optional `ymin`/`ymax`) applies to all.

import { TRENDS_CATEGORIES, getTrendsCategory } from './trends-categories';
import {
  DEFAULT_CHART_PLATFORMS,
  MAX_CHART_PLATFORMS,
} from './platform-constants';

export type TrendsYMode = 'full' | 'fit' | 'custom';

export interface ResolvedTrendsState {
  category: string;
  questionKey: string;
  platforms: string[];
  yMode: TrendsYMode;
  // Custom Y bounds are raw chart units (percent for platform/well-being,
  // mean-scale for attitudes). Undefined unless the URL specified custom
  // bounds, so each renderer keeps its own natural default otherwise.
  customMin?: number;
  customMax?: number;
}

type SearchParamsLike = Record<string, string | string[] | undefined>;

function one(sp: SearchParamsLike, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function sameSlugSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((s) => setB.has(s));
}

function defaultState(): ResolvedTrendsState {
  const first = TRENDS_CATEGORIES[0];
  return {
    category: first.id,
    questionKey: first.questions[0].key,
    platforms: [...DEFAULT_CHART_PLATFORMS],
    yMode: 'full',
    customMin: undefined,
    customMax: undefined,
  };
}

export function decodeTrendsState(sp: SearchParamsLike): ResolvedTrendsState {
  const out = defaultState();

  // category — must be a known category, else the first.
  const catRaw = one(sp, 'category');
  const cat =
    TRENDS_CATEGORIES.find((c) => c.id === catRaw) ?? TRENDS_CATEGORIES[0];
  out.category = cat.id;

  // question — must belong to the resolved category, else its first.
  const qRaw = one(sp, 'q');
  const question =
    (qRaw && cat.questions.find((x) => x.key === qRaw)) || cat.questions[0];
  out.questionKey = question.key;

  // platforms — comma list, trimmed/de-duped/capped. (Only meaningful for
  // platform-fan questions; harmless otherwise.)
  const pRaw = one(sp, 'platforms');
  if (pRaw != null) {
    const slugs = Array.from(
      new Set(pRaw.split(',').map((s) => s.trim()).filter(Boolean)),
    ).slice(0, MAX_CHART_PLATFORMS);
    if (slugs.length > 0) out.platforms = slugs;
  }

  // y-axis zoom (+ custom bounds, only in custom mode)
  const yRaw = one(sp, 'y');
  out.yMode = yRaw === 'fit' || yRaw === 'custom' ? yRaw : 'full';
  if (out.yMode === 'custom') {
    const lo = Number(one(sp, 'ymin'));
    const hi = Number(one(sp, 'ymax'));
    if (Number.isFinite(lo)) out.customMin = lo;
    if (Number.isFinite(hi)) out.customMax = hi;
  }

  return out;
}

export function encodeTrendsState(state: ResolvedTrendsState): string {
  const p = new URLSearchParams();
  const cat = getTrendsCategory(state.category);
  const firstQuestion = cat.questions[0].key;

  if (state.category !== TRENDS_CATEGORIES[0].id) {
    p.set('category', state.category);
  }
  if (state.questionKey !== firstQuestion) p.set('q', state.questionKey);

  // Attitude renderers pass an empty platforms array → omitted.
  if (
    state.platforms.length > 0 &&
    !sameSlugSet(state.platforms, DEFAULT_CHART_PLATFORMS)
  ) {
    p.set('platforms', state.platforms.join(','));
  }

  if (state.yMode !== 'full') {
    p.set('y', state.yMode);
    if (state.yMode === 'custom') {
      if (state.customMin != null) p.set('ymin', String(state.customMin));
      if (state.customMax != null) p.set('ymax', String(state.customMax));
    }
  }

  return p.toString();
}

// Convenience encoders so renderers pass only their own slice.
export function encodeTrendsPlatformState(
  category: string,
  questionKey: string,
  platforms: string[],
  yMode: TrendsYMode,
  customMin: number,
  customMax: number,
): string {
  return encodeTrendsState({
    category,
    questionKey,
    platforms,
    yMode,
    customMin,
    customMax,
  });
}

export function encodeTrendsAttitudeState(
  category: string,
  questionKey: string,
  yMode: TrendsYMode,
  customMin: number,
  customMax: number,
): string {
  return encodeTrendsState({
    category,
    questionKey,
    platforms: [],
    yMode,
    customMin,
    customMax,
  });
}

// ── OG metadata helpers ──────────────────────────────────────────────────
// Per-category title + card (config-only; no data reads, no raw variable
// names). generateMetadata picks both from the decoded category.

interface CategoryOg {
  title: string;
  card: string;
}

const CATEGORY_OG: Record<string, CategoryOg> = {
  platform: {
    title: 'How platform experiences change over time',
    card: '/images/og/trends-platform-card.png',
  },
  wellbeing: {
    title: 'How well-being changes over time',
    card: '/images/og/trends-wellbeing-card.png',
  },
  attitudes: {
    title: 'How attitudes change over time',
    card: '/images/og/trends-attitudes-card.png',
  },
};

const FALLBACK_OG: CategoryOg = CATEGORY_OG.platform;

export function trendsViewTitle(state: ResolvedTrendsState): string {
  return (CATEGORY_OG[state.category] ?? FALLBACK_OG).title;
}

export function trendsViewCard(state: ResolvedTrendsState): string {
  return (CATEGORY_OG[state.category] ?? FALLBACK_OG).card;
}

export function trendsViewDescription(state: ResolvedTrendsState): string {
  const cat = getTrendsCategory(state.category);
  return `${cat.label} across a six-wave U.S. survey on social media and technology (2023–2025), wave by wave. An interactive chart from Ground Truth Strata.`;
}
