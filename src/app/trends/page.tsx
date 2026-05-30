import { TrendsExplorer } from '@/components/charts/trends-explorer';

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // T3-B7: /trends opens on Finding 1 ("Who uses what?") by default and
  // offers a category → question picker. The landing Start Here cards
  // deep-link via ?category=<id>&q=<questionKey> (e.g.
  // /trends?category=platform&q=nux). Invalid values fall back to the
  // platform/usage default inside TrendsExplorer.
  const sp = await searchParams;
  const category = typeof sp.category === 'string' ? sp.category : undefined;
  const q = typeof sp.q === 'string' ? sp.q : undefined;
  return <TrendsExplorer initialCategory={category} initialQuestion={q} />;
}
