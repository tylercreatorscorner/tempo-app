import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import * as XLSX from 'xlsx';
import { PGlite } from '@electric-sql/pglite';

function load(path, deps) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date, Buffer, console,
    require: name => { assert(name in deps, 'Unexpected dependency '+name); return deps[name]; } });
  return exports;
}
const ledger = load('src/lib/tiktok/compass-task-ledger.ts', { 'node:crypto': { randomUUID } });
const parser = load('src/lib/tiktok/compass-creator-report.ts', {});
const pg = new PGlite();
let writes = [];
// Minimal PostgREST-style adapter: the real database executes the unique
// constraints, touch trigger and compare-and-set updates, including races.
function from(table) {
  assert(['tiktok_compass_tasks','ingestion_runs'].includes(table));
  let verb = 'select', payload, columns = '*', single = false;
  const filters = [];
  const q = {
    select(value) { columns = value; return q; },
    insert(value) { verb = 'insert'; payload = value; return q; },
    update(value) { verb = 'update'; payload = value; return q; },
    eq(key, value) { filters.push([key,value]); return q; },
    maybeSingle() { single = true; return q; },
    then(resolve,reject) { return execute().then(resolve,reject); },
  };
  const ident = key => { assert(/^[a-z_]+$/.test(key)); return '"'+key+'"'; };
  const projection = () => columns === '*' ? '*' : columns.split(',').map(key =>
    ['updated_at','lease_expires_at','end_day'].includes(key) ? `${ident(key)}::text AS ${ident(key)}` : ident(key)).join(',');
  async function execute() {
    const values = [];
    const param = value => { values.push(value); return '$'+values.length; };
    let sql;
    if (verb === 'insert') {
      sql = `INSERT INTO ${table} (${Object.keys(payload).map(ident).join(',')}) VALUES (${Object.values(payload).map(param).join(',')}) RETURNING ${projection()}`;
    } else {
      sql = verb === 'select' ? `SELECT ${projection()} FROM ${table}` :
        `UPDATE ${table} SET ${Object.entries(payload).map(([key,val]) => `${ident(key)}=${param(val)}`).join(',')}`;
      if (filters.length) sql += ' WHERE '+filters.map(([key,val]) => `${ident(key)}=${param(val)}`).join(' AND ');
      if (verb === 'update') sql += ' RETURNING '+projection();
    }
    try {
      const result = await pg.query(sql,values);
      return { data: single ? result.rows[0]??null : result.rows, error:null };
    } catch (error) { return {data:null,error:{code:error.code,message:error.message}}; }
  }
  return q;
}
const db = { from, rpc: async (name, args) => {
  assert.equal(name, 'merge_compass_creator_metrics'); writes.push(args);
  return { data:{upserted:args.p_records.length}, error:null };
} };
const scope = { brandSlug:'test',reportDate:'2026-07-25',moduleType:'CREATOR',windowType:'PAST_24H',planType:'ALL',
  connectionId:randomUUID(),shopId:'7495653723838187639',apiVersion:'202603',pollApiVersion:'202603',paramsIn:'body',docType:'CREATOR' };
