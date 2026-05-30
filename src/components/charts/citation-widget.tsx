'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface CitationMetadata {
  findingTitle: string;
  variables: string[];
  waves: number[];
  source: string;
  generatedAt?: string;
  url?: string;
}

function buildCitation(meta: CitationMetadata): string {
  const year = new Date().getFullYear();
  const wavesLabel =
    meta.waves.length === 1
      ? `wave ${meta.waves[0]}`
      : `waves ${Math.min(...meta.waves)}-${Math.max(...meta.waves)}`;
  const url = meta.url ?? 'https://strata.mattmotyl.com';
  const lines = [
    `Motyl, M. (${year}). "${meta.findingTitle}" — UAS panel, ${wavesLabel}.`,
    `Ground Truth Strata (v0.1.0). ${url}`,
    `Variables: ${meta.variables.join(', ')}. Estimates: weighted.`,
    `Source: ${meta.source}.`,
  ];
  if (meta.generatedAt) {
    lines.push(`Precomputed JSON generated: ${meta.generatedAt}.`);
  }
  return lines.join('\n');
}

interface CitationWidgetProps {
  meta: CitationMetadata;
}

export function CitationWidget({ meta }: CitationWidgetProps) {
  const [copied, setCopied] = useState(false);
  const citation = buildCitation(meta);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API can fail in non-secure contexts; the textarea is
      // available as a manual fallback.
    }
  };

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        }
      >
        Cite this finding
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cite this finding</DialogTitle>
          <DialogDescription>
            Auto-generated from the chart metadata. Edit before pasting if
            you need a different format.
          </DialogDescription>
        </DialogHeader>
        <textarea
          readOnly
          value={citation}
          className="w-full h-40 p-3 border border-mist rounded-md bg-mist/40 text-sm resize-y"
          style={{ fontFamily: 'var(--font-mono)' }}
          aria-label="Citation text"
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate">
            Required UAS attribution applies to all derived work — see{' '}
            <a href="/about" className="text-mulberry hover:text-plum">
              the About page
            </a>
            .
          </p>
          <Button
            type="button"
            onClick={handleCopy}
            size="sm"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {copied ? 'Copied' : 'Copy to clipboard'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
