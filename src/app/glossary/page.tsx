import type { Metadata } from 'next';
import Link from 'next/link';

import { getGlossarySorted } from '@/lib/glossary';

export const metadata: Metadata = {
  title: 'Glossary',
  description:
    'Plain-English explanations of the statistical and method terms used across Ground Truth Strata.',
};

const entries = getGlossarySorted();

export default function GlossaryPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-12 space-y-10">
      <header className="space-y-3">
        <p
          className="text-xs text-slate uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Reference
        </p>
        <h1
          className="text-4xl text-plum"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          Glossary
        </h1>
        <p className="text-lg text-ink/80 leading-relaxed">
          Plain-English explanations of the statistical and method terms you
          will meet around Strata. No prior stats background assumed — if a
          definition is doing its job, it should make the term feel smaller,
          not scarier.
        </p>
        <p className="text-sm text-slate italic leading-relaxed">
          Each entry pairs a precise definition with a plain-language example
          (and the occasional lighter aside) to make the idea click — the
          examples illustrate the term rather than restate the formal
          methodology.
        </p>
      </header>

      {/* Quick jump index. */}
      <nav
        aria-label="Glossary terms"
        className="rounded-md border border-mist bg-mist/20 px-6 py-5"
      >
        <p
          className="text-xs uppercase tracking-wide text-slate text-center mb-3"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          On this page
        </p>
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          {entries.map((entry) => (
            <li key={entry.slug}>
              <a
                href={`#${entry.slug}`}
                className="text-mulberry underline decoration-mulberry/30 underline-offset-4 hover:decoration-mulberry hover:text-plum transition-colors"
              >
                {entry.term}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-12">
        {entries.map((entry) => (
          <section
            key={entry.slug}
            id={entry.slug}
            className="space-y-3 scroll-mt-24"
          >
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2
                className="text-2xl text-plum"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {entry.term}
              </h2>
              {entry.status === 'draft' ? (
                <span
                  className="text-[10px] uppercase tracking-wider rounded bg-amber-50 border border-amber-300/70 text-amber-900 px-2 py-0.5"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  title="This definition is still being finalized."
                >
                  ⚠ Draft — pending review
                </span>
              ) : null}
            </div>

            <p className="text-ink/85 leading-relaxed">{entry.long}</p>

            {entry.example ? (
              <div className="rounded-md border border-lilac/40 bg-lilac/5 p-4">
                <p
                  className="text-[11px] uppercase tracking-wider text-mulberry mb-1.5"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  In plain terms
                </p>
                <p className="text-ink/85 leading-relaxed">{entry.example}</p>
              </div>
            ) : null}

            {entry.related && entry.related.length > 0 ? (
              <p
                className="text-xs text-slate"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                See also:{' '}
                {entry.related.map((slug, i) => {
                  const target = entries.find((e) => e.slug === slug);
                  if (!target) return null;
                  return (
                    <span key={slug}>
                      {i > 0 ? ', ' : ''}
                      <a
                        href={`#${slug}`}
                        className="text-mulberry hover:text-plum transition-colors"
                      >
                        {target.term}
                      </a>
                    </span>
                  );
                })}
              </p>
            ) : null}
          </section>
        ))}
      </div>

      <footer
        className="pt-8 border-t border-mist text-xs text-slate space-y-1"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <p>
          Definitions of method are drawn from the{' '}
          <Link href="/about" className="text-mulberry hover:text-plum">
            methodology page
          </Link>
          .
        </p>
        <p className="pt-2">
          <Link href="/" className="text-mulberry hover:text-plum">
            ← Back to Strata
          </Link>
        </p>
      </footer>
    </article>
  );
}
