// Isolated preview provisioning. Credentials remain in ignored local files.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const PREVIEW = 'https://otwssgedcnxamcglqpnn.supabase.co';
const source = JSON.parse(fs.readFileSync('../bondie-discord-pilot/.env.bondie-branch.json', 'utf8'));
if (source.SUPABASE_URL !== PREVIEW) throw Error('Refusing non-preview database');
if (fs.existsSync('.env.local')) throw Error('Environment already exists; verify and reuse it instead of reprovisioning');
const db = createClient(PREVIEW, source.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
const runtimePath = '.env.tiktok-replay-runtime.json';
const state = fs.existsSync(runtimePath) ? JSON.parse(fs.readFileSync(runtimePath,'utf8')) : {
  email: 'tiktok-replay-owner@example.invalid', password: crypto.randomBytes(36).toString('base64url'),
  encryptionKey: crypto.randomBytes(32).toString('base64'), cronSecret: crypto.randomBytes(36).toString('base64url'),
  creatorSecret: crypto.randomBytes(48).toString('hex'), brandSlug: 'jiyu-api-test', previewUrl: PREVIEW,
};
const save=()=>fs.writeFileSync(runtimePath,JSON.stringify(state,null,2));
const check=r=>{if(r.error)throw Error('Preview setup failed: '+r.error.code);return r.data;};
save();
if (!state.tenantId) {
  const existing=check(await db.from('tenants').select('id').eq('slug','tiktok-api-replay-test').maybeSingle());
  state.tenantId=(existing??check(await db.from('tenants').insert({name:'TikTok API TEST · saved JiYu data',slug:'tiktok-api-replay-test',plan:'agency',onboarding_complete:true,tiktok_connected:true,creators_added:true}).select('id').single())).id; save();
}
if (!state.userId) {
  const existing=check(await db.auth.admin.listUsers()).users.find(u=>u.email===state.email);
  state.userId=(existing??check(await db.auth.admin.createUser({email:state.email,password:state.password,email_confirm:true,user_metadata:{name:'TikTok replay test owner'}})).user).id; save();
}
let role=check(await db.from('roles').select('id').eq('tenant_id',state.tenantId).eq('key','owner').maybeSingle());
if(!role)role=check(await db.from('roles').insert({tenant_id:state.tenantId,key:'owner',name:'TikTok test owner'}).select('id').single());
const profile=check(await db.from('user_profiles').select('id,tenant_id').eq('user_id',state.userId).maybeSingle());
if(profile && profile.tenant_id!==state.tenantId)throw Error('Test user belongs to another workspace');
if(!profile)check(await db.from('user_profiles').insert({user_id:state.userId,tenant_id:state.tenantId,email:state.email,name:'TikTok API TEST',role:'owner',role_id:role.id,status:'active'}));
let brand=check(await db.from('brands_v2').select('id,tenant_id').eq('slug',state.brandSlug).maybeSingle());
if(brand && brand.tenant_id!==state.tenantId)throw Error('Test brand belongs to another workspace');
if(!brand)brand=check(await db.from('brands_v2').insert({tenant_id:state.tenantId,name:'JiYu · historical API replay',slug:state.brandSlug}).select('id').single());
state.brandId=brand.id; save();
function encrypt(value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',Buffer.from(state.encryptionKey,'base64'),iv),b=Buffer.concat([c.update(value,'utf8'),c.final()]);return ['v1',iv.toString('base64'),c.getAuthTag().toString('base64'),b.toString('base64')].join('.');}
const connection=check(await db.from('tiktok_shop_connections').select('id,shop_id').eq('brand_slug',state.brandSlug).maybeSingle());
if(connection && connection.shop_id!=='replay-only-no-live-shop')throw Error('Unexpected test connection');
if(!connection)check(await db.from('tiktok_shop_connections').insert({brand_slug:state.brandSlug,shop_id:'replay-only-no-live-shop',shop_cipher:'replay-only',shop_name:'HISTORICAL REPLAY — no live TikTok connection',is_active:true,access_token_encrypted:encrypt('replay-only-access'),refresh_token_encrypted:encrypt('replay-only-refresh'),access_token_expires_at:'2099-01-01T00:00:00Z',refresh_token_expires_at:'2099-01-01T00:00:00Z'}));
const env={NEXT_PUBLIC_SUPABASE_URL:PREVIEW,NEXT_PUBLIC_SUPABASE_ANON_KEY:source.SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:source.SUPABASE_SERVICE_ROLE_KEY,TIKTOK_APP_KEY:'replay-only-app',TIKTOK_APP_SECRET:'replay-only-secret',TIKTOK_TOKEN_ENC_KEY:state.encryptionKey,CRON_SECRET:state.cronSecret,CREATOR_JWT_SECRET:state.creatorSecret};
fs.writeFileSync('.env.local',Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n');
console.log('Isolated TikTok test tenant, auth user and dummy connection configured. No live TikTok credentials used.');
