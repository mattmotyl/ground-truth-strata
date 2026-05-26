'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactElement } from 'react';
import {
  Finding02NegativeExperiences,
  Finding03BadForWorld,
  Finding04Useful,
  Finding05Connections,
} from '@/components/charts/findings-platforms';

interface FindingDef {
  slug: string;
  label: string;
  short: string;
  render: () => ReactElement;
}

const FINDINGS: FindingDef[] = [
  {
    slug: 'negative-experiences',
    label: 'Where do bad things happen?',
    short: 'Negative experiences',
    render: () => <Finding02NegativeExperiences />,
  },
  {
    slug: 'bftw',
    label: 'Where is content bad for the world?',
    short: 'Bad for society',
    render: () => <Finding03BadForWorld />,
  },
  {
    slug: 'useful',
    label: 'Where do people learn things?',
    short: 'Useful / informative',
    render: () => <Finding04Useful />,
  },
  {
    slug: 'connections',
    label: 'Where do people connect?',
    short: 'Meaningful connections',
    render: () => <Finding05Connections />,
  },
];

function PlatformsContent() {
  const params = useSearchParams();
  const requested = params.get('finding');
  const active =
    FINDINGS.find((f) => f.slug === requested) ?? FINDINGS[0];

  return (
    <>
      <nav
        aria-label="Platform-comparison findings"
        className="border-b border-mist bg-paper"
      >
        <div className="mx-auto max-w-6xl px-6 pt-6 pb-0">
          <p
            className="text-xs text-slate uppercase tracking-wide mb-3"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Platform comparison · pick a question
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {FINDINGS.map((f) => {
              const isActive = f.slug === active.slug;
              return (
                <li key={f.slug}>
                  <Link
                    href={`/platforms?finding=${f.slug}`}
                    className={
                      'inline-block pb-2 border-b-2 transition-colors ' +
                      (isActive
                        ? 'border-plum text-plum font-medium'
                        : 'border-transparent text-slate hover:text-plum')
                    }
                    style={{
                      fontFamily: isActive
                        ? 'var(--font-serif)'
                        : undefined,
                    }}
                  >
                    {f.short}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
      <div key={active.slug}>{active.render()}</div>
    </>
  );
}

export default function PlatformsPage() {
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
      <PlatformsContent />
    </Suspense>
  );
}
