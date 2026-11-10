import type { ContentResponse } from './studio-content';

/** Keep a stalled library request recoverable without replacing known results. */
export async function requestContentLibrary(url: string, parentSignal: AbortSignal): Promise<ContentResponse> {
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(45_000)]);
  try {
    const response = await fetch(url, { signal });
    const body: unknown = await response.json();
    signal.throwIfAborted();
    if (!response.ok || !body || typeof body !== 'object' || !('posts' in body) || !Array.isArray(body.posts) || !('totals' in body)) {
      throw new Error('Content could not be loaded. Please try again.');
    }
    return body as ContentResponse;
  } catch (error) {
    if (signal.aborted && !parentSignal.aborted) throw new Error('Content took too long to load. Your last loaded results are preserved. Please retry.');
    throw error;
  }
}

/** A next-video action replaces its inspector, so the old trigger may be gone. */
export function restoreContentPreviewFocus(opener: HTMLElement | null, fallback?: () => boolean): boolean {
  if (opener?.isConnected && !('disabled' in opener && opener.disabled)) {
    opener.focus({ preventScroll: true });
    return true;
  }
  return fallback?.() ?? false;
}
