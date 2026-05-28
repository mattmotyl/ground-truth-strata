'use client';

import { useEffect, useState } from 'react';
import {
  loadMeta,
  loadPlatformDemographics,
  loadPlatformRates,
  loadQuestionTexts,
  type QuestionTextsJson,
} from '@/lib/strata-data';
import type {
  MetaJson,
  PlatformDemographicRow,
  PlatformRateRow,
} from '@/lib/strata-types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SectionUsage } from './section-usage';
import { SectionDemographics } from './section-demographics';
import { SectionHabits } from './section-habits';
import { ReportSection } from './report-section';

const DEFAULT_SLUG = 'facebook';

const JUMP_LINKS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'usage', label: 'Usage' },
  { id: 'demographics', label: 'Demographics' },
  { id: 'experiences', label: 'Experiences' },
  { id: 'wellbeing', label: 'Wellbeing' },
  { id: 'habits', label: 'Habits' },
];

const PLACEHOLDER_BODY = (
  <p className="text-sm text-slate py-6">
    This section lands in an upcoming build of the report card.
  </p>
);

export function PlatformReportCard() {
  const [rows, setRows] = useState<PlatformRateRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [questionTexts, setQuestionTexts] =
    useState<QuestionTextsJson | null>(null);
  // platform_demographics.json (~900 KB) loads alongside the base data
  // but in its own request, so §1 renders without waiting on it.
  const [demoRows, setDemoRows] = useState<PlatformDemographicRow[] | null>(
    null,
  );
  const [error, setError] = useState<Error | null>(null);

  const [slug, setSlug] = useState<string>(DEFAULT_SLUG);

  useEffect(() => {
    Promise.all([loadPlatformRates(), loadMeta(), loadQuestionTexts()])
      .then(([r, m, qt]) => {
        setRows(r);
        setMeta(m);
        setQuestionTexts(qt);
      })
      .catch(setError);
  }, []);

  useEffect(() => {
    loadPlatformDemographics().then(setDemoRows).catch(setError);
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load platform data: {error.message}</p>
      </div>
    );
  }

  if (!rows || !meta) {
    return (
      <div
        className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Loading platform data…
      </div>
    );
  }

  // Platforms, alphabetical by label (EXCLUDED_PLATFORM_SLUGS already
  // filtered out in loadMeta). Default to Facebook, else the first.
  const platforms = [...meta.platforms].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  const activeSlug = platforms.some((p) => p.slug === slug)
    ? slug
    : platforms[0]?.slug ?? slug;
  const platformLabel =
    platforms.find((p) => p.slug === activeSlug)?.label ?? activeSlug;

  return (
    <div className="flex flex-col">
      {/* Sticky controls: platform picker + jump nav. (Sections set their
          own wave scope; there is no global wave selector.) */}
      <div className="sticky top-0 z-30 border-b border-mist bg-paper/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate">
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              Viewing data for:
            </span>
            <Select
              value={activeSlug}
              onValueChange={(v) => setSlug(v as string)}
              items={platforms.map((p) => ({
                value: p.slug,
                label: p.label,
              }))}
            >
              <SelectTrigger className="min-w-44 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {platforms.map((p) => (
                  <SelectItem key={p.slug} value={p.slug}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <nav
            aria-label="Jump to section"
            className="text-sm text-slate flex flex-wrap items-center gap-x-1 gap-y-1"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <span className="mr-1">Jump to:</span>
            {JUMP_LINKS.map((l, i) => (
              <span key={l.id} className="flex items-center gap-1">
                {i > 0 ? <span aria-hidden>·</span> : null}
                <a
                  href={`#${l.id}`}
                  className="text-mulberry hover:text-plum underline-offset-2 hover:underline"
                >
                  {l.label}
                </a>
              </span>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-10">
        <header className="space-y-1">
          <h1
            className="text-3xl sm:text-4xl text-plum"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {platformLabel}
          </h1>
          <p className="text-slate text-sm">
            What the Understanding America Study panel shows about{' '}
            {platformLabel}, across six waves (2023–2025).
          </p>
        </header>

        <SectionUsage
          rows={rows}
          meta={meta}
          questionTexts={questionTexts}
          platformSlug={activeSlug}
          platformLabel={platformLabel}
        />

        {demoRows ? (
          <SectionDemographics
            rows={demoRows}
            meta={meta}
            platformSlug={activeSlug}
            platformLabel={platformLabel}
          />
        ) : (
          <ReportSection id="demographics" title={`Who uses ${platformLabel}?`}>
            <p
              className="text-sm text-slate py-6"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Loading demographics…
            </p>
          </ReportSection>
        )}

        <ReportSection
          id="experiences"
          title={`What do people experience on ${platformLabel}?`}
        >
          {PLACEHOLDER_BODY}
        </ReportSection>

        <ReportSection
          id="wellbeing"
          title={`How do ${platformLabel} users feel?`}
        >
          {PLACEHOLDER_BODY}
        </ReportSection>

        <SectionHabits
          rows={rows}
          meta={meta}
          platformSlug={activeSlug}
          platformLabel={platformLabel}
        />
      </div>
    </div>
  );
}
