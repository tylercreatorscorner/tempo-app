'use client';

/**
 * In-platform TikTok player — the official embed iframe
 * (tiktok.com/embed/v2/{video_id}). Plays inside Tempo: no API keys, no
 * approval, works for any PUBLIC video by its real video id. Deleted or
 * private videos render TikTok's own "video unavailable" state inside the
 * frame, so callers should keep a small external-link escape hatch nearby.
 *
 * No sandbox attribute: the embed needs its own scripts to play.
 */
export function TikTokPlayer({ videoId, className }: { videoId: string; className?: string }) {
  return (
    <iframe
      src={`https://www.tiktok.com/embed/v2/${encodeURIComponent(videoId)}`}
      className={className}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      title="TikTok video player"
    />
  );
}
