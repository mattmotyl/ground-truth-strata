// Shared platform-selection constants.
//
// Kept in a plain (non-'use client') module so server code
// (compare/page.tsx, generateMetadata) and the pure URL-state helpers can
// read them without pulling a client component into the server graph.
// platform-multiselect.tsx imports and re-exports these, so its existing
// importers are unaffected.

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
