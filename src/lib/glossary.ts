// Single source of truth for Strata's plain-language glossary.
//
// DEFENSIBILITY CONTRACT (see strata-local/specs/2026-05-30-glossary-design.md):
//   - `status: 'final'` entries have a `long` lifted VERBATIM from Matt's
//     already-approved /about prose. The `short` (tooltip) is a trimmed
//     sentence drawn from that same approved prose — a condensation, not new
//     wording.
//   - `status: 'draft'` entries are Claude-drafted core definitions awaiting
//     Matt's sign-off; the /glossary page flags them with a DRAFT strip.
//   - The `example` field is ALWAYS a Claude-authored, review-pending
//     pedagogical illustration (it may carry light humor per the spec Goal),
//     regardless of the core's status. The page renders it in a visually
//     distinct callout and carries a blanket "examples are being reviewed"
//     note so it never reads as Matt's finalized voice.
//
// Do not promote a `draft` entry to `final`, or treat an `example` as
// reviewed, without Matt's explicit sign-off.

export type GlossaryStatus = 'final' | 'draft';

export interface GlossaryEntry {
  /** URL anchor + GlossaryTerm key. kebab-case. */
  slug: string;
  /** Display name, e.g. "Spearman's ρ". */
  term: string;
  /** One sentence shown in the inline tooltip. */
  short: string;
  /** Full core definition shown on /glossary. */
  long: string;
  /** Accessible worked example; Claude-authored, review-pending. */
  example?: string;
  /** Status of the CORE (`long`). Examples are review-pending regardless. */
  status: GlossaryStatus;
  /** Provenance note for the core definition. */
  source?: string;
  /** Slugs to cross-link from this entry. */
  related?: string[];
}

