'use client';

import { Button } from '@/components/ui/button';
import { buildCSV, downloadBlob } from '@/lib/strata-formatters';

// CSV-only export for the report-card table sections (§2, §4). The chart
// sections (§1, §3, §5) use the full ChartActions (PNG + CSV + Cite);
// tables have no chart to rasterize, so they get this lighter control.
interface CsvDownloadButtonProps {
  headers: string[];
  rows: unknown[][];
  filenameBase: string;
}

export function CsvDownloadButton({
  headers,
  rows,
  filenameBase,
}: CsvDownloadButtonProps) {
  const handleCsv = () => {
    const text = buildCSV(headers, rows);
    downloadBlob(text, `${filenameBase}.csv`, 'text/csv');
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCsv}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      Download CSV
    </Button>
  );
}
