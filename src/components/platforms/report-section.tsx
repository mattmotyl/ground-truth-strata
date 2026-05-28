'use client';

import { type ReactNode, type RefObject } from 'react';
import Link from 'next/link';

// Shared section card for the /platforms report card. Each section is an
// anchor target for the jump-nav (id), a titled white card holding a
// chart or table, an optional source note, and at most one or two
// "See more →" links plus an optional actions slot (export buttons).
//
// `exportRef` is attached to the white card (header + body + source note)
// so a PNG export captures the full chart anatomy per PHASE4_UI_SPEC.md,
// while the action row + see-more links stay outside the capture.

export interface SeeMoreLink {
  href: string;
  label: string;
}

interface ReportSectionProps {
  id: string;
  title: string;
  subtitle?: ReactNode;
  // Short note under the header (e.g. "Data available from Wave 4 onward").
  waveNote?: ReactNode;
  children: ReactNode;
  sourceNote?: ReactNode;
  seeMore?: SeeMoreLink | SeeMoreLink[];
  actions?: ReactNode;
  exportRef?: RefObject<HTMLDivElement | null>;
  // Optional interactive controls (e.g. §5 wave + response-type pickers).
  // Rendered ABOVE the exported card so they stay out of PNG captures.
  controls?: ReactNode;
}

export function ReportSection({
  id,
  title,
  subtitle,
  waveNote,
  children,
  sourceNote,
  seeMore,
  actions,
  exportRef,
  controls,
}: ReportSectionProps) {
  const links = seeMore
    ? Array.isArray(seeMore)
      ? seeMore
      : [seeMore]
    : [];

  return (
    <section id={id} className="scroll-mt-36 space-y-3">
      {controls ? <div>{controls}</div> : null}
      <div
        ref={exportRef}
        className="rounded-md border border-mist bg-white p-5 space-y-3"
      >
        <div className="space-y-1">
          <h2
            className="text-2xl text-plum"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {title}
          </h2>
          {waveNote ? (
            <p
              className="text-xs text-slate"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {waveNote}
            </p>
          ) : null}
          {subtitle ? (
            <p className="text-sm text-ink/80 leading-relaxed max-w-3xl">
              {subtitle}
            </p>
          ) : null}
        </div>

        {children}

        {sourceNote ? (
          <p
            className="text-xs text-slate leading-relaxed pt-3 border-t border-mist"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {sourceNote}
          </p>
        ) : null}
      </div>

      {links.length > 0 || actions ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href + l.label}
                href={l.href}
                className="text-sm text-mulberry hover:text-plum underline-offset-2 hover:underline w-fit"
              >
                {l.label}
              </Link>
            ))}
          </div>
          {actions}
        </div>
      ) : null}
    </section>
  );
}
