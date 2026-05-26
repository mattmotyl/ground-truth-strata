import Link from 'next/link';

interface RouteStubProps {
  eyebrow: string;
  title: string;
  description: string;
  comingNext: string[];
}

export function RouteStub({
  eyebrow,
  title,
  description,
  comingNext,
}: RouteStubProps) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 space-y-6">
      <p
        className="text-xs text-slate uppercase tracking-wide"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {eyebrow}
      </p>
      <h1
        className="text-4xl text-plum"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {title}
      </h1>
      <p className="text-lg text-ink/80 leading-relaxed">{description}</p>
      <div
        className="rounded-md border border-dashed border-mulberry/50 bg-mist/30 p-5 space-y-3"
        role="note"
        aria-label="Development status"
      >
        <p
          className="text-xs text-mulberry uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          In development
        </p>
        <p className="text-sm text-ink/85">
          This route is part of Phase 4 of the Strata buildout. Coming
          next:
        </p>
        <ul className="text-sm text-ink/85 space-y-1 list-disc list-outside ml-5">
          {comingNext.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-slate">
        <Link href="/" className="text-mulberry hover:text-plum">
          ← Back to Strata
        </Link>{' '}
        ·{' '}
        <Link href="/about" className="text-mulberry hover:text-plum">
          Read the methodology
        </Link>
      </p>
    </section>
  );
}
