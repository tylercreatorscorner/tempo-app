// One-use loopback sign-in; no email and no printed credential.
import fs from 'node:fs';
import http from 'node:http';
import dotenv from 'dotenv';
import {createClient} from '@supabase/supabase-js';
const env=dotenv.parse(fs.readFileSync('.env.local'));
const state=JSON.parse(fs.readFileSync('.env.tiktok-replay-runtime.json','utf8'));
if(env.NEXT_PUBLIC_SUPABASE_URL!=='https://otwssgedcnxamcglqpnn.supabase.co')throw Error('Unexpected test database');
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data,error}=await db.auth.admin.generateLink({type:'magiclink',email:state.email});
if(error||!data.properties?.hashed_token)throw Error('Test sign-in creation failed');
let used=false;
const server=http.createServer((req,res)=>{
 if(used||req.url!=='/start'||req.headers.host!=='localhost:3111'){res.writeHead(404);res.end();return;}
 used=true;res.writeHead(302,{Location:'http://localhost:3110/auth/confirm?type=magiclink&token_hash='+encodeURIComponent(data.properties.hashed_token),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();server.close();
});
server.listen(3111,'127.0.0.1',()=>console.log('One-use test sign-in: http://localhost:3111/start'));
setTimeout(()=>server.close(),120000).unref();
