import { NextRequest, NextResponse } from 'next/server';
import { renewAgreementBatch } from '@/lib/agreements/renewals';
export const maxDuration=300;
export async function GET(req:NextRequest) {
 const secret=process.env.CRON_SECRET;
 if(!secret || req.headers.get('authorization')!==`Bearer ${secret}`) return NextResponse.json({error:'Unauthorized'},{status:401});
 if(process.env.CREATOR_AGREEMENTS_ENABLED!=='true' || process.env.CREATOR_AGREEMENTS_WRITES_ENABLED!=='true') return NextResponse.json({enabled:false});
 let cursor:string|undefined;let renewed=0;const failed:string[]=[];const started=Date.now();
 try {
  do {
   const batch=await renewAgreementBatch(cursor);renewed+=batch.renewed;failed.push(...batch.failed);cursor=batch.nextCursor ?? undefined;
   if(cursor && Date.now()-started>240000) return NextResponse.json({error:'Renewal pass incomplete. Retry required.',renewed,failed},{status:503});
  } while(cursor);
  return NextResponse.json({renewed,failed},{status:failed.length?503:200});
 } catch {return NextResponse.json({error:'Renewal pass failed. Retry required.',renewed,failed},{status:503});}
}
