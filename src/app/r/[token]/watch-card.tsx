'use client';

/**
 * Watchable top-content card on the public client report — TikTok cover via
 * public oEmbed, one click swaps in the official embed player so the video
 * plays right on the report. Falls back to a brand-gradient tile when the
 * cover can't resolve; cards without a real video id just aren't clickable.
 */
import { useState } from 'react';
import { useTikTokThumbnail } from '@/hooks/use-tiktok-thumbnail';
import { TikTokPlayer } from '@/components/posts/tiktok-player';

const FALLBACKS = [
  'linear-gradient(135deg,#3b3e8f,#d946aa)',
  'linear-gradient(135deg,#155e75,#34d399)',
  'linear-gradient(135deg,#831843,#fb7185)',
];

export function WatchCard({
  videoUrl,
  videoId,
  title,
  creator,
  gmv,
  viewsLabel,
  index,
}: {
  videoUrl: string | null;
  videoId: string | null;
  title: string;
  creator: string;
  gmv: number;
  viewsLabel: string | null;
  index: number;
}) {
  const [playing, setPlaying] = useState(false);
  const { thumbnail } = useTikTokThumbnail(videoUrl);
  const playable = !!videoId;

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#e7e7f2] bg-white">
      <div
        className="relative flex aspect-[9/12] items-center justify-center overflow-hidden"
        style={{ background: FALLBACKS[index % FALLBACKS.length] }}
      >
        {playing && videoId ? (
          <TikTokPlayer videoId={videoId} className="absolute inset-0 h-full w-full border-0" />
        ) : (
          <button
            type="button"
            onClick={() => playable && setPlaying(true)}
            disabled={!playable}
            aria-label={playable ? `Play video by ${creator}` : 'Video unavailable'}
            className={`absolute inset-0 flex items-center justify-center ${playable ? 'cursor-pointer' : 'cursor-default'}`}
          >
            {thumbnail && (
              /* eslint-disable-next-line @next/next/no-img-element -- oEmbed CDN cover, remote domain not in next.config */
              <img src={thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )}
            {viewsLabel && (
              <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-extrabold text-white backdrop-blur-sm">
                {viewsLabel} views
              </span>
            )}
            {playable && (
              <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/35 bg-white/25 text-[15px] text-white backdrop-blur-sm">
                &#9654;
              </span>
            )}
          </button>
        )}
      </div>
      <div className="px-3.5 pb-3 pt-2.5">
        <div className="line-clamp-2 text-xs font-semibold leading-snug text-[#171a33]">{title}</div>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="truncate text-[11px] text-[#6b7093]">{creator}</span>
          <span className="text-sm font-extrabold tabular-nums text-[#5b5ee8]">
            ${Math.round(gmv).toLocaleString('en-US')}
          </span>
        </div>
      </div>
    </div>
  );
}
