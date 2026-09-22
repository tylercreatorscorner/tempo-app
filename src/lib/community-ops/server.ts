import { NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { canUseOperations } from './access';
import { createClient } from '@supabase/supabase-js';

export async function opsContext(write=false){
  const scope=await getWorkspaceScope();
  if(!canUseOperations(scope,write))return {denied:NextResponse.json({error:'This workspace is available to configured operators.'},{status:scope?403:401})};
  const url=process.env.COMMUNITY_OPS_DATABASE_URL,key=process.env.COMMUNITY_OPS_DATABASE_KEY,tenant=process.env.COMMUNITY_OPS_SOURCE_TENANT_ID;
  if(!url||new URL(url).hostname!=='otwssgedcnxamcglqpnn.supabase.co'||!key||tenant!=='ed1b9fdf-f6cb-414e-8d84-b4272e431181')return {denied:NextResponse.json({error:'Messages setup is incomplete.'},{status:503})};
  // Authenticate against Tempo first; explicitly map only the approved operator's workspace.
  // Keep the actual Tempo actor ID in review events; never impersonate the collector account.
  return {scope:{...scope!,tenantId:tenant},db:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})};
}
export const opsReply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

export function validOpsOrigin(request:Request){
  const origin=request.headers.get('origin');if(!origin)return false;
  const expected=new URL(request.url);if(origin===expected.origin)return true;
  // Next's local server may canonicalize 127.0.0.1 to localhost. Permit only
  // these two names on the dedicated development port; never in deployment.
  if(process.env.NODE_ENV!=='development')return false;
  try{const actual=new URL(origin);const loopback=new Set(['localhost','127.0.0.1']);return expected.protocol==='http:'&&actual.protocol==='http:'&&expected.port==='3108'&&actual.port==='3108'&&loopback.has(expected.hostname)&&loopback.has(actual.hostname);}catch{return false;}
}
