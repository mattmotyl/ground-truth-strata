import type { Metadata } from 'next';
import Link from 'next/link';

// Root not-found: Next renders this (within the root layout, so it keeps
// the site header/footer) for the notFound() function AND for any unmatched
// URL across the app. Next auto-injects <meta name="robots" content=
// "noindex"> for the 404 status, so search engines skip it.
export const metadata: Metadata = {
  title: 'Page not found',
};

export default function NotFound() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 space-y-6">
      <p
        className="text-xs text-slate uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Error 404
      </p>
      <h1
        className="text-4xl text-plum"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        This page wandered off
      </h1>
      <p className="text-lg text-ink/80 leading-relaxed">
        We couldn&rsquo;t find the page you were looking for. It may have
        moved, or the link may be out of date. Try one of the data explorers
        instead:
      </p>
      <ul className="text-sm text-ink/85 space-y-1 list-disc list-outside ml-5">
        <li>
          <Link href="/trends" className="text-mulberry hover:text-plum">
            Trends
          </Link>{' '}
          &mdash; how measures change across the six waves
        </li>
        <li>
          <Link href="/platforms" className="text-mulberry hover:text-plum">
            Platforms
          </Link>{' '}
          &mdash; a profile of each platform
        </li>
        <li>
          <Link href="/compare" className="text-mulberry hover:text-plum">
            Compare
          </Link>{' '}
          &mdash; rank platforms on a measure
        </li>
        <li>
          <Link href="/explore" className="text-mulberry hover:text-plum">
            Explore
          </Link>{' '}
          &mdash; correlations between measures
        </li>
      </ul>
      <p className="text-sm text-slate">
        <Link href="/" className="text-mulberry hover:text-plum">
          &larr; Back to Strata
        </Link>{' '}
        &middot;{' '}
        <Link href="/about" className="text-mulberry hover:text-plum">
          Read the methodology
        </Link>
      </p>
    </section>
  );
}
