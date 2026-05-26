'use client';

import type {
  MetaJson,
  PlatformRateRow,
} from '@/lib/strata-types';
import {
  formatCI,
  formatN,
  formatPercent,
  shortWaveLabel,
  waveTableHeader,
} from '@/lib/strata-formatters';

interface PlatformWaveTableProps {
  rows: PlatformRateRow[]; // filtered to a single metric, all platforms
  meta: MetaJson;
  weighting: 'weighted' | 'unweighted';
  // Slugs the user has hidden from the chart. These rows still appear in
  // the table but are visually dimmed. Set to an empty Set if no
  // hiding behavior is wired yet.
  hidden: ReadonlySet<string>;
  // Swatch colors for the visible (un-hidden, in-default-chart) platforms.
  // Lookup by slug; pass an empty Map if the table is independent of a
  // chart legend.
  swatchBySlug: ReadonlyMap<string, string>;
}

interface CellState {
  kind: 'value' | 'suppressed' | 'missing';
  value: number | null;
  ciLo: number | null;
  ciHi: number | null;
  nUsers: number | null;
  nPanel: number | null;
}

function userCount(value: number | null, nPanel: number | null): number | null {
  if (value === null || nPanel === null) return null;
  return Math.round(value * nPanel);
}

function cellFromRow(
  row: PlatformRateRow | undefined,
  weighting: 'weighted' | 'unweighted',
): CellState {
  if (!row) {
    return {
      kind: 'missing',
      value: null,
      ciLo: null,
      ciHi: null,
      nUsers: null,
      nPanel: null,
    };
  }
  if (row.suppressed) {
    return {
      kind: 'suppressed',
      value: null,
      ciLo: null,
      ciHi: null,
      nUsers: null,
      nPanel: row.n,
    };
  }
  const value =
    weighting === 'weighted' ? row.weighted_value : row.value;
  const ciLo =
    weighting === 'weighted' ? row.weighted_ci_lower : row.ci_lower;
  const ciHi =
    weighting === 'weighted' ? row.weighted_ci_upper : row.ci_upper;
  return {
    kind: 'value',
    value,
    ciLo,
    ciHi,
    nUsers: userCount(row.value, row.n),
    nPanel: row.n,
  };
}

function cellTitle(
  cell: CellState,
  platformLabel: string,
  waveShort: string,
): string {
  if (cell.kind === 'missing') {
    return platformLabel + ' · ' + waveShort + ': not in panel this wave';
  }
  if (cell.kind === 'suppressed') {
    return (
      platformLabel +
      ' · ' +
      waveShort +
      ': suppressed (n < 30)'
    );
  }
  const pct = formatPercent(cell.value);
  const ci = formatCI(cell.ciLo, cell.ciHi);
  const nUsers = cell.nUsers !== null ? formatN(cell.nUsers) : '—';
  return (
    platformLabel +
    ' · ' +
    waveShort +
    ': ' +
    pct +
    ' ' +
    ci +
    ' · n=' +
    nUsers +
    ' users'
  );
}

export function PlatformWaveTable({
  rows,
  meta,
  weighting,
  hidden,
  swatchBySlug,
}: PlatformWaveTableProps) {
  const waves = meta.waves.map((w) => w.wave).sort((a, b) => a - b);
  const platforms = meta.platforms;

  // Sort: by most-recent-wave value descending, with missing/suppressed
  // sinking to the bottom. Keeps the top of the table consistent with
  // the chart legend's top-line story.
  const sortRefWave = Math.max(...waves);
  const rowsBySlugWave = new Map<string, PlatformRateRow>();
  for (const r of rows) {
    rowsBySlugWave.set(r.platform_slug + '|' + r.wave, r);
  }
  const sortedPlatforms = [...platforms].sort((a, b) => {
    const ar = rowsBySlugWave.get(a.slug + '|' + sortRefWave);
    const br = rowsBySlugWave.get(b.slug + '|' + sortRefWave);
    const aVal =
      ar && !ar.suppressed
        ? (weighting === 'weighted' ? ar.weighted_value : ar.value) ?? -1
        : -1;
    const bVal =
      br && !br.suppressed
        ? (weighting === 'weighted' ? br.weighted_value : br.value) ?? -1
        : -1;
    if (aVal !== bVal) return bVal - aVal;
    return a.label.localeCompare(b.label);
  });

  return (
    <div
      className="overflow-x-auto -mx-2"
      role="region"
      aria-label="Platform usage by wave"
    >
      <table
        className="text-xs w-full border-collapse"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <thead>
          <tr className="text-slate border-b border-mist">
            <th
              scope="col"
              className="text-left font-normal py-2 pr-2 pl-2 sticky left-0 bg-mist/50 z-10"
            >
              Platform
            </th>
            {waves.map((w) => {
              const dates =
                meta.waves.find((mw) => mw.wave === w)?.dates ?? '';
              const { months, year } = waveTableHeader(dates);
              return (
                <th
                  key={w}
                  scope="col"
                  className="text-right font-normal py-2 px-2"
                >
                  <div className="text-ink leading-tight">W{w}</div>
                  <div className="text-[10px] text-slate leading-tight">
                    {months}
                  </div>
                  <div className="text-[10px] text-slate leading-tight">
                    {year}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedPlatforms.map((p) => {
            const isHidden = hidden.has(p.slug);
            const swatch = swatchBySlug.get(p.slug);
            return (
              <tr
                key={p.slug}
                className={
                  'border-b border-mist/60 ' +
                  (isHidden ? 'opacity-40' : '')
                }
              >
                <th
                  scope="row"
                  className="text-left font-normal py-1.5 pr-2 pl-2 text-ink sticky left-0 bg-mist/50 z-10 whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-2">
                    {swatch ? (
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-sm shrink-0"
                        style={{ backgroundColor: swatch }}
                      />
                    ) : (
                      <span className="inline-block h-2 w-2 shrink-0" />
                    )}
                    <span>{p.label}</span>
                  </span>
                </th>
                {waves.map((w) => {
                  const cell = cellFromRow(
                    rowsBySlugWave.get(p.slug + '|' + w),
                    weighting,
                  );
                  const dates =
                    meta.waves.find((mw) => mw.wave === w)?.dates ?? '';
                  const waveShort = shortWaveLabel(w, dates);
                  const title = cellTitle(cell, p.label, waveShort);
                  if (cell.kind === 'missing') {
                    return (
                      <td
                        key={w}
                        className="text-right py-1.5 px-2 text-slate"
                        title={title}
                      >
                        —
                      </td>
                    );
                  }
                  if (cell.kind === 'suppressed') {
                    return (
                      <td
                        key={w}
                        className="text-right py-1.5 px-2 text-slate bg-mist/70"
                        title={title}
                      >
                        &lt;30
                      </td>
                    );
                  }
                  return (
                    <td
                      key={w}
                      className="text-right py-1.5 px-2 text-ink tabular-nums"
                      title={title}
                    >
                      {formatPercent(cell.value)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
