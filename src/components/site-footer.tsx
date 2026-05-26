import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-mist bg-paper text-slate text-sm">
      <div className="mx-auto max-w-6xl px-6 py-10 grid gap-6 md:grid-cols-3">
        <div className="space-y-2">
          <p className="text-ink font-medium">
            Part of Ground Truth with Matt Motyl
          </p>
          <p>
            <a
              href="https://mattmotyl.com"
              className="hover:text-mulberry transition-colors"
            >
              mattmotyl.com
            </a>{' '}
            ·{' '}
            <a
              href="https://github.com/mattmotyl/ground-truth-strata"
              className="hover:text-mulberry transition-colors"
            >
              GitHub
            </a>
          </p>
          <p className="text-xs">
            Code: MIT License. Cite: Motyl, M. (2026). Ground Truth Strata
            (v0.1.0). strata.mattmotyl.com
          </p>
        </div>

        <div className="md:col-span-2 space-y-2">
          <p>
            <span className="font-medium text-ink">Data:</span> Understanding
            America Study, USC CESR ·{' '}
            <a
              href="https://uasdata.usc.edu"
              className="hover:text-mulberry transition-colors"
            >
              uasdata.usc.edu
            </a>
          </p>
          <p>
            Results are the responsibility of the tool&rsquo;s users, not USC
            or UAS. Beta software — confirm findings with raw data. Raw data
            available via free registration at uasdata.usc.edu.
          </p>
          <p>
            <Link
              href="/about"
              className="text-mulberry hover:text-plum transition-colors"
            >
              Full methodology and attribution →
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
