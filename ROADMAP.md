# Ground Truth Strata — Roadmap

Deferred enhancements that are intentionally out of scope for v0.1.0.
Tracked here so they are not lost; none of these block the current
release.

## Deferred / future enhancements

- **/compare heatmap "Show top 8 / full table" toggle.** The Theme A
  drill-down heatmap renders the platforms currently chosen in the
  multiselect. A separate top-8 / full-table toggle (Chart Type #4 in
  PHASE4_UI_SPEC.md) is deferred — the platform multiselect already
  bounds the visible rows.
- **Glossary with tooltip underlines** (same pattern as
  show-me-the-data.com).
- **Box-and-whisker / violin plot** for political ideology per platform.
- **Multiple-comparison correction** (Bonferroni / FDR) for Finding 08.
- **Paired / repeated-measures SE** for longitudinal change claims
  (current significance rule uses the conservative independent-samples
  pooled SE).
- **Deep linking / URL state persistence** for theme, question, wave,
  platform selection, and zoom mode.
- **Grayscale-friendly fallback** for significance-colored bars.
- **Loading states / Suspense fallbacks** for the large JSON files
  beyond the current plain "Loading…" text.
