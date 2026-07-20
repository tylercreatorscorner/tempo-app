'use client';

import { useEffect, useState } from 'react';

/**
 * Resolve a TikTok video's cover image via the public oEmbed endpoint —
 * the same client-side pattern the admin dashboard's VideoCard uses.
 * Module-level cache so a URL is only ever fetched once per session;
 * every videos.video_link row is a tiktok.com URL (verified in prod), and
 * oEmbed serves CORS, so this works straight from the browser.
 *
 * Returns { thumbnail, loading }. thumbnail stays null on failure — callers
 * render their placeholder tile, never a broken <img>.
 */
const cache = new Map<string, string | null>();

export function useTikTokThumbnail(videoUrl: string | null | undefined): {
  thumbnail: string | null;
  loading: boolean;
} {
  const cached = videoUrl ? cache.get(videoUrl) : null;
  const [thumbnail, setThumbnail] = useState<string | null>(cached ?? null);
  const [loading, setLoading] = useState<boolean>(!!videoUrl && !cache.has(videoUrl));

  useEffect(() => {
    if (!videoUrl) {
      setThumbnail(null);
      setLoading(false);
      return;
    }
    if (cache.has(videoUrl)) {
      setThumbnail(cache.get(videoUrl) ?? null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        const url = (data?.thumbnail_url as string | undefined) ?? null;
        cache.set(videoUrl, url);
        setThumbnail(url);
      })
      .catch(() => {
        if (!controller.signal.aborted) cache.set(videoUrl, null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [videoUrl]);

  return { thumbnail, loading };
}
