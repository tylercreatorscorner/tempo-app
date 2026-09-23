import assert from 'node:assert/strict';
import {workLane,dailyRank} from '../src/lib/community-ops/daily-queue';
import type {OpsChannel} from '../src/lib/community-ops/model';
const base={channel_id:'a',kind:'ticket',status:'open',source_hash:'fresh',assessment_hash:'fresh',followup_at:null,last_message_at:new Date().toISOString(),draft:'Reviewed reply',assessment:{action:'reply',category:'Posting blockers'},queueEvidence:{creatorConfirmed:true,waitingFromCreator:true,latestFromCreator:true}} as OpsChannel;
assert.equal(workLane(base),'reply');
assert.equal(workLane({...base,queueEvidence:{...base.queueEvidence!,latestFromCreator:false}}),'review');
assert.equal(workLane({...base,queueEvidence:undefined}),'review');
assert.equal(workLane({...base,assessment:{...base.assessment!,action:'review',category:'Decisions & onboarding'}}),'decision');
assert.equal(workLane({...base,assessment:{...base.assessment!,action:'team'}}),'team');
assert.equal(workLane({...base,status:'waiting_team'}),'team');
assert.equal(workLane({...base,status:'resolved'}),'waiting');
assert.equal(workLane({...base,status:'waiting_creator'}),'waiting');
assert.equal(workLane({...base,last_message_at:new Date(Date.now()-40*86400000).toISOString()}),'older');
assert.equal(workLane({...base,assessment_hash:null}),'waiting');
assert.ok(dailyRank(base,{...base,channel_id:'b',last_message_at:new Date(Date.now()-86400000).toISOString()})<0);
console.log('PASS current creator evidence, later team answer, uncertain identity, decisions, routing, resolved/waiting, old work and recent-first ordering');

assert.equal(workLane({...base,status:'waiting_team',followup_at:new Date(Date.now()+86400000).toISOString()}),'team');
