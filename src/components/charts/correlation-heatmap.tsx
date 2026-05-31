'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadCorrelations,
  loadMeta,
  loadQuestionTexts,
  type QuestionTextsJson,
} from '@/lib/strata-data';
import type { CorrelationRow, MetaJson } from '@/lib/strata-types';
import {
  AXIS_SHORT_LABELS,
  buildCorrelationMatrix,
  buildRespondentVarCatalog,
  catalogVarsPresentInData,
  correlationColor,
  groupByDomain,
  wavesWithRespondentPairs,
  type RespondentVar,
} from '@/lib/explore-adapters';
import { CHART_FONTS } from '@/lib/strata-charts';
import { formatN, formatNumber, fullWaveLabel } from '@/lib/strata-formatters';
import { surveyQuestionFor } from '@/lib/strata-survey';
import { StrataChartFrame } from './strata-chart-frame';
import { GlossaryTerm } from '@/components/ui/glossary-term';

// =====================================================================
// /explore — Correlation matrix (heatmap).
//
// A color-coded matrix of pairwise Spearman ρ among respondent-level
// variables, for one wave. Custom SVG/HTML table per CHART_COMPONENT_MAP.
// Lower triangle only (the upper triangle is redundant). Diverging color:
// teal = positive ρ, amber/red = negative ρ, light = near zero. Cells
// show the actual ρ (e.g. 0.12). ρ is per-wave; a wave selector drives
// the whole matrix.
//
// Readability cap: at most 12 variables. We PREVENT over-selection
// (disable unchecked variables once 12 are picked, and disable variables
// not fielded in the chosen wave) rather than showing an after-the-fact
// error. No CI / no p-values in correlations.json.
// =====================================================================

const DEFAULT_WAVE = 6;
const MAX_MATRIX_VARS = 12;
const CELL = 50; // px — square cell size (sized for a 2-dp ρ label)

// Default selection: the 7 well-being / loneliness measures fielded in
// Wave 6, so the matrix renders immediately on first load.
const DEFAULT_SELECTED: readonly string[] = [
  'ls002k',
  'ls002l',
  'ls002j',
  'ls002d',
  'ls002i',
  'ls002c',
  'ex003_lonely',
];

// Extra descriptive text shown in THE NUMBERS box for measures that have
// no single verbatim survey question (a derived index / a 0–100 scale).
const NUMBERS_ANNOTATIONS: Record<string, string> = {
  ex003_lonely:
    'UCLA 3-item loneliness scale, binary; measured in Waves 2, 5, and 6 only',
  rate_self:
    'Self-reported ideology scale, 0 = very liberal, 100 = very conservative',
};

// Black/white cell text by background luminance (legibility on both
// light and dark fills). Mirrors compare-heatmap's helper.
function readableTextColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#18161F' : '#FFFFFF';
}

