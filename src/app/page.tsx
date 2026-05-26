import Link from 'next/link';
import { StartHereBand } from '@/components/start-here-band';

export default function HomePage() {
  return (
    <>
      <section className="border-b border-mist">
        <div className="mx-auto max-w-6xl px-6 py-14 grid gap-8 lg:grid-cols-[3fr_2fr] items-start">
          <div className="space-y-5">
            <h1
              className="text-4xl sm:text-5xl text-plum leading-tight"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              A data tool for serious questions about
              <br />
              social media and technology.
            </h1>
            <p className="text-lg text-ink/80 leading-relaxed max-w-2xl">
              Strata lets researchers, policymakers, lawyers, journalists,
              and curious people explore findings from a six-wave
              longitudinal survey of U.S. adults conducted between 2023 and
              2025.
            </p>
          </div>
          <aside
            className="rounded-md border border-mist bg-paper p-5 space-y-3 text-sm"
            aria-labelledby="how-to-use-heading"
          >
            <h2
              id="how-to-use-heading"
              className="text-base text-plum"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              How to use Strata
            </h2>
            <ol className="list-decimal list-outside ml-5 space-y-1 text-ink/85">
              <li>
                Pick a question from <em>Start here</em>, or jump to an
                explorer in the nav.
              </li>
              <li>
                Charts default to <em>weighted</em> estimates with 95%
                confidence intervals. Toggle as needed.
              </li>
              <li>
                Read the <em>What the numbers mean</em> column for plain-
                language context. Every chart shows its <em>n</em> and
                methodology footnote.
              </li>
              <li>
                Cells with fewer than 30 respondents are suppressed by
                design. <Link href="/about" className="text-mulberry hover:text-plum underline">Read the methodology →</Link>
              </li>
            </ol>
            <p className="text-xs text-slate pt-2 border-t border-mist">
              Raw data is available via free registration at{' '}
              <a
                href="https://uasdata.usc.edu/page/Registration+Form"
                className="text-mulberry hover:text-plum"
              >
                uasdata.usc.edu
              </a>
              .
            </p>
          </aside>
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
