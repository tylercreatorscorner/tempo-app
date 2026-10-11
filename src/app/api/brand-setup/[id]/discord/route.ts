import {NextRequest,NextResponse} from 'next/server';
import {getWorkspaceScope} from '@/lib/auth/workspace-scope';
import {createAdminClient} from '@/lib/supabase/server';
import {canManageBrandSetup,canReadBrandSetup} from '@/lib/brands/setup-access';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const scope=await getWorkspaceScope();if(!canManageBrandSetup(scope))return NextResponse.json({error:'Forbidden'},{status:403});
 const {id}=await params;let body:{guildId?:string;verifyOnly?:boolean};try{body=await req.json();}catch{return NextResponse.json({error:'Invalid request.'},{status:400});}
 if(typeof body.guildId!=='string'||!/^\d{17,20}$/.test(body.guildId))return NextResponse.json({error:'Enter the Discord server ID. In Discord, enable Developer Mode and copy the server ID.'},{status:400});
 const db=await createAdminClient();
 const {data:brand,error}=await db.from('brands_v2').select('id,slug,tenant_id,is_archived,discord_guild_id').eq('id',id).eq('tenant_id',scope!.tenantId).maybeSingle();
 if(error||!brand||brand.is_archived||!canReadBrandSetup(scope,brand))return NextResponse.json({error:'Brand unavailable.'},{status:404});
 // Prevent one server being silently repurposed for a different brand.
 const {data:used,error:usedError}=await db.from('brands_v2').select('id').eq('discord_guild_id',body.guildId).neq('id',id).limit(1);
 if(usedError)return NextResponse.json({error:'Server ownership could not be checked.'},{status:503});
 if(used?.length)return NextResponse.json({error:'This server is already linked to another brand.'},{status:409});
 if(body.verifyOnly && body.guildId!==brand.discord_guild_id)return NextResponse.json({error:'Save this server before verifying it.'},{status:400});
 const token=process.env.DISCORD_BOT_TOKEN;let accessible=false,serverName:null|string=null,check='Tempo Bot is not configured in this environment.';
 if(token){
  try{
   const response=await fetch(`https://discord.com/api/v10/guilds/${body.guildId}`,{headers:{Authorization:`Bot ${token}`},cache:'no-store',signal:AbortSignal.timeout(8000)});
   if(response.ok){const guild=await response.json();accessible=true;serverName=typeof guild.name==='string'?guild.name:null;check='Tempo Bot can access this server. Channel and role permissions need their own setup.';}
   else check=response.status===403||response.status===404?'Tempo Bot cannot access this server yet. Add the bot to the server, then verify again.':'Discord verification is temporarily unavailable. Retry verification.';
  }catch{check='Discord verification timed out. Retry verification.';}
 }
 if(!body.verifyOnly){const {error:saveError}=await db.from('brands_v2').update({discord_guild_id:body.guildId,updated_at:new Date().toISOString()}).eq('id',id).eq('tenant_id',scope!.tenantId);if(saveError)return NextResponse.json({error:'Server link could not be saved.'},{status:503});}
 const appId=process.env.DISCORD_CLIENT_ID;
 const botInviteUrl=appId&&/^\d{17,20}$/.test(appId)?`https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot%20applications.commands&permissions=68608&guild_id=${body.guildId}&disable_guild_select=true`:null;
 return NextResponse.json({saved:true,accessible,serverName,message:check,botInviteUrl});
}
