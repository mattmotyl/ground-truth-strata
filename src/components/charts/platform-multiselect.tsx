'use client';

// Shared platform multiselect — used by every analysis whose chart can
// be sliced by platform (Findings 01-05, 07, 08). Default selection is
// the 8 most prominent traditional social media platforms with
// sufficient sample sizes across waves; communication utilities
// (email / text messaging / FaceTime / WhatsApp) are not in the
// default but remain selectable.
//
// The 16-platform cap is a readability cap, not a data cap — CSV/table
// downloads still emit every platform in the underlying JSON. Colors
// 9-16 pair with a dashed line-stroke pattern on the trend chart so
// red/green-colorblind visitors get a secondary visual cue.
//
// none / something_else are excluded one layer up at the data loader
// (EXCLUDED_PLATFORM_SLUGS in src/lib/strata-data.ts) so they never
// reach this component.

export const DEFAULT_CHART_PLATFORMS: readonly string[] = [
  'facebook',
  'youtube',
  'instagram',
  'tiktok',
  'snapchat',
  'reddit',
  'linkedin',
  'twitter_x',
];

export const MAX_CHART_PLATFORMS = 16;

interface PlatformOption {
  slug: string;
  label: string;
}

interface PlatformMultiselectProps {
  platforms: readonly PlatformOption[];
  selected: readonly string[];
  onToggle: (slug: string) => void;
  onReset: () => void;
  maxSelected?: number;
  defaultCount?: number;
  // Optional per-slug color swatch shown to the left of the platform
  // label so the picker visually matches the chart. Slugs not in the
  // map render a transparent placeholder (preserves alignment).
  swatchBySlug?: ReadonlyMap<string, string>;
}

export function PlatformMultiselect({
  platforms,
  selected,
  onToggle,
  onReset,
  maxSelected = MAX_CHART_PLATFORMS,
  defaultCount = DEFAULT_CHART_PLATFORMS.length,
  swatchBySlug,
}: PlatformMultiselectProps) {
  const selectedSet = new Set(selected);
  const atCap = selected.length >= maxSelected;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-xs text-slate uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Platforms ({selected.length} of {maxSelected} max)
        </p>
      </div>
      <ul
        className="max-h-64 overflow-y-auto border border-mist rounded-md bg-paper px-2 py-1 space-y-0.5"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {platforms.map((p) => {
          const isSelected = selectedSet.has(p.slug);
          const disabled = !isSelected && atCap;
          const swatch = swatchBySlug?.get(p.slug);
          return (
            <li key={p.slug}>
              <label
                className={
                  'flex items-center gap-2 text-xs rounded px-1 py-0.5 ' +
                  (disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer hover:bg-mist/50')
                }
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => onToggle(p.slug)}
                  className="accent-plum"
                />
                {swatch ? (
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-sm shrink-0"
                    style={{ backgroundColor: swatch }}
                  />
                ) : (
                  <span className="inline-block h-2 w-2 shrink-0" />
                )}
                <span className={isSelected ? 'text-ink' : 'text-slate'}>
                  {p.label}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {atCap ? (
        <p
          className="text-[10px] text-slate italic"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {maxSelected}-platform maximum reached. Uncheck one to add another.
        </p>
      ) : null}
      <button
        type="button"
        onClick={onReset}
        className="text-xs text-mulberry hover:text-plum underline-offset-2 hover:underline"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Reset to default {defaultCount}
      </button>
    </div>
  );
}
