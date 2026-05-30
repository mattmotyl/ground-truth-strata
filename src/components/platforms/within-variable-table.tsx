'use client';

import { type CSSProperties } from 'react';
import type { TableGroup } from '@/lib/platform-report-adapters';
import { formatCI, formatN, formatPercent } from '@/lib/strata-formatters';

// Generic multi-wave grouped table. Each TableGroup is a spanning
// variable header; its rows are categories; each category has one cell
// per wave column. Cells show the value only (CI + n on hover via the
// native title attribute) and carry a subtle within-(group × column)
// magnitude tint. Shared by §2 demographics and §4 wellbeing.

export interface WaveColumn {
  wave: number;
  // Stacked header parts from waveTableHeader(): months ("Mar–May") and
  // year ("'23" or "'23–'24").
  header: { months: string; year: string };
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const MAX_TINT_ALPHA = 0.22;

interface WithinVariableTableProps {
  groups: TableGroup[];
  waveColumns: WaveColumn[];
  tintColor?: string;
  valueFormat?: (v: number | null | undefined) => string;
  variableHeader?: string;
  categoryHeader?: string;
  ariaLabel?: string;
}

export function WithinVariableTable({
  groups,
  waveColumns,
  tintColor = '#4B2E63',
  valueFormat = formatPercent,
  variableHeader = 'Variable',
  categoryHeader = 'Category',
  ariaLabel,
}: WithinVariableTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse" aria-label={ariaLabel}>
        <thead>
          <tr className="text-slate text-left border-b border-mist">
            <th
              className="py-2 pr-3 font-normal text-xs uppercase tracking-wide"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {variableHeader}
            </th>
            <th
              className="py-2 pr-3 font-normal text-xs uppercase tracking-wide"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {categoryHeader}
            </th>
            {waveColumns.map((c) => (
              <th
                key={c.wave}
                className="py-2 px-2 font-normal text-right align-bottom"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <div className="leading-tight text-xs text-slate">
                  <div>W{c.wave}</div>
                  <div>{c.header.months}</div>
                  <div>{c.header.year}</div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            // Per-column max within this variable group, for the tint ramp.
            const maxByCol = waveColumns.map((_, ci) => {
              let m = 0;
              for (const r of g.rows) {
                const v = r.cells[ci]?.value;
                if (typeof v === 'number' && v > m) m = v;
              }
              return m;
            });
            return g.rows.map((r, ri) => (
              <tr
                key={g.groupingVar + '|' + r.categoryValue}
                className="border-b border-mist/50"
              >
                {ri === 0 ? (
                  <td
                    rowSpan={g.rows.length}
                    className="py-2 pr-3 align-top text-plum"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    {g.variableLabel}
                  </td>
                ) : null}
                <td className="py-1.5 pr-3 text-ink/85">{r.categoryLabel}</td>
                {r.cells.map((cell, ci) => {
                  const shaded =
                    !cell.suppressed &&
                    cell.value !== null &&
                    maxByCol[ci] > 0;
                  const style: CSSProperties = {
                    fontFamily: 'var(--font-mono)',
                  };
                  if (shaded) {
                    style.backgroundColor = hexToRgba(
                      tintColor,
                      Math.min(
                        MAX_TINT_ALPHA,
                        ((cell.value as number) / maxByCol[ci]) *
                          MAX_TINT_ALPHA,
                      ),
                    );
                  }
                  const title =
                    cell.suppressed || cell.value === null
                      ? 'Fewer than 30 respondents; suppressed by design.'
                      : `${r.categoryLabel}, Wave ${cell.wave}: ${valueFormat(
                          cell.value,
                        )} (95% CI ${formatCI(
                          cell.ciLow,
                          cell.ciHigh,
                          valueFormat,
                        )}) · n=${formatN(cell.n)}`;
                  return (
                    <td
                      key={ci}
                      title={title}
                      className="py-1.5 px-2 text-right text-ink tabular-nums"
                      style={style}
                    >
                      {cell.suppressed || cell.value === null ? (
                        <span className="text-slate">—</span>
                      ) : (
                        valueFormat(cell.value)
                      )}
                    </td>
                  );
                })}
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
