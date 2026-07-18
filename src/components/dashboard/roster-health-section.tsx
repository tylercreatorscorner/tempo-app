import { headers } from 'next/headers';
import { RosterHealthPanel } from './roster-health-panel';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface RosterSignals {
  total: number;
  healthy: number;
  behind: number;
  silent: number;
  affiliate: number;
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
async function getRosterSignals(brand: string | null): Promise<RosterSignals | null> {
  try {
    const h = await headers();
    const host = h.get('host');
    if (!host) return null;
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    // summary=0: this card renders FIVE counts (total/healthy/behind/silent/
    // unread DMs) and nothing GMV-derived, but page=1 made /api/roster compute
    // its KPI-summary block anyway — 3x computeManagedGmv (~84 RPCs) + 2
    // analytics calls per dashboard load, every value discarded here.
    //
    // Deliberately does NOT forward the dashboard's range/start/end. None of
    // these five are period metrics: "active creators" is roster size, "Silent
    // 14d+" is a fixed threshold, and "behind pace" is month-to-date by
    // definition (posts so far this month vs the MONTHLY target vs how far
    // through the month we are).
    //
    // #135 forwarded the range here and broke exactly that: /api/roster derives
    // health from posts in the SELECTED window, so a 7-day range compared 7 days
    // of posts against a monthly quota and reported almost everyone "behind" —
    // 530 healthy on /dashboard vs 84 on /dashboard?range=last7, with the same
    // "Last 7 Days" chip showing in both. Scope by brand only.
    const qs = new URLSearchParams({ view: 'managed', page: '1', summary: '0' });
    if (brand) qs.set('brand', brand);
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
      affiliate: Number(d.affiliate_count) || 0,
      unreadDms: Number(d.unread_dms_total) || 0,
    };
  } catch {
    return null;
  }
}

export async function RosterHealthSection({ brand }: { brand: string | null }) {
  const s = await getRosterSignals(brand);
  if (!s) return null;
  return <RosterHealthPanel total={s.total} healthy={s.healthy} behind={s.behind} silent={s.silent} affiliate={s.affiliate} unreadDms={s.unreadDms} />;
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
