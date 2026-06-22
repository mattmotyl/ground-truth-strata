'use client';

// Route-segment error boundary. Per Next 16.2, error boundaries must be
// Client Components, and the retry prop is `unstable_retry` (the older
// `reset` is superseded). This wraps every page/segment under the root
// layout; the root layout itself is not covered (would need global-error).

import { useEffect } from 'react';
import Link from 'next/link';

export default function RouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface the error in the console for debugging. In production the
    // message is hidden, but `error.digest` matches the server-side log.
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 space-y-6">
      <p
        className="text-xs text-slate uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Something went wrong
      </p>
      <h1
        className="text-4xl text-plum"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        This view hit an unexpected error
      </h1>
      <p className="text-lg text-ink/80 leading-relaxed">
        Sorry &mdash; something broke while loading this page. You can try
        again, or head back to one of the data explorers.
      </p>
      {error.digest ? (
        <p
          className="text-xs text-slate"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="inline-block rounded-md bg-plum px-4 py-2 text-sm text-paper font-medium hover:bg-mulberry transition-colors"
        >
          Try again
        </button>
        <Link href="/" className="text-sm text-mulberry hover:text-plum">
          &larr; Back to Strata
        </Link>
      </div>
    </section>
  );
}
