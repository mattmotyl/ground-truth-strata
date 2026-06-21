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

// External "Further reading" link shown under an interpretation.
export interface FurtherReadingLink {
  label: string;
  href: string;
}

export interface TrendsQuestion {
  key: string;
  kind: TrendsRendererKind;
  // Picker radio label. When omitted, the explorer derives it from the
  // variable's meta `construct` (domain prefix stripped).
  label?: string;
  // Signed-off, significance-gated "What the numbers mean" copy, rendered
  // verbatim (no dynamic recompute). When present, the renderer drops the
  // [WORK IN PROGRESS] placeholder flag for that question; when absent it
  // falls back to a templated placeholder. See the arithmetic comment
  // block above TRENDS_CATEGORIES.
  interpretation?: string;
  // Optional "Further reading" links rendered beneath the interpretation
  // (e.g. Matt's published reports for added context). External links.
  furtherReading?: FurtherReadingLink[];
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

// =====================================================================
// SIGNIFICANCE-GATED INTERPRETATION COPY — Platform Use & Experiences.
// Per Matt's rule (describeChange() in src/lib/strata-formatters.ts), a
// directional claim ("increased"/"decreased"/"climbed"/"fell") is allowed
// only when
//   |v_last - v_first| > 1.96 * sqrt(se_first^2 + se_last^2)
// using each PlatformRateRow's precomputed weighted_se; otherwise the
// series is described as "stable". Computed offline from
// public/data/platform_rates.json (bucket==null rows), W1->W6 (all four
// items are present in every wave).
//
// SCOPE: superlatives ("most/least common") and the stable/changed counts
// range over an 11-platform set of TRADITIONAL SOCIAL platforms with full
// six-wave coverage and adequate sample (n>=100 every wave) — the 8 chart
// defaults PLUS Pinterest, Nextdoor, Discord. This is NOT the chart's
// default-8 selection: ranging superlatives over the default 8 made some
// claims false against the fuller data (e.g. Dating Apps outranked
// Facebook on negative experiences; WhatsApp/Discord, not Facebook, lead
// meaningful connections). Excluded: private-messaging/comms tools
// (WhatsApp, Text Messaging, FaceTime, Email), dating (Dating Apps),
// low-n (Twitch), and partial-coverage platforms (Threads = W2-6,
// Bluesky = W6 only). The set is stated to the reader in a footnote
// (PLATFORM_EXPERIENCES_SCOPE_NOTE). Reproducible arithmetic + the
// all-platform coverage audit that justified the set live in
//   strata-local/audit/scripts/trends_platform_experiences_set11.mjs
//   strata-local/audit/scripts/trends_platform_experiences_coverage.mjs
//
//   metric (var) — what it measures        W1 -> W6 movers (rest: stable)
//   ----------------------------------------------------------------------
//   nux_rate (us003) — negative personal experience          (9/11 stable)
//     tiktok    14.3% -> 9.1%  (-5.19pp vs 4.58pp thresh)  DECREASED
//     reddit    14.7% -> 8.3%  (-6.39pp vs 5.65pp thresh)  DECREASED
//   bftw_rate (us007) — content considered bad for the world (11/11 stable)
//     (no platform crosses threshold W1->W6 — all stable)
//   mcxn_rate (us010) — meaningful connection               (11/11 stable)
//     (no platform crosses threshold W1->W6 — all stable)
//   useful_rate (us012) — learned something useful           (9/11 stable)
//     reddit    30.3% -> 47.8% (+17.44pp vs 8.07pp thresh) INCREASED
//     nextdoor  11.1% -> 19.1% (+7.97pp vs 7.74pp thresh) INCREASED (marginal)
//
// Signed off by Matt 2026-06-20. "Among the social platforms compared"
// wording avoids referencing UI/back-end state; the copy is static (does
// not recompute when the user changes the platform selection).
// =====================================================================

// Scope footnote rendered beneath each Platform-Experiences interpretation
// (see the SCOPE note above). Stated so a reader who lifts the text knows
// exactly which platforms the superlatives compare and why.
export const PLATFORM_EXPERIENCES_SCOPE_NOTE =
  'Platforms compared: Facebook, YouTube, Instagram, TikTok, Snapchat, ' +
  'Reddit, LinkedIn, X, Pinterest, Nextdoor, and Discord — traditional ' +
  'social platforms with adequate sample in all six waves.';

// =====================================================================
// SIGNIFICANCE-GATED INTERPRETATION COPY — Well-Being. Same rule + same
// 11-platform scope as Platform Use & Experiences above, but sourced from
// group_comparisons.json (User rows, conditional on platform USE) and
// reshaped by buildOutcomeRateRows(). Reproducible arithmetic + per-item
// coverage: strata-local/audit/scripts/trends_wellbeing_arithmetic.mjs
//
// WAVE COVERAGE VARIES BY ITEM (stated in each interpretation):
//   ex003_lonely    Waves 2,5,6 only    (compare W2->W6)
//   ls002a          Waves 1-4 only      (compare W1->W4; dropped after W4)
//   ls002l/d/c/h/i  Waves 1-6
//
// All 11 scope platforms have full coverage of each item's present waves
// AND n>=100, so the set is unchanged; WELLBEING_PLATFORM_SET_NOTE restates
// it with "every wave this item was asked" and carries the demographics-
// confound caveat (between-platform differences may track WHO uses each
// platform — Matt's framing; applies to every item, hence the footnote).
//
//   item (var) — measure (wave window)        significant movers (rest stable)
//   ----------------------------------------------------------------------
//   ex003_lonely — % lonely (W2->W6)              (6/11 stable)
//     fell: facebook -6.84, instagram -7.11, tiktok -8.95, youtube -4.87,
//           twitter_x -11.39 (each vs its pooled-SE threshold). Most
//           smaller platforms also edged down but within wider CIs; the
//           breadth reads as a society-wide decline in loneliness
//           (Matt-endorsed; report linked via furtherReading).
//   ls002l — satisfied w/ life (W1->W6)           (11/11 stable)
//   ls002a — satisfied w/ physical health (W1->W4)(11/11 stable)
//   ls002d — satisfied w/ mental health (W1->W6)  (10/11 stable)
//     rose: snapchat +8.76 vs 8.09 (marginal pass — reported per rule)
//   ls002c — satisfied w/ social life (W1->W6)    (10/11 stable)
//     rose: tiktok +12.70 vs 7.37
//   ls002h — happy most of the time (W1->W6)      (10/11 stable)
//     rose: instagram +6.21 vs 5.53 (marginal pass — reported per rule)
//   ls002i — feel negative (reverse; plotted band = "don't feel
//            negative"; W1->W6)                   (11/11 stable)
//
// Signed off by Matt 2026-06-20. NOTE: the panel re-interviews the SAME
// people each wave (>75% response, >95% platform retention for the big
// platforms), so wave-over-wave aggregate comparisons are valid — do NOT
// caveat these as "different respondents across waves."
// =====================================================================
export const WELLBEING_PLATFORM_SET_NOTE =
  'Platforms compared: Facebook, YouTube, Instagram, TikTok, Snapchat, ' +
  'Reddit, LinkedIn, X, Pinterest, Nextdoor, and Discord — traditional ' +
  'social platforms with adequate sample in every wave this item was ' +
  'asked. Differences between platforms may reflect who uses each platform ' +
  '(for example, TikTok’s users are on average far younger than ' +
  'Facebook’s) as much as the platforms themselves.';

// Matt's published reports, linked as "Further reading" under the relevant
// Well-Being interpretations for added context + credibility.
// UTM tags so referral traffic is attributable in the report owner's
// analytics (Matt drives readers to these from strata.mattmotyl.com).
const REPORT_UTM = '?utm_source=strata.mattmotyl.com&utm_medium=referral';
const LONELINESS_REPORT: FurtherReadingLink = {
  label: 'Social technology and loneliness',
  href: `https://psychoftech.substack.com/p/social-technology-and-loneliness${REPORT_UTM}`,
};
const WELLBEING_REPORT: FurtherReadingLink = {
  label: 'Well-being across social media platforms',
  href: `https://psychoftech.substack.com/p/well-being-across-social-media-platforms${REPORT_UTM}`,
};

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
        interpretation:
          'Among the social platforms compared, reporting a negative personal experience in the past four weeks is most common on X (Twitter) and Facebook in the most recent wave (about 22% and 19% of their users), with Nextdoor close behind (about 17%), and least common on Pinterest and Snapchat (about 1% and 3%). From Wave 1 to Wave 6, two platforms show a statistically meaningful change: the rate fell on TikTok (about 14% → 9%) and on Reddit (about 15% → 8%), both beyond their 95% margins of error. The other nine held steady. Each rate is among that platform’s own users.',
      },
      {
        key: 'bftw',
        kind: 'platformMetric',
        label: 'Content considered bad for the world',
        title: 'Content Considered Bad for the World',
        metric: 'bftw_rate',
        surveyVar: 'us007',
        filenameBase: 'strata_trends_bftw',
        interpretation:
          'Among the social platforms compared, reporting content considered bad for the world — misleading, hateful, or unnecessarily divisive — in the past four weeks is most common among X (Twitter) and Facebook users in the most recent wave (about 33% and 25%) and least common among Discord and Pinterest users (about 1% or below). No platform changes meaningfully from Wave 1 to Wave 6: every rate stays within its 95% margin of error, so these shares are best read as stable across the survey period. Each rate is among that platform’s own users.',
      },
      {
        key: 'mcxn',
        kind: 'platformMetric',
        label: 'Meaningful connections made',
        title: 'Meaningful Connections Made',
        metric: 'mcxn_rate',
        surveyVar: 'us010',
        filenameBase: 'strata_trends_mcxn',
        interpretation:
          'Among the social platforms compared, meaningful connections in the past four weeks are reported most often by Discord and Facebook users in the most recent wave (about 35% each), with Snapchat and Instagram close behind (about 30% and 25%), and least often by Nextdoor and Pinterest users (about 6% and 7%). No platform changes meaningfully from Wave 1 to Wave 6: each rate stays within its 95% margin of error across the survey period. Each rate is among that platform’s own users.',
      },
      {
        key: 'useful',
        kind: 'platformMetric',
        label: 'Learning something useful',
        title: 'Learning Something Useful',
        metric: 'useful_rate',
        surveyVar: 'us012',
        filenameBase: 'strata_trends_useful',
        interpretation:
          'Among the social platforms compared, learning something useful in the past four weeks is reported most often by YouTube and Reddit users in the most recent wave (about 51% and 48% of their users), with Pinterest close behind (about 42%), and least often by Snapchat users (about 6%). Two platforms show a statistically meaningful change from Wave 1 to Wave 6: the rate climbed on Reddit (about 30% → 48%) and on Nextdoor (about 11% → 19%), both beyond their 95% margins of error. The other nine held steady. Each rate is among that platform’s own users.',
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
        interpretation:
          'Among the social platforms compared, the share of users who score as lonely on the UCLA loneliness scale is highest for Discord and Snapchat users in the most recent wave (about 40% and 37%) and lowest for Nextdoor and X (Twitter) users (about 27%). This item was asked only in Waves 2, 5, and 6. From Wave 2 to Wave 6 the lonely share fell among users of several large platforms — Facebook, Instagram, TikTok, YouTube, and X — each beyond its 95% margin of error, and edged downward on most of the others within their wider margins of error. A decline this broad most likely reflects a society-wide drop in loneliness over the period rather than anything specific to any one platform.',
        furtherReading: [LONELINESS_REPORT],
      },
      {
        key: 'ls002l',
        kind: 'wellbeing',
        label: 'Overall life satisfaction',
        title: 'Overall Life Satisfaction',
        outcome: 'ls002l',
        bucket: 'agree',
        filenameBase: 'strata_trends_ls002l',
        interpretation:
          'Among the social platforms compared, agreement that “I am satisfied with my life” is high and broadly similar across platforms in the most recent wave — from about 82% of LinkedIn users at the top to about 67% of Discord users, with most clustered near 78%. No platform changes meaningfully from Wave 1 to Wave 6: every estimate stays within its 95% margin of error, so life satisfaction among each platform’s users is best read as stable across the survey period.',
        furtherReading: [WELLBEING_REPORT],
      },
      {
        key: 'ls002a',
        kind: 'wellbeing',
        label: 'Satisfied with physical health',
        title: 'Satisfaction With Physical Health',
        outcome: 'ls002a',
        bucket: 'agree',
        filenameBase: 'strata_trends_ls002a',
        interpretation:
          'Among the social platforms compared, agreement that “I am satisfied with my physical health” runs from about 68% of LinkedIn users down to about 49% of Discord users in the most recent wave this item was asked — Wave 4; the question was not carried in Waves 5 or 6. No platform changes meaningfully from Wave 1 to Wave 4: every estimate stays within its 95% margin of error, so these shares are best read as stable.',
        furtherReading: [WELLBEING_REPORT],
      },
      {
        key: 'ls002d',
        kind: 'wellbeing',
        label: 'Satisfied with mental health',
        title: 'Satisfaction With Mental Health',
        outcome: 'ls002d',
        bucket: 'agree',
        filenameBase: 'strata_trends_ls002d',
        interpretation:
          'Among the social platforms compared, agreement that “I am satisfied with my mental health” is highest among Nextdoor and LinkedIn users in the most recent wave (about 78% and 76%) and lowest among Discord users (about 54%). One platform changes meaningfully from Wave 1 to Wave 6: agreement rose among Snapchat users (about 60% → 68%, just beyond its 95% margin of error); the other ten were stable.',
        furtherReading: [WELLBEING_REPORT],
      },
      {
        key: 'ls002c',
        kind: 'wellbeing',
        label: 'Satisfied with social life',
        title: 'Satisfaction With Social Life',
        outcome: 'ls002c',
        bucket: 'agree',
        filenameBase: 'strata_trends_ls002c',
        interpretation:
          'Among the social platforms compared, agreement that “I am satisfied with my social life” is highest among Nextdoor, LinkedIn, and X (Twitter) users in the most recent wave (about 72%, 72%, and 69%) and lowest among Discord and Reddit users (about 55% and 61%). One platform changes meaningfully from Wave 1 to Wave 6: agreement rose sharply among TikTok users (about 54% → 67%, well beyond its 95% margin of error); the other ten were stable.',
        furtherReading: [WELLBEING_REPORT],
      },
      {
        key: 'ls002h',
        kind: 'wellbeing',
        label: 'Feels happy most of the time',
        title: 'Feeling Happy Most of the Time',
        outcome: 'ls002h',
        bucket: 'agree',
        filenameBase: 'strata_trends_ls002h',
        interpretation:
          'Among the social platforms compared, agreement that “I feel happy most of the time” is highest among LinkedIn and Nextdoor users in the most recent wave (about 76% and 75%) and lowest among Discord users (about 63%). One platform changes meaningfully from Wave 1 to Wave 6: agreement rose among Instagram users (about 67% → 73%, just beyond its 95% margin of error); the other ten were stable.',
        furtherReading: [WELLBEING_REPORT],
      },
      {
        key: 'ls002i',
        kind: 'wellbeing',
        label: 'Feels negative most of the time',
        title: 'Feeling Negative Most of the Time (Reverse-Coded)',
        outcome: 'ls002i',
        bucket: 'agree',
        filenameBase: 'strata_trends_ls002i',
        interpretation:
          'Among the social platforms compared, this item is reverse-coded, so the chart shows the share who do not agree that “I feel negative most of the time.” That share is highest among Nextdoor and LinkedIn users in the most recent wave (about 76% and 75%) and lowest among Discord users (about 57%). No platform changes meaningfully from Wave 1 to Wave 6: every estimate stays within its 95% margin of error, so these shares are best read as stable.',
        furtherReading: [WELLBEING_REPORT],
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
