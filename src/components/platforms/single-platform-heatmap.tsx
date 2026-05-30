'use client';

import type { HeatmapTable } from '@/lib/platform-report-adapters';
import { magnitudeColor } from '@/lib/compare-adapters';
import { STRATA_PALETTES } from '@/lib/strata-charts';
import { formatCI, formatN, formatPercent } from '@/lib/strata-formatters';

// §3 follow-up heatmap for ONE platform: response options as rows, waves
// as columns, % of affected users per cell on a warm (harm) color ramp.
// CI + n on hover; suppressed cells show "—".
interface SinglePlatformHeatmapProps {
  table: HeatmapTable;
  datesByWave: ReadonlyMap<number, string>;
  ariaLabel?: string;
}

const MONO = { fontFamily: 'var(--font-mono)' } as const;

export function SinglePlatformHeatmap({
  table,
  datesByWave,
  ariaLabel,
}: SinglePlatformHeatmapProps) {
  const scaleMax = table.max > 0 ? table.max : 1;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse" aria-label={ariaLabel}>
        <thead>
          <tr className="text-slate text-left border-b border-mist">
            <th className="py-1.5 pr-3 font-normal" style={MONO}>
              Response option
            </th>
            {table.waves.map((w) => (
              <th
                key={w}
                className="py-1.5 px-2 font-normal text-right"
                style={MONO}
              >
                W{w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.options.map((row) => (
            <tr key={row.optionLabel} className="border-b border-mist/40">
              <td className="py-1.5 pr-3 text-ink/85">{row.optionLabel}</td>
              {row.cells.map((c, i) => {
                if (c.suppressed || c.value === null) {
                  return (
                    <td
                      key={i}
                      title="Fewer than 30 respondents; suppressed by design."
                      className="py-1.5 px-2 text-right text-slate"
                      style={MONO}
                    >
                      —
                    </td>
                  );
                }
                const bg = magnitudeColor(
                  c.value,
                  scaleMax,
                  STRATA_PALETTES.harm,
                );
                // Light text on the darkest warm cells for contrast.
                const dark = c.value / scaleMax > 0.62;
                const dates = datesByWave.get(c.wave) ?? '';
                const title = `${row.optionLabel} · Wave ${c.wave}${
                  dates ? ` (${dates})` : ''
                }: ${formatPercent(c.value)} (95% CI ${formatCI(
                  c.ciLow,
                  c.ciHigh,
                )}) · n=${formatN(c.n)}`;
                return (
                  <td
                    key={i}
                    title={title}
                    className="py-1.5 px-2 text-right"
                    style={{
                      ...MONO,
                      backgroundColor: bg,
                      color: dark ? '#FFFFFF' : '#18161F',
                    }}
                  >
                    {formatPercent(c.value)}
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
