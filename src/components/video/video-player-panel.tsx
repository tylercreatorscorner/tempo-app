'use client';

import { useRef } from 'react';
import { Dialog } from 'radix-ui';
import { X, ExternalLink } from 'lucide-react';
import { useVideoPanel } from './video-panel-context';
import { canonicalVideoUrl, formatCurrency, formatNumber } from '@/lib/utils/format';
import { BrandIdentity } from '@/components/creators/brand-identity';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import styles from './video-player-panel.module.css';

export function VideoPlayerPanel() {
  const { video, isOpen, closeVideo } = useVideoPanel();
  const brandMeta = useBrandMeta();
  const opener = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  const tiktokUrl = video ? canonicalVideoUrl(video.creator_name, video.video_id) ?? '' : '';

  return (
    <Dialog.Root open={isOpen && !!video} onOpenChange={next => { if (!next) closeVideo(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.panel} data-lenis-prevent
          onOpenAutoFocus={event => {
            const focused = document.activeElement;
            opener.current = focused instanceof HTMLElement && focused !== document.body ? focused : null;
            event.preventDefault();
            closeButton.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
          }}>
          <header className={styles.header}>
            <Dialog.Title>Video details</Dialog.Title>
            <Dialog.Close ref={closeButton} className={styles.close} aria-label="Close video details"><X size={18} aria-hidden="true" /></Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">Selected TikTok video, creator, and recorded performance for its reporting period.</Dialog.Description>

        {video && (
          <div className={styles.scroller}>
            {/* Video embed area */}
            <div className="bg-[#0a0a0a] flex items-center justify-center min-h-[520px] relative">
              <iframe
                title={video.video_title || "TikTok video"}
                src={`https://www.tiktok.com/embed/v2/${video.video_id}`}
                className="w-full h-[520px] border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            {/* Video info */}
            <div className="flex-1 p-5 space-y-4">
              {/* Title */}
              <h3 className="text-sm font-semibold text-[var(--foreground)] leading-snug">
                {video.video_title || 'Untitled video'}
              </h3>

              {/* Creator */}
              <p className="text-xs text-muted-foreground">@{video.creator_name}</p>

              {/* Brand pill */}
              {video.brand && (
                <BrandIdentity brand={video.brand} label={brandMeta.label(video.brand)} />
              )}

              {/* Product */}
              {video.product_name && (
                <p className="text-xs text-muted-foreground">Product: {video.product_name}</p>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                {video.gmv != null && (
                  <div className="rounded-xl border border-border bg-card px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">GMV</p>
                    <p className="text-lg font-semibold text-[var(--foreground)] tabular-nums mt-0.5">{formatCurrency(video.gmv)}</p>
                  </div>
                )}
                {video.orders != null && (
                  <div className="rounded-xl border border-border bg-card px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Orders</p>
                    <p className="text-lg font-semibold text-[var(--foreground)] tabular-nums mt-0.5">{formatNumber(video.orders)}</p>
                  </div>
                )}
                {video.items_sold != null && (
                  <div className="rounded-xl border border-border bg-card px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Items Sold</p>
                    <p className="text-lg font-semibold text-[var(--foreground)] tabular-nums mt-0.5">{formatNumber(video.items_sold)}</p>
                  </div>
                )}
                {video.days_selling != null && (
                  <div className="rounded-xl border border-border bg-card px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Days Selling</p>
                    <p className="text-lg font-semibold text-[var(--foreground)] tabular-nums mt-0.5">{video.days_selling}</p>
                  </div>
                )}
              </div>

              {/* Date range */}
              {video.date_range && (
                <p className="text-[10px] text-muted-foreground pt-1">{video.date_range}</p>
              )}

              {/* Open in TikTok link */}
              {tiktokUrl ? <a
                href={tiktokUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.externalLink}
              >
                <ExternalLink className="h-3 w-3" />
                Open in TikTok
              </a> : <p className="text-xs text-muted-foreground">Video link unavailable</p>}
            </div>
          </div>
        )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
