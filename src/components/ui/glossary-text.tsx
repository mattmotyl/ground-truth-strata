'use client';

import { Fragment, type ReactNode } from 'react';

import { GlossaryTerm } from '@/components/ui/glossary-term';

// Phrase → glossary slug map for auto-linking source notes and methodology
// footnotes. Case-sensitive on purpose (so "Weighted" sentence-starts and
// mid-sentence "weighted" both match their own form without false hits).
// Each slug is linked at most ONCE per string, at its first occurrence, so a
// note never turns into a sea of underlines. Order does not matter — matching
// is greedy by phrase length so the most specific phrase wins at any index.
const PHRASES: ReadonlyArray<{ phrase: string; slug: string }> = [
  { phrase: 'Spearman ρ', slug: 'spearman' },
  { phrase: 'weighted survey estimates', slug: 'weighted-estimate' },
  { phrase: 'Weighted estimates', slug: 'weighted-estimate' },
  { phrase: 'weighted estimates', slug: 'weighted-estimate' },
  { phrase: 'weighted means', slug: 'weighted-estimate' },
  { phrase: 'weighted mean', slug: 'weighted-estimate' },
  { phrase: '95% CIs', slug: 'confidence-interval' },
  { phrase: '95% CI', slug: 'confidence-interval' },
  { phrase: 'margin of error', slug: 'margin-of-error' },
  { phrase: 'reverse-coded', slug: 'reverse-coded' },
  { phrase: 'tertile', slug: 'tertile' },
  { phrase: 'suppressed by design', slug: 'suppression' },
  { phrase: 'n < 30', slug: 'suppression' },
];

// Longest-first so "95% CIs" beats "95% CI", "weighted survey estimates"
// beats "weighted estimates", etc., at a shared start index.
const PHRASES_BY_LENGTH = [...PHRASES].sort(
  (a, b) => b.phrase.length - a.phrase.length,
);

function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const used = new Set<string>();
  let buffer = '';
  let i = 0;

  while (i < text.length) {
    const match = PHRASES_BY_LENGTH.find(
      (p) => !used.has(p.slug) && text.startsWith(p.phrase, i),
    );
    if (match) {
      if (buffer) {
        out.push(buffer);
        buffer = '';
      }
      out.push(
        <GlossaryTerm key={`${match.slug}-${i}`} slug={match.slug}>
          {match.phrase}
        </GlossaryTerm>,
      );
      used.add(match.slug);
      i += match.phrase.length;
    } else {
      buffer += text[i];
      i += 1;
    }
  }
  if (buffer) out.push(buffer);
  return out;
}

interface GlossaryTextProps {
  /** A source note / footnote string to auto-link known jargon within. */
  text: ReactNode;
}

/**
 * Renders a source-note string with known glossary terms auto-underlined and
 * linked. If `text` is not a plain string (already JSX), it is returned
 * untouched — so hand-authored notes that already use <GlossaryTerm> are
 * never double-processed.
 */
export function GlossaryText({ text }: GlossaryTextProps) {
  if (typeof text !== 'string') return <>{text}</>;
  return (
    <>
      {linkify(text).map((seg, idx) => (
        <Fragment key={idx}>{seg}</Fragment>
      ))}
    </>
  );
}
