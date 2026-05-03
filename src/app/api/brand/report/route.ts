import { NextResponse } from 'next/server';
import { loadBrandPortalContext } from '@/lib/data/brand-portal';
import {
  getBrandPortalDashboard,
  type BrandPortalPeriod,
} from '@/lib/data/brand-portal-overview';
import { createAdminClient } from '@/lib/supabase/server';
import { BRAND_UUID_MAP } from '@/lib/utils/constants';

export const dynamic = 'force-dynamic';

const PERIODS = new Set<BrandPortalPeriod>([
  'yesterday',
  '7d',
  '30d',
  'this_month',
  'last_month',
]);

export async function GET(request: Request) {
  const ctx = await loadBrandPortalContext();
  if (!ctx.activeBrand) {
    return NextResponse.json({ error: 'No brand assigned' }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'roster';
  const periodParam = url.searchParams.get('period') ?? '7d';
  const period = PERIODS.has(periodParam as BrandPortalPeriod)
    ? (periodParam as BrandPortalPeriod)
    : '7d';

  const admin = await createAdminClient();
  const brandUuid = BRAND_UUID_MAP[ctx.activeBrand.slug] ?? ctx.activeBrand.id;
  const data = await getBrandPortalDashboard(
    admin,
    brandUuid,
    ctx.activeBrand.slug,
    ctx.activeBrand.display_name || ctx.activeBrand.name,
    period,
  );

  const dateStamp = new Date().toISOString().split('T')[0];
  const filename = `tempo_${ctx.activeBrand.slug}_${type}_${period}_${dateStamp}.csv`;

  let csv: string;
  if (type === 'videos') {
    const rows = [
      [
        'Posted',
        'Creator handle',
        'Title',
        'Lifetime GMV (USD)',
        'Lifetime orders',
        `Period GMV (${period})`,
        `Period orders (${period})`,
        'TikTok URL',
      ],
      ...data.videos.map((v) => [
        v.postDate ? v.postDate.toISOString().split('T')[0] : '',
        v.creatorHandle,
        v.title,
        v.lifetimeGmv.toFixed(2),
        String(v.lifetimeOrders),
        v.periodGmv.toFixed(2),
        String(v.periodOrders),
        v.url ?? `https://www.tiktok.com/@${v.creatorHandle}/video/${v.videoId}`,
      ]),
    ];
    csv = rows.map(toCsvRow).join('\n');
  } else {
    // roster
    const rows = [
      [
        'Creator name',
        'Primary handle',
        'All handles',
        `GMV (${period})`,
        `Orders (${period})`,
        `Posts (${period})`,
        'Lifetime GMV',
        'Tier',
        'Monthly retainer',
        'Monthly post requirement',
      ],
      ...data.creators.map((c) => [
        c.realName ?? '',
        c.primaryHandle,
        c.handles.map((h) => `@${h}`).join(' '),
        c.gmv.toFixed(2),
        String(c.orders),
        String(c.posts),
        c.lifetimeGmv.toFixed(2),
        c.currentTier ?? '',
        c.retainer ? c.retainer.toFixed(2) : '',
        c.monthlyPostRequirement != null ? String(c.monthlyPostRequirement) : '',
      ]),
    ];
    csv = rows.map(toCsvRow).join('\n');
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function toCsvRow(values: string[]): string {
  return values
    .map((v) => {
      if (v == null) return '';
      const needsQuote = /[",\n\r]/.test(v);
      const escaped = v.replace(/"/g, '""');
      return needsQuote ? `"${escaped}"` : escaped;
    })
    .join(',');
}