// Ordered by slug here for maintenance; the page sorts by `term` for display.
export const GLOSSARY: GlossaryEntry[] = [
  {
    slug: 'confidence-interval',
    term: '95% confidence interval',
    short:
      'A range around an estimate that reflects sampling uncertainty; Strata reports the 95% version.',
    long: 'A confidence interval is a range around a survey estimate that reflects sampling uncertainty — the fact that we surveyed a sample, not every American. A 95% confidence interval is constructed so that, across many repeated samples, about 95% of such intervals would contain the true population value. Wider intervals signal more uncertainty (often from smaller samples); narrower intervals signal more precision. It is not the probability that the true value falls inside this one particular interval.',
    example:
      'If we estimate 62% of adults use a platform with a 95% interval of 59%–65%, read it as: "our best guess is 62%, and the true number is very plausibly somewhere between 59 and 65." It is the estimate wearing a margin of safety rather than pretending to be a single exact number — the honest version of "about 62%, give or take."',
    status: 'draft',
    related: ['margin-of-error', 'weighted-estimate'],
  },
  {
    slug: 'effect-size',
    term: 'Effect size (correlation magnitude)',
    short:
      'How big an association is, apart from its direction. For correlations Strata reads |ρ| as negligible (< 0.1), weak (0.1–0.3), moderate (0.3–0.5), or strong (≥ 0.5).',
    long: 'An effect size measures how large a relationship is, separately from whether it is statistically detectable. For the correlations in Strata, the relevant effect size is the magnitude of ρ — how far it sits from zero, regardless of sign. Strata reads |ρ| in four bands: negligible (below 0.1), weak (0.1 to 0.3), moderate (0.3 to 0.5), and strong (0.5 or above). Negligible associations are drawn in muted grey so that noise-level relationships do not read as findings. In practice, correlations in survey data like this tend to be modest: most here fall below 0.4, so a “moderate” association is often the strongest you will encounter — which is normal, not disappointing.',
    example:
      'Direction tells you which way two things move together; effect size tells you how much. A ρ of 0.05 is technically positive but so faint that it may just be a mirage in the data. A ρ of 0.45 is a real, noticeable pull. With a big enough sample, even the mirage can become “statistically significant” — which is exactly why we also look at magnitude. Significance says “it is probably not zero”; effect size asks “but is it big enough to care about?”',
    status: 'draft',
    source: 'Bands match Strata’s correlation color bands (explore-adapters.ts).',
    related: ['spearman', 'point-biserial'],
  },
  {
    slug: 'effective-sample-size',
    term: 'Effective sample size',
    short:
      'The "real" sample size after weighting — usually smaller than the headcount, reflecting lost precision.',
    long: 'When responses are weighted, they no longer all count equally, so a weighted estimate behaves as if it came from a smaller sample than the raw headcount. The effective sample size (sometimes written n_eff) is that adjusted number — it captures how much statistical precision remains after weighting. The more uneven the weights, the further the effective sample size falls below the actual number of respondents.',
    example:
      'Picture a tug-of-war where some players are far stronger than others. Even with 1,000 people on the rope, if a handful do most of the pulling it "effectively" behaves like a smaller, lopsided team. Weighting can do the same to a sample: 1,000 respondents might carry the statistical weight of, say, 700. Strata reports the honest ~700, not the flattering 1,000.',
    status: 'draft',
    related: ['weighted-estimate'],
  },
  {
    slug: 'margin-of-error',
    term: 'Margin of error',
    short:
      'Half the width of the 95% confidence interval — the "± so many points" around an estimate.',
    long: 'The margin of error is the "± value" you add to and subtract from an estimate to get its 95% confidence interval. It packs sampling uncertainty into a single number: a result of 62% with a ±3-point margin of error means the 95% interval runs from roughly 59% to 65%. Margins of error shrink as sample size grows, and they say nothing about non-sampling problems such as poorly worded questions.',
    example:
      'It is the "give or take" attached to a poll: "62%, give or take 3 points" is a margin of error of 3. When two numbers sit within each other\'s margins of error, treating one as clearly bigger than the other is exactly how people end up confidently wrong on election night.',
    status: 'draft',
    related: ['confidence-interval'],
  },
  {
    slug: 'point-biserial',
    term: 'Point-biserial correlation',
    short:
      'A correlation between a yes/no variable and a numeric one — a special case of the ordinary correlation.',
    long: 'A point-biserial correlation measures the association between a binary variable (e.g., uses a platform: yes/no) and a continuous or ordinal one (e.g., a wellbeing score). It is algebraically the Pearson correlation with one variable coded 0/1, and it ranges from −1 to +1. It answers a simple question: do the "1"s tend to score higher or lower than the "0"s, and how consistently?',
    example:
      'Split people into coffee-drinkers (1) and non-drinkers (0) and compare their typing speeds. A positive point-biserial means drinkers tend to type faster; negative means slower. Same idea as any correlation — one of the two variables just happens to be a plain yes/no switch.',
    status: 'draft',
    related: ['spearman', 'effect-size'],
  },
  {
    slug: 'reverse-coded',
    term: 'Reverse-coded',
    short:
      'A scale whose direction was flipped during cleaning so the numbers line up consistently; the UI does not re-flip.',
    long: 'Where the underlying scale is reverse-coded, the flip is applied at the cleaning stage; the UI does not need to re-flip.',
    example:
      'Some survey questions are worded backwards on purpose — "I feel calm" mixed in among "I feel anxious" — so people do not just autopilot the same answer down the page. Before analysis, those flipped items are turned back around so that "higher" always means the same direction (say, more distress). Reverse-coding is simply un-flipping the questions that were flipped on purpose. Yes, researchers do this to themselves voluntarily.',
    status: 'final',
    source: '/about → Correlations',
    related: ['spearman'],
  },
  {
    slug: 'spearman',
    term: "Spearman's ρ",
    short:
      "All correlations in Strata are Spearman's ρ, computed per wave; it suits ordinal and skewed variables and does not assume a straight-line relationship.",
    long: "All pairwise correlations in Strata are Spearman's ρ, computed per wave. Spearman handles ordinal Likert and skewed count variables better than Pearson and does not assume a linear relationship. Where the underlying scale is reverse-coded, the flip is applied at the cleaning stage; the UI does not need to re-flip. Correlation is not causation, and small samples or small ρ values should be interpreted with caution.",
    example:
      'Think of ρ as a number between −1 and +1. Positive means the two things rise together: as one score goes up, so does the other (more coffee, faster typing — allegedly). Negative means they move in opposite directions (more coffee, fewer hours of sleep — definitely). Near 0 means they are basically ignoring each other. And "ρ" is just the Greek letter rho; statisticians like Greek letters because they make ordinary ideas look more intimidating than they are.',
    status: 'final',
    source: '/about → Correlations',
    related: ['reverse-coded', 'effect-size'],
  },
  {
    slug: 'suppression',
    term: 'Suppression (n < 30)',
    short:
      'Cells based on fewer than 30 respondents are suppressed (hidden) by design.',
    long: "Cells with fewer than 30 respondents are suppressed by design. This is because statistics based on small samples are at a higher risk of being unreliable and misleading the viewer. Given the broad interest in social media and the contentious debates around the effects of social media on people, we chose to suppress cases from the graphs where the sample size was too small for us to trust. Throughout Strata, these instances are marked with an “insufficient n” label.",
    example:
      'Imagine describing "the average opinion" of a group when only four people answered — one person having a weird morning could swing the whole result. To avoid big conclusions from tiny groups, Strata simply hides any cell with fewer than 30 people instead of showing a number it does not trust. Better an honest blank than a confident wrong answer.',
    status: 'final',
    source: '/about → Suppression',
  },
  {
    slug: 'tertile',
    term: 'Tertile / fixed split',
    short: 'Cut points that divide people into three groups (low / middle / high).',
    long: 'Tertiles split a measure into three groups. With sample-based tertiles, the cut points are chosen so each wave’s respondents divide into roughly equal thirds. With a fixed split, the cut points are held constant across waves so the groups mean the same thing over time, even if their sizes differ. These types of splits are often more informative than simply splitting the data on a fixed threshold (e.g., the middle point of the distribution). Strata notes which approach a chart uses, because it changes how comparisons across waves should be read.',
    example:
      'Like sorting a class into bottom third, middle third, and top third by score. "Tertile" is just the fancy word for those thirds — quartiles cut into four, tertiles into three. No one will judge you for picturing three buckets.',
    status: 'draft',
  },
  {
    slug: 'wave',
    term: 'Wave',
    short:
      'One round of data collection in the panel; Strata covers six waves collected between 2023 and 2025.',
    long: 'For longitudinal panel surveys, the same group of people are surveyed at multiple points in time. Each point in time represents a wave. Currently, Strata covers six waves of the Understanding America Study (UAS514–UAS519), collected between 2023 and 2025. Each wave has its own field dates and sample size; the About page lists the full table.',
    example:
      'Imagine marking a child’s height on the same doorframe every birthday. Each mark is one wave — the same person, the same measurement, taken again at a new point in time — and lining the marks up is how you see growth. Strata does this with attitudes instead of height: the same panel of people answer the same kinds of questions at six points between 2023 and 2025, so we can see what shifted and what held steady. The key is that it is the same people each time, which is what lets us track change rather than just compare different crowds.',
    status: 'final',
    source: '/about → Survey waves',
  },
  {
    slug: 'weighted-estimate',
    term: 'Weighted estimate',
    short:
      'An estimate adjusted with UAS probability weights so it generalizes to U.S. adults at the time of each wave.',
    long: 'Every precomputed row carries weighted estimates (weighted_value, with matching standard errors, confidence intervals, and effective sample sizes). UAS provides probability weights to adjust for panel design and non-response; weighted estimates are generalizable to U.S. adults at the time of each wave.',
    example:
      'A survey sample is rarely a perfect mini-America — maybe it has too many night owls and not enough early risers. Weighting nudges each response up or down so the final picture matches the real population. It is like adjusting a recipe when you accidentally bought the giant eggs and you may need to reduce the total number of eggs you use (because each giant egg contains more than regular-sized eggs) so the cake still comes out right. Not that I have ever done this myself. Okay, you caught me — I have done this myself. But I promise I only do it with cake, not survey data.',
    status: 'final',
    source: '/about → Weighting',
    related: ['effective-sample-size'],
  },
];

const BY_SLUG: Map<string, GlossaryEntry> = new Map(
  GLOSSARY.map((entry) => [entry.slug, entry]),
);

/** Look up a glossary entry by slug. Returns undefined if absent. */
export function getGlossaryEntry(slug: string): GlossaryEntry | undefined {
  return BY_SLUG.get(slug);
}

/** Entries sorted alphabetically by display term, for the /glossary page. */
export function getGlossarySorted(): GlossaryEntry[] {
  return [...GLOSSARY].sort((a, b) =>
    a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }),
  );
}
