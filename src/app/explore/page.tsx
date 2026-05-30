import { ExploreViews } from '@/components/charts/explore-views';

export default function ExplorePage() {
  // /explore offers three correlation views (see ExploreViews):
  // Platform correlations (Finding 08), Variable pairs (any two
  // respondent-level variables), and the full Correlation matrix.
  return <ExploreViews />;
}
