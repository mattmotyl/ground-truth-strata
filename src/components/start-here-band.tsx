import Link from 'next/link';

interface Finding {
  n: number;
  title: string;
  blurb: string;
  chart: string;
  href: string;
}

const FINDINGS: Finding[] = [
  {
    n: 1,
    title: 'Who uses what?',
    blurb: 'Platform usage rates across six waves, 2023–2025.',
    chart: 'Trend line, one line per platform',
    href: '/trends?finding=who-uses-what',
  },
  {
    n: 2,
    title: 'Where do people have negative personal experiences?',
    blurb:
      'Share of users reporting a recent negative personal experience on each platform.',
    chart: 'Ranked horizontal bar',
    href: '/compare?finding=negative-experiences',
  },
  {
    n: 3,
    title: 'Where is content bad for the world?',
    blurb:
      'Share of users who say a platform is bad for the world, by platform.',
    chart: 'Ranked horizontal bar',
    href: '/compare?finding=bftw',
  },
  {
    n: 4,
    title: 'Where do people learn things?',
    blurb: 'Share of users who say a platform is useful or informative.',
    chart: 'Ranked horizontal bar',
    href: '/compare?finding=useful',
  },
  {
    n: 5,
    title: 'Where do people connect?',
    blurb: 'Share reporting meaningful connections on each platform.',
    chart: 'Ranked horizontal bar',
    href: '/compare?finding=connections',
  },
  {
    n: 6,
    title: 'Do men and women experience platforms differently?',
    blurb:
      'Gender differences in negative experiences across waves.',
    chart: 'Grouped bar with 95% CI',
    href: '/groups?finding=gender-negative',
  },
  {
    n: 7,
    title: 'Which platforms are most politically skewed?',
    blurb:
      'Liberal / moderate / conservative composition of each platform’s user base.',
    chart: 'Stacked horizontal bar',
    href: '/compare?finding=political-composition',
  },
  {
    n: 8,
    title: 'Does using social media more mean feeling worse?',
    blurb:
      'Correlation between platform use frequency and loneliness / wellbeing.',
    chart: 'Diverging bar from national average',
    href: '/correlations?finding=usage-wellbeing',
  },
];

export function StartHereBand() {
  return (
    <section
      aria-labelledby="start-here-heading"
      className="bg-mist/40 border-y border-mist"
    >
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
          <h2
            id="start-here-heading"
            className="text-2xl text-plum"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Start here
          </h2>
          <p className="text-sm text-slate">
            Eight curated findings to orient new visitors.
          </p>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FINDINGS.map((f) => (
            <li key={f.n}>
              <Link
                href={f.href}
                className="block h-full rounded-md border border-mist bg-paper p-4 hover:border-mulberry hover:shadow-sm transition-all"
              >
                <div
                  className="text-xs text-slate mb-2"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  FINDING {String(f.n).padStart(2, '0')}
                </div>
                <h3 className="text-base text-plum mb-2 leading-snug">
                  {f.title}
                </h3>
                <p className="text-sm text-ink/80 mb-3 leading-relaxed">
                  {f.blurb}
                </p>
                <p
                  className="text-xs text-slate"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {f.chart}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
