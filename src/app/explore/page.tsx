import { ExploreViews } from '@/components/charts/explore-views';

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // /explore offers two correlation views (see ExploreViews): Variable
  // pairs over time (any two respondent-level variables) and the full
  // Correlation matrix. The Platform correlations view is disabled in
  // v0.1 — see ExploreViews. The landing Start Here card deep-links the
  // matrix via ?tab=matrix.
  const sp = await searchParams;
  const tab = typeof sp.tab === 'string' ? sp.tab : undefined;
  return <ExploreViews initialTab={tab} />;
}
