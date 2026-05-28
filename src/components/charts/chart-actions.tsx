'use client';

import { type RefObject, useState } from 'react';
import { toPng } from 'html-to-image';
import { Button } from '@/components/ui/button';
import { buildCSV, downloadBlob } from '@/lib/strata-formatters';
import { CitationWidget, type CitationMetadata } from './citation-widget';

interface ChartActionsProps {
  chartRef: RefObject<HTMLDivElement | null>;
  csv: { rows: unknown[][]; headers: string[] };
  filenameBase: string;
  citation: CitationMetadata;
}

export function ChartActions({
  chartRef,
  csv,
  filenameBase,
  citation,
}: ChartActionsProps) {
  const [busy, setBusy] = useState<'png' | 'csv' | null>(null);

  const handlePng = async () => {
    if (!chartRef.current) return;
    setBusy('png');
    const root = chartRef.current;
    // Scroll containers (e.g. the heatmap's overflow-x-auto wrapper)
    // capture scrollbar chrome and clip content. Temporarily force their
    // overflow to visible so the export shows the full table, then
    // restore the original inline overflow afterward.
    const restores: Array<[HTMLElement, string]> = [];
    root.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const style = getComputedStyle(el);
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        restores.push([el, el.style.overflow]);
        el.style.overflow = 'visible';
      }
    });
    try {
      const dataUrl = await toPng(root, {
        backgroundColor: '#F6F3EE',
        pixelRatio: 2,
        cacheBust: true,
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      downloadBlob(blob, `${filenameBase}.png`, 'image/png');
    } catch (err) {
      console.error('PNG export failed:', err);
    } finally {
      for (const [el, prev] of restores) el.style.overflow = prev;
      setBusy(null);
    }
  };

  const handleCsv = () => {
    setBusy('csv');
    try {
      const text = buildCSV(csv.headers, csv.rows);
      downloadBlob(text, `${filenameBase}.csv`, 'text/csv');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="flex items-center gap-2 flex-wrap"
      role="toolbar"
      aria-label="Chart actions"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handlePng}
        disabled={busy === 'png'}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {busy === 'png' ? 'Exporting…' : 'Download PNG'}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCsv}
        disabled={busy === 'csv'}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {busy === 'csv' ? 'Exporting…' : 'Download CSV'}
      </Button>
      <CitationWidget meta={citation} />
    </div>
  );
}