export function CorrelationHeatmap() {
  const [rows, setRows] = useState<CorrelationRow[] | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [questionTexts, setQuestionTexts] =
    useState<QuestionTextsJson | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [wave, setWave] = useState<number>(DEFAULT_WAVE);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(DEFAULT_SELECTED),
  );
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([loadCorrelations(), loadMeta(), loadQuestionTexts()])
      .then(([all, m, qt]) => {
        setRows(all);
        setMeta(m);
        setQuestionTexts(qt);
      })
      .catch(setError);
  }, []);

  const catalog = useMemo<RespondentVar[]>(
    () => (meta ? buildRespondentVarCatalog(meta) : []),
    [meta],
  );

  const pickable = useMemo<RespondentVar[]>(
    () => (rows ? catalogVarsPresentInData(catalog, rows) : []),
    [catalog, rows],
  );

  const pickableGroups = useMemo(() => groupByDomain(pickable), [pickable]);

  const availableWaves = useMemo(
    () => (rows ? wavesWithRespondentPairs(rows, catalog) : []),
    [rows, catalog],
  );

  const selectedWave = availableWaves.includes(wave)
    ? wave
    : availableWaves[availableWaves.length - 1] ?? DEFAULT_WAVE;

  const matrix = useMemo(
    () =>
      rows ? buildCorrelationMatrix(rows, catalog, selectedWave, selected) : null,
    [rows, catalog, selectedWave, selected],
  );

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-ink/80">
        <p>Couldn&rsquo;t load correlation data: {error.message}</p>
      </div>
    );
  }
  if (!rows || !meta || !matrix) {
    return (
      <div
        className="mx-auto max-w-3xl px-6 py-16 text-center text-slate"
        style={{ fontFamily: CHART_FONTS.mono }}
      >
        Loading correlation data…
      </div>
    );
  }

  const atCap = selected.size >= MAX_MATRIX_VARS;

  const toggleVar = (name: string, disabled: boolean) => {
    if (disabled) return;
    setSelected((curr) => {
      const next = new Set(curr);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // "Select all" only fires when it would not exceed the cap (it never
  // can here — there are far more than 12 pickable variables — so the
  // button is offered only as "Deselect all" once something is picked).
  const hasSelection = selected.size > 0;
  const canSelectAll = pickable.length <= MAX_MATRIX_VARS;
  const selectAllLabel = hasSelection ? 'Deselect all' : 'Select all';
  const selectAllDisabled = !hasSelection && !canSelectAll;
  const onSelectAll = () => {
    if (hasSelection) setSelected(new Set());
    else if (canSelectAll) setSelected(new Set(pickable.map((v) => v.name)));
  };

  const vars = matrix.vars;
  const maxAbs = matrix.maxAbs;
  // Matrix axes use a shortened label where available; THE NUMBERS and
  // the picker keep the full label.
  const axisLabel = (v: RespondentVar) => AXIS_SHORT_LABELS[v.name] ?? v.label;
  const selectedWaveDates =
    meta.waves.find((w) => w.wave === selectedWave)?.dates ?? '';

  const questionTextFor = (name: string): string => {
    if (NUMBERS_ANNOTATIONS[name]) return NUMBERS_ANNOTATIONS[name];
    const info = surveyQuestionFor(name, questionTexts, meta);
    if (
      info &&
      (info.kind === 'question' || info.kind === 'composite') &&
      info.questionText
    ) {
      return info.questionText;
    }
    return '';
  };

  // ── Color key ─────────────────────────────────────────────────────
  const colorKey = (
    <div
      className="flex items-center gap-3 text-[11px] text-slate"
      style={{ fontFamily: CHART_FONTS.mono }}
    >
      <span>Negative ρ</span>
      <span className="flex h-3 overflow-hidden rounded-sm border border-mist">
        {['#CC0000', '#FF8C00', '#FFC107', '#FFF3CD', '#E8F4F8', '#4DB6AC', '#00897B', '#004D40'].map(
          (c) => (
            <span key={c} style={{ backgroundColor: c, width: 18 }} />
          ),
        )}
      </span>
      <span>Positive ρ</span>
    </div>
  );

  // ── Matrix (lower triangle only) ──────────────────────────────────
  const matrixTable =
    vars.length < 2 ? (
      <div
        className="py-16 text-center text-slate text-sm"
        style={{ fontFamily: CHART_FONTS.mono }}
      >
        Select at least two variables that were fielded in this wave.
      </div>
    ) : (
      <div className="overflow-x-auto bg-white pb-3">
        <table
          className="border-separate"
          style={{ borderSpacing: 0, fontFamily: CHART_FONTS.mono }}
        >
          <thead>
            <tr>
              <th className="bg-white" style={{ width: 220 }} />
              {vars.map((v) => (
                <th
                  key={v.name}
                  scope="col"
                  title={`${v.label} · ${v.domainLabel}`}
                  className="bg-white align-bottom p-0"
                  style={{ height: 244, width: CELL }}
                >
                  <div
                    className="text-[10px] text-slate font-normal mx-auto leading-tight"
                    style={{
                      writingMode: 'vertical-rl',
                      transform: 'rotate(180deg)',
                      height: 238,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {axisLabel(v)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vars.map((rowVar, ri) => (
              <tr key={rowVar.name}>
                <th
                  scope="row"
                  title={`${rowVar.label} · ${rowVar.domainLabel}`}
                  className="bg-white text-right pr-2 text-[10px] text-slate font-normal leading-tight"
                  style={{ width: 220, maxWidth: 220 }}
                >
                  {axisLabel(rowVar)}
                </th>
                {vars.map((colVar, cj) => {
                  // Upper triangle (above diagonal): blank white cell.
                  if (cj > ri) {
                    return (
                      <td
                        key={colVar.name}
                        className="bg-white"
                        style={{ width: CELL, height: CELL }}
                      />
                    );
                  }
                  // Diagonal: white, em-dash, no number.
                  if (cj === ri) {
                    return (
                      <td
                        key={colVar.name}
                        className="text-center text-slate bg-white"
                        style={{ width: CELL, height: CELL }}
                      >
                        —
                      </td>
                    );
                  }
                  // Lower triangle: the correlation.
                  const cell = matrix.get(rowVar.name, colVar.name);
                  if (!cell) {
                    return (
                      <td
                        key={colVar.name}
                        title="No correlation for this pair at this wave"
                        className="text-center text-slate"
                        style={{
                          width: CELL,
                          height: CELL,
                          backgroundColor: '#F6F3EE',
                        }}
                      >
                        ·
                      </td>
                    );
                  }
                  const bg = correlationColor(cell.r, maxAbs);
                  const fg = readableTextColor(bg);
                  const tip = `${rowVar.label} × ${colVar.label}\nρ = ${formatNumber(
                    cell.r,
                    3,
                  )} · n = ${formatN(cell.n)} · weighted n_eff = ${formatN(
                    cell.nEff,
                  )}`;
                  return (
                    <td
                      key={colVar.name}
                      title={tip}
                      className="text-center text-[11px] tabular-nums"
                      style={{
                        width: CELL,
                        height: CELL,
                        backgroundColor: bg,
                        color: fg,
                      }}
                    >
                      {formatNumber(cell.r, 2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const chart = (
    <div className="space-y-3">
      {colorKey}
      {matrixTable}
    </div>
  );

  // ── Variable picker (individual checkboxes grouped by domain) ─────
  const controlsAside = (
    <div className="space-y-5">
      <div className="space-y-2">
        <p
          className="text-xs text-slate uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Wave
        </p>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="sr-only">Select wave</legend>
          {availableWaves.map((w) => {
            const dates = meta.waves.find((mw) => mw.wave === w)?.dates ?? '';
            return (
              <label key={w} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="corr-matrix-wave"
                  value={w}
                  checked={selectedWave === w}
                  onChange={() => setWave(w)}
                  className="accent-plum"
                />
                <span
                  className={selectedWave === w ? 'text-ink' : 'text-slate'}
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {fullWaveLabel(w, dates)}
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>

      <div className="space-y-2">
        <p
          className="text-xs text-slate uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Variables ({selected.size} of {MAX_MATRIX_VARS} max)
        </p>
        <button
          type="button"
          onClick={onSelectAll}
          disabled={selectAllDisabled}
          className={
            'text-xs underline-offset-2 ' +
            (selectAllDisabled
              ? 'text-slate/50 cursor-not-allowed'
              : 'text-mulberry hover:text-plum hover:underline')
          }
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {selectAllLabel}
        </button>
        <ul
          className="max-h-80 overflow-y-auto border border-mist rounded-md bg-paper px-2 py-1 space-y-0.5"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {pickableGroups.map((g) => (
            <li key={g.domain}>
              <p className="text-[10px] text-slate uppercase tracking-wide pt-1.5 pb-0.5">
                {g.domainLabel}
              </p>
              <ul className="space-y-0.5">
                {g.vars.map((v) => {
                  const checked = selected.has(v.name);
                  const available = v.waves.includes(selectedWave);
                  // Disable unchecked variables when at the cap or when
                  // the variable wasn't fielded this wave. Checked items
                  // stay clickable so they can always be removed.
                  const disabled = !checked && (atCap || !available);
                  const title = !available
                    ? 'Not asked in this wave.'
                    : disabled
                      ? `${MAX_MATRIX_VARS}-variable maximum reached.`
                      : undefined;
                  return (
                    <li key={v.name}>
                      <label
                        title={title}
                        className={
                          'flex items-start gap-2 text-xs rounded px-1 py-0.5 ' +
                          (disabled
                            ? 'opacity-40 cursor-not-allowed'
                            : 'cursor-pointer hover:bg-mist/50')
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleVar(v.name, disabled)}
                          className="accent-plum mt-0.5 shrink-0"
                        />
                        <span className={checked ? 'text-ink' : 'text-slate'}>
                          {v.label}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  // ── THE NUMBERS — display label + full question text, by domain ───
  const numbers = (
    <div className="space-y-3">
      <p className="text-xs text-slate" style={{ fontFamily: CHART_FONTS.mono }}>
        {vars.length} variables · {matrix.pairCount} pairs · W{selectedWave}
      </p>
      <dl className="space-y-3 text-xs">
        {groupByDomain(vars).map((g) => (
          <div key={g.domain} className="space-y-1.5">
            <dt
              className="text-slate uppercase tracking-wide"
              style={{ fontFamily: CHART_FONTS.mono }}
            >
              {g.domainLabel}
            </dt>
            {g.vars.map((v) => {
              const q = questionTextFor(v.name);
              return (
                <dd key={v.name} className="pl-2 leading-snug">
                  <span className="text-ink">{v.label}</span>
                  {q ? (
                    <span className="block text-slate italic text-[11px]">
                      {q}
                    </span>
                  ) : null}
                </dd>
              );
            })}
          </div>
        ))}
      </dl>
    </div>
  );

  const interpretationText =
    'Each cell is the weighted Spearman ρ between two respondent-level measures at this wave. Teal cells mark positive associations (the two move together), amber/red cells mark negative ones (one rises as the other falls); paler cells are closer to zero. Most associations in survey data of this kind are small: treat |ρ| below 0.1 as essentially noise, and read 0.1–0.3 as a weak association. ρ is bounded by [-1, +1] and this is an observational survey, so associations do not imply causation. Correlations are per-wave and are not directly comparable across waves with different respondents.';

  // CSV — lower triangle, with both labels.
  const csvHeaders = [
    'var1',
    'var1_label',
    'var2',
    'var2_label',
    'wave',
    'spearman_rho',
    'n',
    'weighted_n_eff',
  ];
  const csvRows: unknown[][] = [];
  for (let i = 0; i < vars.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const cell = matrix.get(vars[i].name, vars[j].name);
      if (!cell) continue;
      csvRows.push([
        vars[i].name,
        vars[i].label,
        vars[j].name,
        vars[j].label,
        selectedWave,
        cell.r,
        cell.n,
        cell.nEff,
      ]);
    }
  }

  return (
    <StrataChartFrame
      eyebrow="Explore · Correlation matrix"
      title="How do these measures move together?"
      subtitle="Pairwise Spearman correlations among respondent-level survey measures. Pick a wave and choose up to 12 variables; hover any cell for the exact ρ and sample size."
      titleInCard
      chart={chart}
      chartRef={chartRef}
      controls={controlsAside}
      customNumbers={numbers}
      isPlaceholderInterpretation
      interpretation={interpretationText}
      methodologyFootnote=""
      sourceNote={
        <>
          Source: UAS panel{' '}
          {fullWaveLabel(selectedWave, selectedWaveDates)} (UAS
          {meta.waves.find((w) => w.wave === selectedWave)?.uas_num ?? '?'}).
          Weighted <GlossaryTerm slug="spearman">Spearman ρ</GlossaryTerm>, a
          rank-based correlation measure. Correlations are per-wave and based
          on{' '}
          <GlossaryTerm slug="weighted-estimate">
            weighted survey estimates
          </GlossaryTerm>
          .
        </>
      }
      csv={{ headers: csvHeaders, rows: csvRows }}
      citation={{
        findingTitle:
          'Correlation matrix of respondent-level survey measures (weighted Spearman ρ)',
        variables: vars.map((v) => v.name),
        waves: [selectedWave],
        source: 'Understanding America Study, USC CESR',
        generatedAt: meta.generated_at,
      }}
      filenameBase={`strata_correlation_matrix_w${selectedWave}`}
    />
  );
}
