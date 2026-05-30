import { ExploreViews } from '@/components/charts/explore-views';

export default function ExplorePage() {
  // /explore offers two correlation views (see ExploreViews): Variable
  // pairs over time (any two respondent-level variables) and the full
  // Correlation matrix. The Platform correlations view is disabled in
  // v0.1 — see ExploreViews.
  return <ExploreViews />;
}
