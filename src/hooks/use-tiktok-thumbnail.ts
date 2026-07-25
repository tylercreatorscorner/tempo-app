'use client';

import { useEffect, useState } from 'react';
import { resolveWatchUrl } from '@/lib/utils/format';

/**
 * Resolve a TikTok video's cover image via the public oEmbed endpoint —
 * the same client-side pattern the admin dashboard's VideoCard uses.
 * Module-level cache so a URL is only ever fetched once per session; oEmbed
 * serves CORS, so this works straight from the browser.
 *
 * A previous version of this comment claimed "every videos.video_link row is a
 * tiktok.com URL (verified in prod)". That stopped being true: TikTok's daily
 * exports began shipping expiring signed CDN links (host tiktokcdn-us.com,
 * ~2-day life) in the column that fed videos.video_link, and oEmbed resolves
 * nothing for a raw media file. Migration 119 makes the stored link canonical
 * again, but this hook no longer ASSUMES it — pass the video's identity as
 * `fallback` and it derives https://www.tiktok.com/@handle/video/id whenever
 * the stored link isn't a real watch URL.
 *
 * Returns { thumbnail, loading }. thumbnail stays null on failure — callers
 * render their placeholder tile, never a broken <img>.
 */
const cache = new Map<string, string | null>();

export function useTikTokThumbnail(
  videoUrl: string | null | undefined,
  /** Identity fallback — used when `videoUrl` is missing or non-canonical. */
  fallback?: { creatorName?: string | null; videoId?: string | number | null },
): {
  thumbnail: string | null;
  loading: boolean;
} {
  // null (not the raw stored value) when nothing usable can be built, so the
  // effect below skips the fetch instead of asking oEmbed about a CDN file.
  // Callers that lazy-load (RowCover's in-view gate) withhold BOTH arguments
  // to defer — withholding only the URL would still derive from the fallback.
  const resolved = resolveWatchUrl(videoUrl, fallback?.creatorName, fallback?.videoId);
  const cached = resolved ? cache.get(resolved) : null;
  const [thumbnail, setThumbnail] = useState<string | null>(cached ?? null);
  const [loading, setLoading] = useState<boolean>(!!resolved && !cache.has(resolved));

  useEffect(() => {
    if (!resolved) {
      setThumbnail(null);
      setLoading(false);
      return;
    }
    if (cache.has(resolved)) {
      setThumbnail(cache.get(resolved) ?? null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(resolved)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        const url = (data?.thumbnail_url as string | undefined) ?? null;
        cache.set(resolved, url);
        setThumbnail(url);
      })
      .catch(() => {
        if (!controller.signal.aborted) cache.set(resolved, null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [resolved]);

  return { thumbnail, loading };
}
