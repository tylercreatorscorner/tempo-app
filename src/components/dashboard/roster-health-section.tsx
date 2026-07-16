import { headers } from 'next/headers';
import { RosterHealthPanel } from './roster-health-panel';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface RosterSignals {
  total: number;
  healthy: number;
  behind: number;
  silent: number;
  unreadDms: number;
}

/**
 * Roster Health / unread-DMs counts, reused from /api/roster so they tie out to
 * the /roster page exactly (deriveHealth is the single source). This is a heavy
 * internal call (it runs the whole roster backend), so it lives in its own async
 * component and is Suspense-STREAMED on the dashboard — the rest of the page
 * renders immediately and Roster Health fills in when ready. Returns null on any
 * failure so the panel degrades gracefully.
 */
async function getRosterSignals(brand: string | null, range?: string, start?: string, end?: string): Promise<RosterSignals | null> {
  try {
    const h = await headers();
    const host = h.get('host');
    if (!host) return null;
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    const qs = new URLSearchParams({ view: 'managed', page: '1' });
    if (brand) qs.set('brand', brand);
    if (range) qs.set('range', range);
    // start/end are required for range=custom — /api/roster resolves last7 without them.
    if (start) qs.set('start', start);
    if (end) qs.set('end', end);
    const res = await fetch(`${proto}://${host}/api/roster?${qs.toString()}`, {
      headers: { cookie: h.get('cookie') ?? '' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      total: Number(d.total_managed) || 0,
      healthy: Number(d.healthy_count) || 0,
      behind: Number(d.behind_count) || 0,
      silent: Number(d.silent_count) || 0,
      unreadDms: Number(d.unread_dms_total) || 0,
    };
  } catch {
    return null;
  }
}

export async function RosterHealthSection({ brand, range, start, end }: { brand: string | null; range?: string; start?: string; end?: string }) {
  const s = await getRosterSignals(brand, range, start, end);
  if (!s) return null;
  return <RosterHealthPanel total={s.total} healthy={s.healthy} behind={s.behind} silent={s.silent} unreadDms={s.unreadDms} />;
}

export function RosterHealthSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Roster Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="h-3 w-8 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
          </div>
        ))}
        <div className="h-8 w-full animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}
