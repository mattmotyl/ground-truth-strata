'use client';

import {
  computePlatformChanges,
  FindingPlatformRankedBar,
  type InterpretationContext,
} from './finding-platform-ranked-bar';

// =====================================================================
// Thin wrappers around FindingPlatformRankedBar — one per
// platform-comparison finding (#2-5 per PHASE4_UI_SPEC.md). Each
// finding differs only in metric + color scale + copy.
//
// All four interpretations follow Matt's significance rule
// (describeChange in src/lib/strata-formatters.ts): no claim of
// directional change unless |diff| > 1.96 * pooled SE. The
// interpretation builder calls computePlatformChanges() to fold the
// rule into the rendered text automatically.
// =====================================================================

// ---------------------------------------------------------------------
// Shared interp builder. Top-3-by-value platforms (n >= 200) get named
// up front; any platforms whose change vs. the earliest wave is
// statistically significant get an explicit "X declined" / "X
// increased" callout. Otherwise the change clause says "no platforms
// show a statistically meaningful shift." Suppressed and small-n
// platforms are noted as having wider CIs.
// ---------------------------------------------------------------------
function buildRankedInterpretation(
  ctx: InterpretationContext,
  metricNoun: string,
): string {
  const { selectedWave, meta } = ctx;
  const selectedDates =
    meta.waves.find((w) => w.wave === selectedWave)?.dates ?? '';
  const changes = computePlatformChanges(ctx);
  const eligible = changes.filter((c) => (c.selectedN ?? 0) >= 200);
  const top3 = eligible.slice(0, 3);
  const topNames =
    top3.length >= 3
      ? `${top3[0].label}, ${top3[1].label}, and ${top3[2].label}`
      : top3.map((c) => c.label).join(', ');
  const topRates =
    top3.map((c) => `${c.label} ${(c.selectedValue * 100).toFixed(1)}%`).join(', ');
  const significant = eligible.filter((c) => c.change !== 'stable');
  const earliest = changes[0]?.earliestWave ?? 1;
  let changeClause: string;
  if (changes.length === 0 || earliest === selectedWave) {
    changeClause = '';
  } else if (significant.length === 0) {
    changeClause =
      `No platforms (n ≥ 200) show a statistically meaningful change in ${metricNoun} from W${earliest} to W${selectedWave} at the 95% level.`;
  } else {
    const sigParts = significant.map((c) => {
      const dir = c.change === 'increased' ? 'higher' : 'lower';
      const earlierPct =
        c.earliestValue !== null
          ? `${(c.earliestValue * 100).toFixed(1)}%`
          : '—';
      const currentPct = `${(c.selectedValue * 100).toFixed(1)}%`;
      return `${c.label} is ${dir} (${earlierPct} → ${currentPct})`;
    });
    changeClause =
      `From W${earliest} to W${selectedWave}, ${significant.length} platform(s) show statistically meaningful shifts in ${metricNoun}: ${sigParts.join('; ')}. Remaining platforms in this view remained stable within the 95% margin of error.`;
  }
  const smallNPlatforms = changes
    .filter((c) => (c.selectedN ?? 0) < 200)
    .map((c) => c.label);
  const smallNClause =
    smallNPlatforms.length > 0
      ? ` Platforms with n < 200 in this wave (${smallNPlatforms.join(', ')}) appear in the chart but carry wider confidence intervals — interpret with care.`
      : '';
  return (
    `In W${selectedWave} (${selectedDates}), the platforms with the highest ${metricNoun} ` +
    `(among those with n ≥ 200) are ${topNames} — ${topRates}. ` +
    (changeClause ? changeClause + ' ' : '') +
    'Confidence intervals are shown as error bars at each bar tip and on hover.' +
    smallNClause
  );
}

// ---------------------------------------------------------------------
// Finding 02 — Where do bad things happen? (nux_rate, warm scale)
// ---------------------------------------------------------------------
export function Finding02NegativeExperiences() {
  return (
    <FindingPlatformRankedBar
      eyebrow="Finding 02 · Platform comparison"
      title="Where do bad things happen?"
      subtitle="Share of platform users reporting a recent negative personal experience on each platform."
      metric="nux_rate"
      colorScale="warm"
      citationTitle="Where do bad things happen? Platform negative-experience rates"
      variables={['us003 (nux)']}
      filenameBase="strata_platform_nux"
      buildInterpretation={(ctx) =>
        buildRankedInterpretation(
          ctx,
          'negative-experience rates',
        )
      }
    />
  );
}

// ---------------------------------------------------------------------
// Finding 03 — Where is content bad for the world? (bftw_rate, warm)
// ---------------------------------------------------------------------
export function Finding03BadForWorld() {
  return (
    <FindingPlatformRankedBar
      eyebrow="Finding 03 · Platform comparison"
      title="Where is content bad for the world?"
      subtitle="Share of platform users who say a platform’s content is bad for society."
      metric="bftw_rate"
      colorScale="warm"
      citationTitle="Where is content bad for the world? Platform bad-for-world rates"
      variables={['us007 (bftw)']}
      filenameBase="strata_platform_bftw"
      buildInterpretation={(ctx) =>
        buildRankedInterpretation(
          ctx,
          'bad-for-society rates',
        )
      }
    />
  );
}

// ---------------------------------------------------------------------
// Finding 04 — Where do people learn things? (useful_rate, cool scale)
// ---------------------------------------------------------------------
export function Finding04Useful() {
  return (
    <FindingPlatformRankedBar
      eyebrow="Finding 04 · Platform comparison"
      title="Where do people learn things?"
      subtitle="Share of platform users who say a platform is useful or informative."
      metric="useful_rate"
      colorScale="cool"
      citationTitle="Where do people learn things? Platform useful/informative rates"
      variables={['us012 (useful)']}
      filenameBase="strata_platform_useful"
      buildInterpretation={(ctx) =>
        buildRankedInterpretation(
          ctx,
          'useful-or-informative rates',
        )
      }
    />
  );
}

// ---------------------------------------------------------------------
// Finding 05 — Where do people connect? (mcxn_rate, cool scale)
// ---------------------------------------------------------------------
export function Finding05Connections() {
  return (
    <FindingPlatformRankedBar
      eyebrow="Finding 05 · Platform comparison"
      title="Where do people connect?"
      subtitle="Share of platform users reporting meaningful connections on each platform."
      metric="mcxn_rate"
      colorScale="cool"
      citationTitle="Where do people connect? Platform meaningful-connection rates"
      variables={['us010 (mcxn)']}
      filenameBase="strata_platform_mcxn"
      buildInterpretation={(ctx) =>
        buildRankedInterpretation(
          ctx,
          'meaningful-connection rates',
        )
      }
    />
  );
}
