'use client';

import { useEffect, useState } from 'react';
import {
  loadMeta,
  loadPlatformRates,
  loadQuestionTexts,
  type QuestionTextsJson,
} from '@/lib/strata-data';
import type { MetaJson, PlatformRateRow } from '@/lib/strata-types';
import { fullWaveLabel } from '@/lib/strata-formatters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SectionUsage } from './section-usage';
import { ReportSection } from './report-section';

const DEFAULT_SLUG = 'facebook';

// Jump-nav entries. Sections land sub-commit by sub-commit; for now only
// Usage is populated and the rest render as placeholder shells so the
// page skeleton and anchor links are reviewable end to end.
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
  const [error, setError] = useState<Error | null>(null);

  const [slug, setSlug] = useState<string>(DEFAULT_SLUG);
  // Wave is user-overridable; null means "fall back to the latest wave
  // the selected platform has data for" (computed below per platform).
  const [waveOverride, setWaveOverride] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([loadPlatformRates(), loadMeta(), loadQuestionTexts()])
      .then(([r, m, qt]) => {
        setRows(r);
        setMeta(m);
        setQuestionTexts(qt);
      })
      .catch(setError);
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

  const datesByWave = new Map(meta.waves.map((w) => [w.wave, w.dates]));

  // Waves the selected platform has any row for, ascending.
  const availableWaves = [
    ...new Set(
      rows.filter((r) => r.platform_slug === activeSlug).map((r) => r.wave),
    ),
  ].sort((a, b) => a - b);

  // Effective wave: the user's choice when it's available for this
  // platform, otherwise the latest available wave.
  const latestWave = availableWaves[availableWaves.length - 1] ?? null;
  const effectiveWave =
    waveOverride !== null && availableWaves.includes(waveOverride)
      ? waveOverride
      : latestWave;

  return (
    <div className="flex flex-col">
      {/* Sticky controls: platform picker + wave picker + jump nav. */}
      <div className="sticky top-0 z-30 border-b border-mist bg-paper/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 text-sm text-slate">
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                Viewing data for:
              </span>
              <Select
                value={activeSlug}
                onValueChange={(v) => {
                  setSlug(v as string);
                  setWaveOverride(null);
                }}
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

            <label className="flex items-center gap-2 text-sm text-slate">
              <span style={{ fontFamily: 'var(--font-mono)' }}>Wave:</span>
              <Select
                value={effectiveWave}
                onValueChange={(v) => setWaveOverride(v as number)}
                items={availableWaves.map((w) => ({
                  value: w,
                  label: fullWaveLabel(w, datesByWave.get(w)),
                }))}
              >
                <SelectTrigger className="min-w-64 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableWaves.map((w) => (
                    <SelectItem key={w} value={w}>
                      {fullWaveLabel(w, datesByWave.get(w))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

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

        <ReportSection id="demographics" title={`Who uses ${platformLabel}?`}>
          {PLACEHOLDER_BODY}
        </ReportSection>

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

        <ReportSection
          id="habits"
          title={`How habitual is ${platformLabel} use?`}
        >
          {PLACEHOLDER_BODY}
        </ReportSection>
      </div>
    </div>
  );
}
