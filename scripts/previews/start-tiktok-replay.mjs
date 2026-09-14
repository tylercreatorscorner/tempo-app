import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
const root=fileURLToPath(new URL('../../',import.meta.url));
const vars=dotenv.parse(fs.readFileSync(path.join(root,'.env.local')));
if(vars.NEXT_PUBLIC_SUPABASE_URL!=='https://otwssgedcnxamcglqpnn.supabase.co'||vars.TIKTOK_APP_KEY!=='replay-only-app')throw Error('Refusing non-test configuration');
const inherited=Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP','APPDATA','LOCALAPPDATA','USERPROFILE','ComSpec'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const preload=pathToFileURL(path.join(root,'scripts/previews/tiktok-replay-preload.mjs')).href;
const env={...inherited,...vars,TIKTOK_REPLAY_TEST:'1',NEXT_TELEMETRY_DISABLED:'1',NODE_OPTIONS:`--import=${preload}`};
console.log('TikTok replay test app: http://localhost:3110/samples — saved responses, preview database, live TikTok fetches intercepted.');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3110'],{cwd:root,env,stdio:['inherit','pipe','pipe'],windowsHide:true});
for(const [stream,destination] of [[child.stdout,process.stdout],[child.stderr,process.stderr]]){
 let pending='';stream.setEncoding('utf8');stream.on('data',chunk=>{pending+=chunk;let i;while((i=pending.indexOf('\n'))>=0){destination.write(pending.slice(0,i+1).replace(/token_hash=[^&\s]+/g,'token_hash=[REDACTED]'));pending=pending.slice(i+1);}});
 stream.on('end',()=>{if(pending)destination.write(pending.replace(/token_hash=[^&\s]+/g,'token_hash=[REDACTED]'));});
}
process.on('SIGINT',()=>child.kill('SIGINT'));child.on('exit',code=>process.exit(code??0));
