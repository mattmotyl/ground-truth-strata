'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ReactElement } from 'react';
import {
  Finding02NegativeExperiences,
  Finding03BadForWorld,
  Finding04Useful,
  Finding05Connections,
} from '@/components/charts/findings-platforms';
import { FindingPoliticalSkew } from '@/components/charts/finding-political-skew';

interface FindingDef {
  slug: string;
  label: string;
  short: string;
  render: () => ReactElement;
}

const FINDINGS: FindingDef[] = [
  {
    slug: 'negative-experiences',
    label: 'Where do people have negative personal experiences?',
    short: 'Negative experiences',
    render: () => <Finding02NegativeExperiences />,
  },
  {
    slug: 'bftw',
    label: 'Where is content bad for the world?',
    short: 'Bad for the world',
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
  {
    slug: 'political-composition',
    label: 'Which platforms are most politically skewed?',
    short: 'Political skew',
    render: () => <FindingPoliticalSkew />,
  },
];

interface PlatformComparisonShellProps {
  // Route prefix used to build the finding-tab <Link href={...}> targets
  // ("/platforms" or "/compare" during the T3-B2/B3 staging window).
  // The selected finding is read from `?finding=` via useSearchParams()
  // below — basePath ONLY affects outgoing tab-link hrefs, not the
  // current selection state. Same shell + same URL query = same render
  // on both routes.
  basePath: string;
}

export function PlatformComparisonShell({
  basePath,
}: PlatformComparisonShellProps) {
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
                    href={`${basePath}?finding=${f.slug}`}
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
