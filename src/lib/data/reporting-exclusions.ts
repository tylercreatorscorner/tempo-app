import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReportingExclusions { month: string; handles: string[]; creatorIds: string[] }
const normalize = (value: string) => value.trim().replace(/^@+/, '').toLowerCase();

/** Roster tags are per brand. Never apply a single-brand exclusion to a multi-brand rollup. */
export async function getReportingExclusions(client: SupabaseClient, tenantId: string, brands: string[], end: string): Promise<ReportingExclusions> {
  const month=end.slice(0,7);
  const {data,error}=await client.from('managed_creators')
    .select('creator_id,real_name,account_1,account_2,account_3,account_4,account_5,account_6,account_7,account_8,account_9,account_10')
    .eq('tenant_id',tenantId).in('brand',brands).contains('tags',[`reporting-exclude:${month}`]);
  if(error) throw Error('Could not verify creator reporting exclusions.');
  const handles=new Set<string>();const creatorIds=new Set<string>();
  for(const row of data??[]) {
    if(row.creator_id) creatorIds.add(row.creator_id);
    if(row.real_name) handles.add(normalize(row.real_name));
    for(let i=1;i<=10;i++) {const handle=(row as Record<string,unknown>)[`account_${i}`];if(typeof handle==='string'&&handle.trim())handles.add(normalize(handle));}
  }
  return {month,handles:[...handles],creatorIds:[...creatorIds]};
}

/** Remove named appearances, never subtract unverified financial values from store totals.
 * Managed totals are recomputed by the same report RPCs using the per-month roster scope. */
export function filterExcludedReportCreators<T>(value:T, exclusions:ReportingExclusions):T {
  if(!exclusions.handles.length&&!exclusions.creatorIds.length)return value;
  const handles=new Set(exclusions.handles.map(normalize));const ids=new Set(exclusions.creatorIds);
  function visit(node:unknown):unknown {
    if(node===null||typeof node!=='object'||node instanceof Date)return node;
    if(Array.isArray(node))return node.map(visit).filter(v=>v!==null);
    const record=node as Record<string,unknown>;
    if(['handle','creator','name','realName','creatorName','creator_name'].some(k=>typeof record[k]==='string'&&handles.has(normalize(record[k] as string)))
      ||typeof record.creatorId==='string'&&ids.has(record.creatorId)) return null;
    return Object.fromEntries(Object.entries(record).map(([key,child])=>[key,key==='reportingExclusions'?child:visit(child)]));
  }
  return visit(value) as T;
}
