'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children inside a viewport-fixed overlay portaled to <body>.
 *
 * Two problems this solves consistently:
 *
 *  1. The admin layout's <main class="animate-fade-in"> has a CSS animation,
 *     which creates a stacking context. An inline `fixed z-50` overlay would
 *     be trapped inside that subtree — the topbar (z-30, sibling of main)
 *     ends up painting over the backdrop. Portaling to <body> escapes the
 *     trap so the overlay paints above the chrome as expected.
 *
 *  2. Wheel events on the backdrop bubble through to the (unhidden) page
 *     scroll container behind it. Locking document.body.style.overflow for
 *     the overlay's lifetime stops that.
 *
 * Also wires the Esc-to-close convention so every consumer gets it for free.
 *
 * The visual chrome (backdrop element, panel chrome, sticky header, etc.) is
 * the consumer's responsibility — this wrapper is intentionally unopinionated
 * so it can host both centered dialogs and slide-in side sheets.
 */
export function ModalOverlay({
  children,
  onClose,
  closeOnBackdropClick = true,
  closeOnEsc = true,
}: {
  children: ReactNode;
  onClose: () => void;
  /** Treats clicks on the wrapping div (the backdrop area) as close. Default true. */
  closeOnBackdropClick?: boolean;
  /** Listen for Escape key. Default true. */
  closeOnEsc?: boolean;
}) {
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => { setPortalReady(true); }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (!closeOnEsc) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeOnEsc, onClose]);

  if (!portalReady) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      {children}
    </div>,
    document.body,
  );
}
