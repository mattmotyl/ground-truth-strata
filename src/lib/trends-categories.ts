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
  | 'attitudeDistribution' // distributions.json diverging Likert bars
  | 'attitudeByGroup'; // group_comparisons.json by-respondent-group means

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

// A respondent-group breakout for the attitudeByGroup renderer. `groups`
// lists the exact group values (as they appear in group_comparisons.json)
// in display order. Party is intentionally absent (W1-3 only).
export interface GroupingDef {
  key: string; // URL token + state key, e.g. 'ideology'
  label: string; // selector label, e.g. 'Ideology'
  groupingVar: string; // group_comparisons.json grouping_var
  groups: string[]; // exact group values, display order
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
  // attitudeSingle / attitudeDistribution:
  variable?: string;
  // attitudeDistribution: the 5 response-category labels, in disagree ->
  // agree (or much-less -> much-more) order, matching the distributions.json
  // bin_index order for this item.
  optionLabels?: string[];
  // attitudeByGroup: the two outcome variables shown as side-by-side
  // small-multiple panels, each split by the selected respondent group.
  vars?: [string, string];
  panelTitles?: [string, string];
  valueDomain?: [number, number];
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

// Response-category labels for the attitudeDistribution (diverging Likert)
// items, in distributions.json bin_index order (disagree -> agree). The
// social-media-belief battery (sc001a-f) uses a standard 5-point
// agree/disagree scale; tech regulation (ex004a) uses its own much-less ->
// much-more scale, so it carries a distinct label set.
const AGREE_DISAGREE_5 = [
  'Strongly disagree',
  'Disagree',
  'Neither agree nor disagree',
  'Agree',
  'Strongly agree',
];
const REGULATION_5 = [
  'Much less than they are now',
  'A little less than they are now',
  'The same as they are now',
  'A little more than they are now',
  'Much more than they are now',
];

// Respondent-group breakouts offered by the attitudeByGroup renderer
// (feeling thermometers + comfort-having-friends). Ideology is the default;
// the others are demographic. Group values match group_comparisons.json
// exactly. Party (pol_incl_leaners) is intentionally excluded — it was
// asked in Waves 1-3 only.
export const ATTITUDE_GROUPINGS: GroupingDef[] = [
  {
    key: 'ideology',
    label: 'Ideology',
    groupingVar: 'political_ideology_group',
    groups: ['Liberal', 'Moderate', 'Conservative'],
  },
  { key: 'gender', label: 'Gender', groupingVar: 'gender', groups: ['Men', 'Women'] },
  {
    key: 'age',
    label: 'Age',
    groupingVar: 'age',
    groups: ['18-29', '30-44', '45-59', '60+'],
  },
  {
    key: 'education',
    label: 'Education',
    groupingVar: 'education',
    groups: [
      'Grade School / Some High School',
      'High School Diploma',
      'Some College',
      'College Degree / Post-grad',
    ],
  },
  {
    key: 'race',
    label: 'Race',
    groupingVar: 'race',
    groups: [
      'White, non-Hispanic',
      'Black, non-Hispanic',
      'Hispanic',
      'Asian, non-Hispanic',
      'Other/Multiple races, non-Hispanic',
    ],
  },
];

// Matt's published political-attitudes reports, linked as "Further reading"
// under the thermometers / friends / rate_self interpretations (the
// political items). UTM-tagged via REPORT_UTM for referral attribution.
const SOCIAL_MEDIA_POLITICS_2023: FurtherReadingLink = {
  label: 'Social media and politics, 2023',
  href: `https://psychoftech.substack.com/p/social-media-and-politics-from-2023${REPORT_UTM}`,
};
const POLITICAL_ATTITUDES_ON_SM: FurtherReadingLink = {
  label: 'Political attitudes on social media',
  href: `https://psychoftech.substack.com/p/political-attitudes-on-social-media${REPORT_UTM}`,
};

// =====================================================================
// SIGNIFICANCE-GATED INTERPRETATION COPY — Attitudes. Same describeChange
// rule as the other categories. Three source shapes:
//  - thermometers/friends (attitudeByGroup): group_comparisons.json MEANS
//    by respondent group, 0–10, all six waves. Per-group verdicts via
//    describeChange(meanW1, seW1, meanWlast, seWlast).
//  - sc001a–f / ex004a (attitudeDistribution): % per response category from
//    distributions.json; the directional verdict is MEAN-gated from
//    trends.json (weighted_mean/se), because a rigorous top-box proportion
//    SE is not precomputed. The % are shown descriptively (Matt prefers
//    de-emphasizing inferential stats and approved this).
//  - rate_self (attitudeSingle): population mean, 0–100, all six waves.
//
// WAVE WINDOWS (stated in each interpretation): thermometers / friends /
// rate_self = W1–6; sc001a–f = W1–2 only; ex004a = W5–6 only.
//
//   item — measure                         verdict (movers)
//   ----------------------------------------------------------------------
//   thermometers by ideology, 0–10: in-group ~7.5 vs out-group ~4.2, gap
//     ~3.3 FLAT W1–6; only mover = liberals' warmth toward conservatives
//     +0.38 (3.21->3.59) UP.
//   friends by ideology, 0–10: all groups STABLE; asymmetry — liberals'
//     own-vs-other gap 3.0 > conservatives' 2.2.
//   sc001a waste of time:    stable (2.98->2.91); disagree 28->35% (n.s.)
//   sc001b strengthens rel:  INCREASED (2.87->3.03); agree 26->33%
//   sc001c facilitates learn:INCREASED (2.95->3.07); agree 27->34%
//   sc001d good at managing: stable (3.76->3.80); ~72% agree
//   sc001e in control:       stable (3.98->4.02); ~81% agree (highest)
//   sc001f hard to resist:   stable (2.61->2.63); ~48% disagree
//   ex004a tech regulation (W5–6): stable (3.39->3.37); ~49% want more
//   rate_self ideology 0–100: stable (~52 every wave)
//
// Signed off by Matt 2026-06-21. UAS is a longitudinal panel (same people
// re-interviewed each wave), so wave-over-wave aggregate comparisons are
// valid — no cross-sectional caveat. Reproducible arithmetic:
//   strata-local/audit/scripts/attitudes_friends_breakout.mjs
//   strata-local/audit/scripts/trends_attitudes_arithmetic.mjs
//   strata-local/audit/scripts/attitudes_breakout_preview.mjs
// =====================================================================

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
        kind: 'attitudeByGroup',
        label: 'Feeling thermometers (by group)',
        title: 'Warmth Toward Liberals and Conservatives',
        vars: ['scim_therm_lib', 'scim_therm_con'],
        panelTitles: ['Warmth toward liberals', 'Warmth toward conservatives'],
        valueDomain: [0, 10],
        axisAnchors: [
          { value: 0, label: 'very cold' },
          { value: 10, label: 'very warm' },
        ],
        filenameBase: 'strata_trends_thermometers',
        interpretation:
          'One way to measure attitudes toward groups is to ask people how warm or cold they feel toward those groups on a 0 to 10 scale, where higher numbers mean more warmth (liking) and lower numbers mean more coldness (disliking), and 5 is neutral. Across everyone in the study, average warmth toward liberals and toward conservatives both sit near the midpoint and barely move across the six waves (warmth toward liberals runs about 5.7 to 5.9, toward conservatives about 5.6 to 5.8). That overall average hides a wide partisan split. Grouped by the respondent’s own ideology, people rate their own side warmly and the other side coldly: by the most recent wave liberals give liberals 7.1 and conservatives 3.6, while conservatives give conservatives 7.9 and liberals 4.8, and moderates sit in between on both (5.9 and 5.6). The distance between how warmly people rate their own side versus the other side averages about 3.3 points and is essentially flat across all six waves. The one change large enough to be statistically meaningful is liberals’ warmth toward conservatives edging up from 3.2 to 3.6, a slight narrowing, though the gap between the parties stays large. The same question can also be broken out by gender, age, education, or race.',
        furtherReading: [SOCIAL_MEDIA_POLITICS_2023, POLITICAL_ATTITUDES_ON_SM],
      },
      {
        key: 'friends',
        kind: 'attitudeByGroup',
        label: 'Comfort having friends (by group)',
        title: 'Comfort Having Liberal and Conservative Friends',
        vars: ['scim_friends_lib', 'scim_friends_con'],
        panelTitles: [
          'Comfort with liberal friends',
          'Comfort with conservative friends',
        ],
        valueDomain: [0, 10],
        axisAnchors: [
          { value: 0, label: 'not comfortable at all' },
          { value: 10, label: 'extremely comfortable' },
        ],
        filenameBase: 'strata_trends_friends',
        interpretation:
          'People were also asked how comfortable they would be having friends who are liberal and friends who are conservative, each on a 0 to 10 scale where higher numbers mean more comfort. Across everyone in the study, people report fairly high comfort with both liberal friends (about 6.9) and conservative friends (about 6.7), and neither average moves across the six waves. Split by the respondent’s own ideology, everyone is most comfortable with same-side friends, and the two sides are not symmetric: by the most recent wave liberals report 7.6 comfort with liberal friends versus 4.6 with conservative friends, an own-versus-other gap of 3.0 points, while conservatives report 8.5 with conservative friends versus 6.3 with liberal friends, a gap of 2.2 points. In other words, conservatives report being more comfortable with friends on the other side than liberals do. None of these group trends shows a statistically meaningful change across the waves, so the pattern holds steady throughout. The same question can also be broken out by gender, age, education, or race.',
        furtherReading: [SOCIAL_MEDIA_POLITICS_2023, POLITICAL_ATTITUDES_ON_SM],
      },
      {
        key: 'sc001a',
        kind: 'attitudeDistribution',
        variable: 'sc001a',
        optionLabels: AGREE_DISAGREE_5,
        filenameBase: 'strata_trends_sc001a',
        interpretation:
          'Few people see social media as a waste of their time: about a quarter agree that it is (25%), roughly 40% are neutral, and around a third disagree (35%). The share disagreeing rose somewhat across the period (28% to 35%) as fewer people stayed in the neutral middle, though the average did not shift by enough to be statistically meaningful, leaving the item broadly stable. These figures come from the first two waves of the study, the only waves in which this question was asked.',
      },
      {
        key: 'sc001b',
        kind: 'attitudeDistribution',
        variable: 'sc001b',
        optionLabels: AGREE_DISAGREE_5,
        filenameBase: 'strata_trends_sc001b',
        interpretation:
          'Views that social media strengthens and supports relationships became more positive: agreement rose from 26% to 33% while disagreement fell from 31% to 26%, a change large enough to be statistically meaningful in the item’s average. Even so, a plurality (40%) remained neutral. These figures come from the first two waves of the study, the only waves in which this question was asked.',
      },
      {
        key: 'sc001c',
        kind: 'attitudeDistribution',
        variable: 'sc001c',
        optionLabels: AGREE_DISAGREE_5,
        filenameBase: 'strata_trends_sc001c',
        interpretation:
          'The sense that social media facilitates learning and growth strengthened: agreement rose from 27% to 34% while disagreement fell from 27% to 24%, a change large enough to be statistically meaningful in the item’s average. A plurality (42%) remained neutral. These figures come from the first two waves of the study, the only waves in which this question was asked.',
      },
      {
        key: 'sc001d',
        kind: 'attitudeDistribution',
        variable: 'sc001d',
        optionLabels: AGREE_DISAGREE_5,
        filenameBase: 'strata_trends_sc001d',
        interpretation:
          'Most people credit themselves with managing their social-media use well: about 72% agree, roughly a fifth are neutral, and fewer than 1 in 10 disagree. The average holds steady, with no statistically meaningful change. These figures come from the first two waves of the study, the only waves in which this question was asked.',
      },
      {
        key: 'sc001e',
        kind: 'attitudeDistribution',
        variable: 'sc001e',
        optionLabels: AGREE_DISAGREE_5,
        filenameBase: 'strata_trends_sc001e',
        interpretation:
          'People overwhelmingly feel in control of how they use social media: about 81% agree that they are, while only about 5% disagree and the rest are neutral. The average holds steady, with no statistically meaningful change. These figures come from the first two waves of the study, the only waves in which this question was asked.',
      },
      {
        key: 'sc001f',
        kind: 'attitudeDistribution',
        variable: 'sc001f',
        optionLabels: AGREE_DISAGREE_5,
        filenameBase: 'strata_trends_sc001f',
        interpretation:
          'Opinion is divided on how hard social media is to resist: about a quarter (25%) agree they find it hard to resist, while roughly half (48%) disagree and the rest are neutral. The average is unchanged, with no statistically meaningful movement. These figures come from the first two waves of the study, the only waves in which this question was asked.',
      },
      {
        key: 'ex004a',
        kind: 'attitudeDistribution',
        title: 'How Much Should Major Technology Companies Be Regulated?',
        variable: 'ex004a',
        optionLabels: REGULATION_5,
        filenameBase: 'strata_trends_ex004a',
        interpretation:
          'Opinion leans toward more government oversight of major technology companies: about half (49%) want them regulated more than they are now (33% a little more, 17% much more), about 31% want regulation kept the same, and roughly 1 in 5 (20%) want less. This balance is stable across the period, with no statistically meaningful change. Respondents answered on a scale running from much less to much more regulation, and the question was asked only in the fifth and sixth waves of the study.',
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
        interpretation:
          'Respondents placed themselves on a 0 to 100 scale where 0 is the most liberal and 100 is the most conservative. The average sits almost exactly at the midpoint, about 52, and stays there across all six waves, never moving more than a point. In other words, the public’s average political self-placement held steady over the period, with the typical respondent describing themselves as squarely in the middle.',
        furtherReading: [SOCIAL_MEDIA_POLITICS_2023, POLITICAL_ATTITUDES_ON_SM],
      },
    ],
  },
];

export function getTrendsCategory(id: string): TrendsCategory {
  return TRENDS_CATEGORIES.find((c) => c.id === id) ?? TRENDS_CATEGORIES[0];
}
