import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';
import { reportGuard } from '@/lib/auth/client-report-access';
import { createAdminClient } from '@/lib/supabase/server';
import type { SnapshotBuild } from '@/lib/data/client-reports';
export const dynamic='force-dynamic';
export default async function HistoricalDraft({params}:{params:Promise<{id:string}>}){
 const scope=await getWorkspaceScope();if(!scope||reportGuard(scope,'write'))notFound();
 const {id}=await params;
 if(!/^[a-f0-9-]{36}$/.test(id))notFound();
 const admin=await createAdminClient();
 const {data:row}=await admin.from('client_report_backfill_drafts').select('*').eq('tenant_id',scope.tenantId).eq('id',id).maybeSingle();
 if(!row||!isBrandInScope(scope,{slug:row.brand_slug})||!row.snapshot)notFound();
 const build=row.snapshot as SnapshotBuild,r=build.snapshot.report;
 const money=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
 return <div className="space-y-5"><Link href="/reporting/historical" className="text-sm text-primary">Back to historical drafts</Link><h1 className="text-2xl font-semibold">{build.brandName} · {build.periodLabel}</h1><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Private draft, not approved for sharing.</strong><p>Recorded days: {row.recorded_days}/{row.expected_days}. Check missing imports, historical roster membership, creator agreements and prior-period coverage before publishing. Retainer rates and deliverables are not verified by this backfill.</p><p>Generated {row.generated_at}. No historical sent date has been inferred.</p></div><div className="grid gap-3 sm:grid-cols-3">{[['Recorded GMV',money(r.totalGmv)],['Recorded orders',r.totalOrders],['Recorded units',r.totalItems??'Unavailable']].map(([k,v])=><div key={k} className="rounded-xl border border-border p-4"><p className="text-sm text-muted-foreground">{k}</p><p className="text-xl font-semibold">{v}</p></div>)}</div><h2 className="font-semibold">Top creators in recorded data</h2><div className="overflow-auto rounded-xl border border-border"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Creator</th><th>GMV</th><th>Orders</th></tr></thead><tbody>{r.topCreators.map(c=><tr key={c.name} className="border-t border-border"><td className="p-3">{c.name}</td><td>{money(c.gmv)}</td><td>{c.orders}</td></tr>)}</tbody></table></div><p className="text-sm text-muted-foreground">The complete calculated snapshot is saved privately. Use Reporting to prepare a reviewed client link after correcting missing source records and historical agreements.</p></div>;
}
