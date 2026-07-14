'use client';

import { useEffect, useRef } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { useVideoPanel } from './video-panel-context';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { useBrandMeta } from '@/hooks/use-brand-meta';

export function VideoPlayerPanel() {
  const { video, isOpen, closeVideo } = useVideoPanel();
  const brandMeta = useBrandMeta();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) closeVideo();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeVideo]);

  // Lock body scroll while the panel is open. Reference-counted so it can't
  // clobber (or be clobbered by) a modal/sheet that's open at the same time.
  useBodyScrollLock(isOpen);

  const tiktokUrl = video
    ? `https://www.tiktok.com/@${video.creator_name}/video/${video.video_id}`
    : '';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeVideo}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[430px] bg-white shadow-2xl sm:rounded-l-2xl transition-transform duration-300 ease-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Close button */}
        <button
          onClick={closeVideo}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {video && (
          <div className="flex flex-col h-full overflow-y-auto">
            {/* Video embed area */}
            <div className="bg-[#0a0a0a] flex items-center justify-center min-h-[520px] relative">
              <iframe
                src={`https://www.tiktok.com/embed/v2/${video.video_id}`}
                className="w-full h-[520px] border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            {/* Video info */}
            <div className="flex-1 p-5 space-y-4">
              {/* Title */}
              <h3 className="text-sm font-semibold text-[#1A1B3A] leading-snug">
                {video.video_title || 'Untitled video'}
              </h3>

              {/* Creator */}
              <p className="text-xs text-gray-500">@{video.creator_name}</p>

              {/* Brand pill */}
              {video.brand && (
                <span
                  className="inline-block text-xs px-2.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: `${brandMeta.color(video.brand)}15`,
                    color: brandMeta.color(video.brand),
                  }}
                >
                  {brandMeta.label(video.brand)}
                </span>
              )}

              {/* Product */}
              {video.product_name && (
                <p className="text-xs text-gray-500">Product: {video.product_name}</p>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                {video.gmv != null && (
                  <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">GMV</p>
                    <p className="text-sm font-bold text-[#1A1B3A] tabular-nums mt-0.5">{formatCurrency(video.gmv)}</p>
                  </div>
                )}
                {video.orders != null && (
                  <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Orders</p>
                    <p className="text-sm font-bold text-[#1A1B3A] tabular-nums mt-0.5">{formatNumber(video.orders)}</p>
                  </div>
                )}
                {video.items_sold != null && (
                  <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Items Sold</p>
                    <p className="text-sm font-bold text-[#1A1B3A] tabular-nums mt-0.5">{formatNumber(video.items_sold)}</p>
                  </div>
                )}
                {video.days_selling != null && (
                  <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Days Selling</p>
                    <p className="text-sm font-bold text-[#1A1B3A] tabular-nums mt-0.5">{video.days_selling}</p>
                  </div>
                )}
              </div>

              {/* Date range */}
              {video.date_range && (
                <p className="text-[10px] text-gray-400 pt-1">{video.date_range}</p>
              )}

              {/* Open in TikTok link */}
              <a
                href={tiktokUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-[var(--primary)] transition-colors pt-2"
              >
                <ExternalLink className="h-3 w-3" />
                Open in TikTok
              </a>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
