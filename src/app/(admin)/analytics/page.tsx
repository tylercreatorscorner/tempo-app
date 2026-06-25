import { redirect } from 'next/navigation';

// The Analytics page was retired — its value (performance trend chart + YoY,
// month-end pacing, and Notable Changes / movers) folded into the Dashboard,
// which is now the single landing page that tells the full story. Forward any
// bookmarked /analytics links (preserving range + brand) to /dashboard.
export default async function AnalyticsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; brand?: string }>;
}) {
  const p = await searchParams;
  const qs = new URLSearchParams();
  if (p.range) qs.set('range', p.range);
  if (p.brand) qs.set('brand', p.brand);
  redirect(`/dashboard${qs.toString() ? `?${qs}` : ''}`);
}
