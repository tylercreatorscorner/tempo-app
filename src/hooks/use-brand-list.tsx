'use client';

import { useSyncExternalStore } from 'react';

export interface BrandListItem {
  slug: string;
  name: string;
  color: string;
  rawName: string;
  id: string;
}

type BrandListState = { brands: BrandListItem[]; loading: boolean };
const EMPTY_STATE: BrandListState = { brands: [], loading: true };
let snapshot = EMPTY_STATE;
let loaded = false;
let generation = 0;
let request: AbortController | null = null;
let contextListenerAttached = false;
const subscribers = new Set<() => void>();
const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY_STATE;

function publish(next: BrandListState) {
  snapshot = next;
  subscribers.forEach(notify => notify());
}

async function fetchBrands() {
  if (loaded || request) return;
  const controller = new AbortController();
  request = controller;
  const currentGeneration = generation;
  const current = () => generation === currentGeneration && request === controller;
  const timeout = setTimeout(() => controller.abort(), 20_000);
  if (!snapshot.loading) publish({ brands: [], loading: true });
  try {
    // The API applies the current tenant and brand permissions. Never infer
    // unrestricted access from a missing profile or an empty allowed-brands list.
    const response = await fetch('/api/brands?metadata=1', { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Brand choices unavailable');
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('brands' in body) || !Array.isArray(body.brands)) throw new Error('Invalid brand choices');
    const rows = body.brands as unknown[];
    if (rows.some(row => !row || typeof row !== 'object' || !('id' in row) || typeof row.id !== 'string' || !('slug' in row) || typeof row.slug !== 'string' || !row.slug || !('is_archived' in row) || typeof row.is_archived !== 'boolean' || !('parent_brand_id' in row) || (row.parent_brand_id !== null && typeof row.parent_brand_id !== 'string'))) throw new Error('Invalid brand choices');
    const brands = (rows as Array<Record<string, unknown>>)
      .filter(row => row.is_archived === false && row.parent_brand_id === null)
      .map(row => ({
        id: row.id as string,
        slug: row.slug as string,
        rawName: typeof row.name === 'string' ? row.name : row.slug as string,
        name: (typeof row.display_name === 'string' && row.display_name) || (typeof row.name === 'string' && row.name) || row.slug as string,
        color: (typeof row.color === 'string' && row.color) || '#6B7280',
      }));
    if (!current()) return;
    if (controller.signal.aborted) throw new Error('Brand choices timed out');
    loaded = true;
    publish({ brands, loading: false });
  } catch {
    if (current()) publish({ brands: [], loading: false });
  } finally {
    clearTimeout(timeout);
    if (current()) request = null;
  }
}

/** Refresh mounted selectors after create/archive, and discard stale scope data. */
export function invalidateBrandList() {
  generation += 1;
  request?.abort();
  request = null;
  loaded = false;
  publish({ brands: [], loading: true });
  if (subscribers.size) void fetchBrands();
}

function subscribe(notify: () => void) {
  // Keep this one listener after unmount so a workspace change also invalidates
  // cached choices before the next picker mounts.
  if (!contextListenerAttached && typeof window !== 'undefined') {
    window.addEventListener('workspace-context-changed', invalidateBrandList);
    contextListenerAttached = true;
  }
  subscribers.add(notify);
  void fetchBrands();
  return () => { subscribers.delete(notify); };
}

/** Active top-level choices from the canonical, authorized brand endpoint. */
export function useBrandList(): { brands: BrandListItem[]; loading: boolean } {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