try {
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for (const name of ['122_tiktok_compass_tasks.sql','132_compass_tasks_task_id_non_partial.sql','131_compass_tasks_observed_columns.sql','20260915053541_compass_task_recovery_context.sql']) {
    await pg.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  }
  await pg.exec(`CREATE TABLE ingestion_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source text,brand_slug text,target_table text,
    report_date date,status text,rows_written int,rows_expected int,error text,finished_at timestamptz);`);
  const first = await ledger.acquireCompassTask(db,scope,null,{newTaskId:'task-one'});
  await assert.rejects(ledger.acquireCompassTask(db,scope,null,{rowId:first.rowId}),/already being processed/);
  await assert.rejects(ledger.acquireCompassTask(db,scope,null,{newTaskId:'task-one'}),/already being processed/);
  await ledger.patchCompassTask(db,first,{status:'failed',error:'poll timeout'});
  const race = await Promise.allSettled([1,2].map(() => ledger.acquireCompassTask(db,scope,null,{rowId:first.rowId})));
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
  const winner = race.find(r=>r.status==='fulfilled').value;
  await assert.rejects(ledger.patchCompassTask(db,first,{status:'ingested'}),/no longer owns/);
  await ledger.patchCompassTask(db,winner,{status:'verified_dry_run'});
  for (const key of Object.keys(scope)) {
    await assert.rejects(ledger.acquireCompassTask(db,{...scope,[key]:'different'},null,{rowId:first.rowId}),/scope|unavailable/);
  }
  await pg.query('UPDATE tiktok_compass_tasks SET recovery_context=NULL WHERE id=$1',[first.rowId]);
  await assert.rejects(ledger.acquireCompassTask(db,scope,null,{rowId:first.rowId}),/scope/);
  const killed = await ledger.acquireCompassTask(db,scope,null,{newTaskId:'killed-task'});
  const recovered = await ledger.acquireCompassTask(db,scope,null,{rowId:killed.rowId},Date.now()+ledger.COMPASS_LEASE_MS+100);
  await assert.rejects(ledger.patchCompassTask(db,killed,{status:'failed'}),/no longer owns/);
  await ledger.patchCompassTask(db,recovered,{status:'verified_dry_run'});
  console.log('PASS actual SQL uniqueness, racing claims, lease expiry, stale writers, all scope fields and legacy refusal');

  const headers = Object.fromEntries(parser.COMPASS_CREATOR_COLUMNS.map(k=>[k,'0']));
  const sheetRows = [{...headers,'Creator name':'creator','Creator-attributed GMV':'$12.34','Creator-attributed items sold':'2'},
    {...headers,'Creator name':'zero_sale','Creator-attributed GMV':'$0.00','Videos':'1'}];
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(sheetRows),'Creators');
  const bytes = XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});
  let calls = 0, creates = 0;
  const transport = { DEFAULT_COMPASS_API_VERSION:'202603',DEFAULT_PLAN_TYPE:'ALL',marketToday:()=> '2026-09-15',
    targetForModule:()=>({table:'creator_performance',fileType:'creator'}),
    assertReportMatchesModule:()=>({ok:true,observedColumns:parser.COMPASS_CREATOR_COLUMNS,message:'matched'}),
    fetchDailyExport: async (brand,date,module,options) => {
      calls++;
      if (!options.resumeTask) { creates++; await options.onTaskCreated('integration-task',{status:'RUNNING',moduleType:'CREATOR',docType:'CREATOR'});
        return {ok:false,stage:'poll',taskId:'integration-task',format:null,message:'poll timeout'}; }
      assert.equal(options.resumeTask.taskId,'integration-task');
      return {ok:true,taskId:'integration-task',bytes,format:{kind:'zip',byteLength:bytes.length},polls:1,warnings:[],
        echo:{status:'SUCCEEDED',fileName:'Transaction_Analysis_Creator_List_20260725-20260725'}};
    },
  };
  const ingest = load('src/lib/tiktok/compass-ingest.ts',{
    xlsx:XLSX,'./connections':{getActiveConnection:async()=>({ok:true,client:{},shopId:scope.shopId,connectionId:scope.connectionId})},
    './compass-task-ledger':ledger,'@/lib/supabase/server':{createAdminClient:async()=>db},
    '@/lib/upload/type-sniff':{extractHeaderRow:()=>headers},'@/lib/upload/parse-dispatch':{},
    './compass-creator-report':parser,'@/lib/upload/video-identities':{},'./compass':transport,
  });
  const input = {brandSlug:scope.brandSlug,reportDate:scope.reportDate,moduleType:'CREATOR'};
  const timeout = await ingest.ingestCompassBrandDay(input);
  assert.equal(timeout.ok,false); assert.equal(timeout.stage,'poll'); assert(timeout.taskRowId);
  assert.equal((await pg.query('SELECT status FROM ingestion_runs WHERE id=$1',[timeout.ingestionRunId])).rows[0].status,'failed');
  const success = await ingest.ingestCompassBrandDay({...input,resumeTaskRowId:timeout.taskRowId});
  assert.equal(success.ok,true,success.message); assert.equal(success.rowsWritten,2); assert.equal(creates,1); assert.equal(calls,2);
  assert.equal(writes[0].p_records[1].gmv,0); assert(!('videos' in writes[0].p_records[1]));
  assert.equal((await pg.query('SELECT status FROM ingestion_runs WHERE id=$1',[success.ingestionRunId])).rows[0].status,'complete');
  const finished = (await pg.query('SELECT error,lease_token,status FROM tiktok_compass_tasks WHERE id=$1',[success.taskRowId])).rows[0];
  assert.deepEqual(finished,{error:null,lease_token:null,status:'ingested'});
  const wrong = await ingest.ingestCompassBrandDay({...input,reportDate:'2026-07-24',resumeTaskRowId:timeout.taskRowId});
  assert.equal(wrong.ok,false); assert.equal(calls,2); assert.equal(writes.length,1);
  const dry = await ingest.ingestCompassBrandDay({...input,dryRun:true,resumeTaskRowId:timeout.taskRowId});
  assert.equal(dry.ok,true); assert.equal(dry.ingestionRunId,null); assert.equal(writes.length,1);
  console.log('PASS ingestion timeout -> saved-row resume -> partial-field merge, zero sales, failure visibility and dry-run isolation');
} finally { await pg.close(); }
