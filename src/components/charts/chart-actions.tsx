'use client';

import { type RefObject, useState, useSyncExternalStore } from 'react';
import { toPng } from 'html-to-image';
import { Button } from '@/components/ui/button';
import { buildCSV, downloadBlob } from '@/lib/strata-formatters';
import { CitationWidget, type CitationMetadata } from './citation-widget';

// Native share-sheet feature detection via useSyncExternalStore: returns
// false on the server and during hydration (so the markup matches), then
// the real client value. Avoids both a hydration mismatch and the
// set-state-in-effect lint rule. The value never changes after load, so
// `subscribe` is a no-op and `getSnapshot` returns a stable primitive.
const emptyShareSubscribe = () => () => {};
const getShareSnapshot = () =>
  typeof navigator !== 'undefined' && !!navigator.share;
const getShareServerSnapshot = () => false;

interface ChartActionsProps {
  chartRef: RefObject<HTMLDivElement | null>;
  csv: { rows: unknown[][]; headers: string[] };
  filenameBase: string;
  citation: CitationMetadata;
  // Share button opt-in. Default false so explorers without two-way URL
  // state (everything except /compare in v1) don't show a Share button
  // that would produce a non-specific link. The button reads
  // window.location.href, which is kept in sync by the explorer's URL
  // state, so "share this view" is literally "share the current URL".
  enableShare?: boolean;
}

export function ChartActions({
  chartRef,
  csv,
  filenameBase,
  citation,
  enableShare = false,
}: ChartActionsProps) {
  const [busy, setBusy] = useState<'png' | 'csv' | null>(null);
  const [copied, setCopied] = useState(false);
  // True only where the OS share sheet is available (mostly mobile /
  // secure contexts); elsewhere the handler copies the link, and the button
  // labels itself "Copy link" accordingly.
  const canShare = useSyncExternalStore(
    emptyShareSubscribe,
    getShareSnapshot,
    getShareServerSnapshot,
  );

  const handleShare = async () => {
    const url = window.location.href;
    const title = document.title;
    // Prefer the OS share sheet (mobile + some desktop browsers).
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // User dismissed the sheet — do nothing. Any other failure falls
        // through to the clipboard copy below.
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    // Fallback: copy the link, with brief confirmation.
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy link failed:', err);
    }
  };

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
      {enableShare ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleShare}
          aria-live="polite"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {copied ? 'Link copied!' : canShare ? 'Share' : 'Copy link'}
        </Button>
      ) : null}
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
