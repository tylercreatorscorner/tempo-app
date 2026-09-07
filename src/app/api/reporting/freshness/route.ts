/**
 * GET /api/reporting/freshness — how current a brand's data is.
 *
 * Powers the /reporting stale-data banner, so an operator knows when a report
 * they are about to generate would be built on old uploads.
 *
 * 🚨 THIS ROUTE HAD NO GUARD OF ITS OWN and took an arbitrary `brand` from
 * the query string.
 *
 * ⚠️ SCOPE OF THAT, STATED ACCURATELY: the middleware already bounced
 * unauthenticated callers, so this was not open to the internet. It was open to
 * every SIGNED-IN account — 191 creators and the brand contacts included — and
 * to any brand slug regardless of their scope. That both confirms a brand
 * exists on the platform and reports when that client last uploaded, which
 * together let a signed-in outsider enumerate the client list and watch which
 * accounts had gone quiet.
 *
 * ⚠️ BOTH AXES, because a guard on one is not a guard. can() answers "may they
 * see freshness at all", isBrandInScope answers "for this client" — without the
 * second, a manager scoped to two brands could read the recency of all sixteen.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getLatestReportDate } from '@/lib/data/discord-posts';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(scope, 'reporting', 'read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const brand = request.nextUrl.searchParams.get('brand') || 'all';

  /**
   * 'all' means "everything I can see", which is not the same thing for
   * everyone.
   *
   * ⚠️ NOT A 403 for a brand-scoped member. The banner is the only caller and
   * it always asks for 'all', so refusing would simply delete the stale-data
   * warning for every manager — punishing the person rather than the request.
   * Their 'all' is resolved to THEIR brands and answered honestly.
   */
  const scopedSlugs =
    scope.brandScope.kind === 'all' ? null : scope.brandScope.brandSlugs;

  if (brand === 'all') {
    if (scopedSlugs) {
      if (scopedSlugs.length === 0) {
        return NextResponse.json({ latestReportDate: null, daysOld: null });
      }
      // Small N by construction: a scoped member holds a handful of brands.
      const dates = (await Promise.all(scopedSlugs.map((s) => getLatestReportDate(s))))
        .filter((d): d is Date => d instanceof Date);
      if (dates.length === 0) {
        return NextResponse.json({ latestReportDate: null, daysOld: null });
      }
      const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
      return NextResponse.json({
        latestReportDate: latest.toISOString().slice(0, 10),
        daysOld: Math.floor((Date.now() - latest.getTime()) / 86_400_000),
      });
    }
  } else if (!isBrandInScope(scope, { slug: brand })) {
    // ⚠️ Same 403 for "not yours" and "does not exist". Distinguishing them is
    // how the enumeration this fixes would work.
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const latest = await getLatestReportDate(brand);
    if (!latest) {
      return NextResponse.json({ latestReportDate: null, daysOld: null });
    }
    const now = new Date();
    const daysOld = Math.floor((now.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24));
    return NextResponse.json({
      latestReportDate: latest.toISOString().slice(0, 10),
      daysOld,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load freshness';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
