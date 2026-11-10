import sharp from 'sharp';
import { getTikTokVideoCover, parseTikTokVideoUrl } from '@/lib/media/tiktok-video-cover';

/** Artwork is optional decoration; frozen video identities and figures never change. */
export async function reportVideoCovers(videos: readonly { videoUrl: string | null }[]): Promise<Record<string, string>> {
  const urls = [...new Set(videos.map(video => video.videoUrl).filter((url): url is string => Boolean(url)))]
    .map(url => parseTikTokVideoUrl(url)?.url).filter((url): url is string => Boolean(url)).slice(0, 5);
  const entries: Record<string, string> = {};
  const work = Promise.all(urls.map(async url => {
    try {
      const cover = await getTikTokVideoCover(url);
      if (!cover) return;
      const image = await sharp(cover.bytes, { limitInputPixels: 24_000_000 })
        .rotate().resize({ width: 360, height: 480, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#f6f5f1' }).jpeg({ quality: 82 }).toBuffer();
      entries[url] = `data:image/jpeg;base64,${image.toString('base64')}`;
    } catch { /* A missing cover is normal and never blocks the document. */ }
  }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Optional artwork must leave time for the frozen document to render.
    await Promise.race([work, new Promise<void>(resolve => { timer = setTimeout(resolve, 8000); })]);
    return { ...entries };
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
