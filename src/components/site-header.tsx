import Link from 'next/link';

const NAV = [
  { href: '/trends', label: 'Trends' },
  { href: '/platforms', label: 'Platforms' },
  { href: '/compare', label: 'Compare' },
  { href: '/groups', label: 'Groups' },
  { href: '/correlations', label: 'Correlations' },
  { href: '/about', label: 'About' },
];

export function SiteHeader() {
  return (
    <header className="border-b border-mist bg-paper">
      <div className="mx-auto max-w-6xl px-6 py-6 flex items-baseline justify-between gap-6 flex-wrap">
        <div>
          <Link
            href="/"
            className="font-[var(--font-serif)] text-2xl text-plum hover:text-mulberry transition-colors"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Ground Truth Strata
          </Link>
          <p className="text-sm text-slate mt-1">Dig into the data.</p>
        </div>
        <nav>
          <ul className="flex gap-5 text-sm font-medium">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-ink hover:text-mulberry transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
