'use client';

import { useEffect } from 'react';

// Shared two-way URL sync for the explorers' share feature. Writes the
// given query string into the address bar via history.replaceState
// (replace, not push, so changing controls never pollutes the back button).
//
// Pass the query string WITHOUT a leading '?'; an empty string clears the
// query, yielding the clean canonical path. Each explorer computes the
// string from its own pure encode function — only this plumbing is shared.
// No React state is set here, so it doesn't trip react-hooks/set-state-in-
// effect; the effect re-runs only when the encoded string actually changes.
export function useUrlSync(queryString: string): void {
  useEffect(() => {
    const url = queryString
      ? `${window.location.pathname}?${queryString}`
      : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [queryString]);
}
