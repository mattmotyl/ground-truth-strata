import Link from 'next/link';

interface StartCard {
  title: string;
  blurb: string;
  href: string;
}

// Five plain-language entry points for new visitors. No "Finding ##"
// numbering — just an inviting question per card. Cards deep-link into
// the relevant view: /trends reads ?category=&q=, /explore reads ?tab=.
const CARDS: StartCard[] = [
  {
    title: 'What platforms are most popular?',
    blurb:
      'See how many U.S. adults use each platform and how that has shifted across six waves, 2023–2025.',
    href: '/trends', // opens on Platform usage by default
  },
  {
    title: 'Where do people have negative experiences?',
    blurb:
      'Compare how often users report a recent negative experience on each platform.',
    href: '/trends?category=platform&q=nux',
  },
  {
    title: 'How do platform users feel about their wellbeing?',
    blurb:
      'Track life satisfaction, loneliness, and related measures over time.',
    href: '/trends?category=wellbeing',
  },
  {
    title: 'How do these measures move together?',
    blurb:
      'Explore the correlations between wellbeing, political, and social-media measures in an interactive matrix.',
    href: '/explore?tab=matrix',
  },
  {
    title: 'How does one platform’s experience compare to another’s?',
    blurb:
      'Open a single platform’s report card — who uses it, what they experience, and how its users feel.',
    href: '/platforms',
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
            Five places to start digging into the data.
          </p>
        </div>
        {/* 6-col track on lg so each card spans 2 (= 3 per row); the 4th
            card starts at column 2 so the trailing two cards center in
            the bottom row (cols 2–3 and 4–5, leaving 1 and 6 empty). */}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {CARDS.map((c, i) => (
            <li
              key={c.title}
              className={
                'lg:col-span-2' + (i === 3 ? ' lg:col-start-2' : '')
              }
            >
              <Link
                href={c.href}
                className="block h-full rounded-md border border-mist bg-paper p-4 hover:border-mulberry hover:shadow-sm transition-all"
              >
                <h3 className="text-base text-plum mb-2 leading-snug">
                  {c.title}
                </h3>
                <p className="text-sm text-ink/80 leading-relaxed">
                  {c.blurb}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
