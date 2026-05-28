import { Suspense } from 'react';
import { PlatformComparisonShell } from '@/components/platform-comparison-shell';

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Loading platform comparison…
        </div>
      }
    >
      <PlatformComparisonShell basePath="/compare" />
    </Suspense>
  );
}
