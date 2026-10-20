import { useMemo, useSyncExternalStore } from 'react';
const subscribe = (callback: () => void) => { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback); };
const snapshot = () => window.location.pathname + window.location.search;
export function navigate(href: string) { window.history.pushState({}, '', href); window.dispatchEvent(new PopStateEvent('popstate')); window.scrollTo(0, 0); }
const router = { push: navigate, replace: navigate, refresh: () => window.location.reload(), back: () => window.history.back(), prefetch: () => undefined };
export function useRouter() { return router; }
export function usePathname() { return useSyncExternalStore(subscribe, snapshot).split('?')[0]; }
export function useSearchParams() { const search = useSyncExternalStore(subscribe, snapshot).split('?')[1] ?? ''; return useMemo(() => new URLSearchParams(search), [search]); }
