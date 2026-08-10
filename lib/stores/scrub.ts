"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";

/**
 * The scrub clock.
 *
 * This is the spine of the product. One timeline drives every card on the
 * dashboard: while it is being dragged, the wind compass, the UV band, the air
 * quality reading and the sun's position all describe the scrubbed moment
 * rather than the present one. Nothing on the page reads `Date.now()` directly.
 *
 * `scrubbedAt` is null when following live time. Releasing the playhead springs
 * back to live unless the user pinned a moment.
 */

interface ScrubState {
  /** Milliseconds, or null when following the present. */
  scrubbedAt: number | null;
  /** True while a pointer or key is actively moving the playhead. */
  dragging: boolean;
  /** Holds the scrubbed moment after release instead of returning to now. */
  pinned: boolean;

  scrubTo(instant: number): void;
  setDragging(dragging: boolean): void;
  togglePin(): void;
  returnToNow(): void;
}

export const useScrub = create<ScrubState>()((set, get) => ({
  scrubbedAt: null,
  dragging: false,
  pinned: false,

  scrubTo: (instant) => set({ scrubbedAt: instant }),
  setDragging: (dragging) => {
    if (!dragging && !get().pinned) set({ dragging, scrubbedAt: null });
    else set({ dragging });
  },
  togglePin: () =>
    set((state) => {
      if (state.pinned) return { pinned: false, scrubbedAt: null };
      return { pinned: true, scrubbedAt: state.scrubbedAt ?? Date.now() };
    }),
  returnToNow: () => set({ scrubbedAt: null, pinned: false }),
}));

/**
 * A clock that advances on the minute rather than every frame.
 *
 * Weather does not change fast enough to justify a per-second re-render, and a
 * minute tick keeps "Updated 3 minutes ago" honest without waking the tab
 * constantly.
 */
export function useLiveClock(intervalMs = 60_000): number {
  // Starts at 0 so the server and the first client render agree; the real time
  // arrives in an effect, after hydration.
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

/**
 * The moment every card should describe: the scrubbed instant when one is set,
 * otherwise the live clock.
 */
export function useActiveInstant(fallback: number): number {
  const scrubbedAt = useScrub((state) => state.scrubbedAt);
  const now = useLiveClock();
  return scrubbedAt ?? (now || fallback);
}

/** True when the dashboard is showing a moment other than the present. */
export function useIsScrubbing(): boolean {
  return useScrub((state) => state.scrubbedAt !== null);
}
