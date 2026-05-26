import Image from 'next/image';
import Link from 'next/link';
import { StartHereBand } from '@/components/start-here-band';

export default function HomePage() {
  return (
    <>
      <section className="border-b border-mist">
        <div className="mx-auto max-w-6xl px-6 py-14 grid gap-10 lg:grid-cols-2 items-center">
          <Image
            src="/images/strata-hero-transparent.webp"
            alt="Ground Truth Strata"
            width={1253}
            height={1253}
            priority
            className="w-64 sm:w-72 lg:w-[22rem] h-auto mx-auto lg:mx-0"
          />
          <div className="space-y-5">
            <h1
              className="text-4xl sm:text-5xl text-plum leading-tight"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              A data tool for serious questions about social media and
              technology.
            </h1>
            <p className="text-lg text-ink/80 leading-relaxed max-w-2xl">
              Strata lets researchers, policymakers, lawyers,
              journalists, and curious people explore findings from a
              six-wave longitudinal survey of U.S. adults conducted
              between 2023 and 2025.
            </p>
          </div>
        </div>
      </section>

      <section
        className="border-b border-mist bg-mist/30"
        aria-labelledby="before-you-dig-in-heading"
      >
        <div className="mx-auto max-w-6xl px-6 py-10 grid gap-6 lg:grid-cols-[1fr_2fr] items-start">
          <h2
            id="before-you-dig-in-heading"
            className="text-2xl text-plum"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Before you dig in
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2 text-sm text-ink/85">
            <li className="flex gap-3">
              <span
                aria-hidden
                className="text-mulberry shrink-0"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                01
              </span>
              <span>
                Pick a question from <em>Start here</em>, or jump to an
                explorer in the nav.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="text-mulberry shrink-0"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                02
              </span>
              <span>
                Charts default to <em>weighted</em> estimates with 95%
                confidence intervals. Toggle as needed.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="text-mulberry shrink-0"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                03
              </span>
              <span>
                Read the <em>What the numbers mean</em> column for
                plain-language context. Every chart shows its{' '}
                <em>n</em> and methodology footnote.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="text-mulberry shrink-0"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                04
              </span>
              <span>
                Cells with fewer than 30 respondents are suppressed by
                design.{' '}
                <Link
                  href="/about"
                  className="text-mulberry hover:text-plum underline"
                >
                  Read the methodology →
                </Link>
              </span>
            </li>
          </ol>
        </div>
      </section>

      <StartHereBand />

      <section className="border-t border-mist">
        <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-slate">
          <p>
            Or use the navigation above to explore{' '}
            <Link href="/trends" className="text-mulberry hover:text-plum">
              trends over time
            </Link>
            ,{' '}
            <Link
              href="/platforms"
              className="text-mulberry hover:text-plum"
            >
              platform comparisons
            </Link>
            ,{' '}
            <Link href="/groups" className="text-mulberry hover:text-plum">
              demographic differences
            </Link>
            , and{' '}
            <Link
              href="/correlations"
              className="text-mulberry hover:text-plum"
            >
              correlations
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
