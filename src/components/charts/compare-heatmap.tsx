'use client';

import {
  magnitudeColor,
  type HeatmapData,
} from '@/lib/compare-adapters';
import { CHART_FONTS, STRATA_PALETTES } from '@/lib/strata-charts';
import { formatCI, formatN, formatPercent } from '@/lib/strata-formatters';

// =====================================================================
// Chart Type #4 — heatmap table for /compare Theme A drill-downs.
// Platforms as rows, response options as columns; cell intensity on the
// warm (harm) scale, % text inside each cell, suppressed cells show "—".
// 95% CI + n surface in the native cell tooltip (title attribute).
// Horizontally scrollable for wide option sets (e.g. nuximpact, 11 cols).
// =====================================================================

// Black/white cell text by background luminance, for legibility on both
// light and dark warm-scale fills.
function readableTextColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#18161F' : '#FFFFFF';
}

export function CompareHeatmap({ data }: { data: HeatmapData }) {
  const { options, rows } = data;

  if (rows.length === 0 || options.length === 0) {
    return (
      <div
        className="py-16 text-center text-slate text-sm"
        style={{ fontFamily: CHART_FONTS.mono }}
      >
        No platforms with displayable data for this selection.
      </div>
    );
  }

  // Intensity scale max = largest cell value across the visible table.
  let max = 0.05;
  for (const row of rows) {
    for (const o of options) {
      const v = row.cells[o]?.value;
      if (typeof v === 'number' && v > max) max = v;
    }
  }

  return (
    <div className="overflow-x-auto">
      <table
        className="border-collapse text-xs"
        style={{ fontFamily: CHART_FONTS.mono }}
      >
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-paper p-2 text-left align-bottom text-slate font-normal">
              Platform
            </th>
            {options.map((o) => (
              <th
                key={o}
                className="p-2 align-bottom text-left text-slate font-normal"
                style={{ minWidth: 84, maxWidth: 132 }}
              >
                {o}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.platform_slug}>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-paper p-2 text-left text-ink font-medium whitespace-nowrap"
              >
                {row.label}
              </th>
              {options.map((o) => {
                const cell = row.cells[o];
                if (!cell || cell.suppressed || cell.value === null) {
                  return (
                    <td
                      key={o}
                      title="Suppressed (n < 30)"
                      className="p-2 text-center text-slate border border-paper"
                    >
                      —
                    </td>
                  );
                }
                const bg = magnitudeColor(cell.value, max, STRATA_PALETTES.harm);
                const fg = readableTextColor(bg);
                const tip = `${formatPercent(cell.value)} ${formatCI(
                  cell.ciLow,
                  cell.ciHigh,
                )} · n=${formatN(cell.n)}`;
                return (
                  <td
                    key={o}
                    title={tip}
                    className="p-2 text-center border border-paper"
                    style={{ backgroundColor: bg, color: fg }}
                  >
                    {formatPercent(cell.value, 0)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
