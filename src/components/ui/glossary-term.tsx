'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getGlossaryEntry } from '@/lib/glossary';

interface GlossaryTermProps {
  /** Slug of the entry in src/lib/glossary.ts. */
  slug: string;
  children: ReactNode;
}

/**
 * Inline jargon term. Renders its children with a dotted underline that links
 * to the full /glossary entry; hover/focus pops a one-sentence gloss, and on
 * touch a tap navigates straight to the entry.
 *
 * The term itself is the link (rather than burying a link inside the tooltip)
 * so the tooltip stays a non-interactive hint — the accessible pattern.
 *
 * Additive by contract: an unknown slug degrades to plain text and never
 * throws, so sprinkling this in copy can't break a page.
 */
export function GlossaryTerm({ slug, children }: GlossaryTermProps) {
  const entry = getGlossaryEntry(slug);

  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[GlossaryTerm] unknown slug "${slug}" — rendering plain text.`,
      );
    }
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={`/glossary#${slug}`}
            className="underline decoration-dotted decoration-slate/50 underline-offset-2 hover:decoration-mulberry focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mulberry"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs flex-col items-start gap-1 text-left whitespace-normal">
        <span className="block leading-snug">{entry.short}</span>
        <span className="block text-[11px] text-background/70">
          Click to read more →
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
