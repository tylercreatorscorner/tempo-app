'use client';

import { useEffect, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import portal from './portal-workspace.module.css';

/** Portal-only navigation: focus stays in the drawer, Escape closes it, and
 *  closing returns to the menu button. Radix also locks background scrolling. */
export function PortalMobileDrawer({ open, onOpenChange, triggerRef, id, title, children, style, className }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  id: string;
  title: string;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) onOpenChange(false); };
    closeOnDesktop();
    if (desktop.addEventListener) desktop.addEventListener('change', closeOnDesktop);
    else desktop.addListener(closeOnDesktop);
    return () => {
      if (desktop.removeEventListener) desktop.removeEventListener('change', closeOnDesktop);
      else desktop.removeListener(closeOnDesktop);
    };
  }, [open, onOpenChange]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={portal.drawerOverlay} />
        <Dialog.Content id={id} className={cn(portal.drawer, className)} style={style}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = triggerRef.current;
            if (trigger?.getClientRects().length) trigger.focus({ preventScroll: true });
            else document.querySelector<HTMLElement>('main[tabindex="-1"]')?.focus({ preventScroll: true });
          }}>
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">Choose a page or switch your brand.</Dialog.Description>
          {children}
          <Dialog.Close asChild><button type="button" className={portal.drawerClose} aria-label="Close menu"><X className="h-5 w-5" /></button></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
