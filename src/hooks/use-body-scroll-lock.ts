'use client';

import { useEffect } from 'react';

/**
 * Reference-counted body-scroll lock.
 *
 * The app uses a body-scroll layout (the document itself scrolls; the sidebar
 * is `sticky`), so anything that wants to freeze scrolling has to write the
 * single global `document.body.style.overflow`. When more than one overlay does
 * that independently — a modal opened from inside a sheet, the video panel open
 * alongside a popup — naive "save prev / restore prev" implementations capture
 * each other's `'hidden'` and, depending on close order, leave the body stuck
 * at `overflow: hidden`. That freezes all mouse-wheel scrolling until a reload.
 *
 * This counter makes locking nesting-safe: the body is hidden while at least
 * one caller holds the lock, and the ORIGINAL overflow is restored only when
 * the last caller releases it. Every overlay must lock through here — nothing
 * should write `document.body.style.overflow` directly.
 */
let lockCount = 0;
let savedOverflow = '';

function acquire(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
}

function release(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) return; // defensive: ignore an unmatched release
  lockCount -= 1;
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
  }
}

/** Lock body scroll while `active` is true (default). Safe to nest/overlap. */
export function useBodyScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    acquire();
    return release;
  }, [active]);
}
