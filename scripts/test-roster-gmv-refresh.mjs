import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Execute the complete migration against PostgreSQL. Only pg_cron's scheduler is
// a fixture: its named-job upsert is reproduced below; none of the migration SQL
// is rewritten. This suite never connects to an application database.
const migration = readFileSync('supabase/migrations/20261110204750_roster_gmv_refresh_queue.sql', 'utf8');
assert.ok(migration.trim(), 'The GMV refresh migration must contain SQL');
const db = new PGlite();
const worker = 'public.process_roster_gmv_refresh_queue(integer)';
const dayRefresh = 'roster_jobs.refresh_creator_gmv_day(text,date)';
const dirtyTrigger = 'roster_jobs.mark_creator_gmv_dirty()';
const queue = 'roster_jobs.gmv_queue';
const status = 'roster_jobs.gmv_refresh_status';
const day = '2026-01-05';
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const scalar = async (sql, params = []) => Object.values((await rows(sql, params))[0])[0];
const processQueue = (limit = 8) => scalar('select public.process_roster_gmv_refresh_queue($1)', [limit]);
const queueKeys = () => rows(`select brand_slug, stat_date::text from ${queue} order by brand_slug, stat_date`);
const dailyRows = () => rows('select handle,brand_slug,stat_date::text,gmv::float8,posts from public.roster_creator_daily order by brand_slug,stat_date,handle');
const clear = () => db.exec(`truncate public.creator_performance, public.roster_creator_daily, public.videos, public.video_performance, ${queue}, ${status} restart identity`);

try {
  await db.exec(`
    set timezone = 'UTC';
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create role fixture_public_only;
    create table public.creator_performance (
      id bigint generated always as identity primary key,
      brand text, creator_name text, report_date date, period_type text, gmv numeric
    );
    create table public.roster_creator_daily (
      handle text not null, brand_slug text not null, stat_date date not null,
      gmv numeric not null default 0, posts integer not null default 0,
      primary key(handle, brand_slug, stat_date)
    );
    create table public.videos (video_id text, creator_name text, brand text, post_date date);
    create table public.video_performance (video_id text, creator_name text, brand text, post_date date);
    grant usage on schema public to anon, authenticated, service_role, fixture_public_only;
    grant select, insert, update, delete on all tables in schema public to service_role;
    grant usage, select on all sequences in schema public to service_role;
    create function public.refresh_roster_creator_daily_range(date,date) returns integer
      language sql security definer as 'select 0';
    create schema cron;
    create table cron.job (
      jobid bigint generated always as identity primary key,
      jobname text unique not null, schedule text not null, command text not null,
      active boolean not null default true
    );
    create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint
      language plpgsql as $$
      declare result bigint;
      begin
        insert into cron.job(jobname,schedule,command) values(p_name,p_schedule,p_command)
        on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command,active=true
        returning jobid into result;
        return result;
      end $$;
    create function cron.unschedule(p_name text) returns boolean language plpgsql as $$
      begin delete from cron.job where jobname=p_name; return found; end $$;
    create function cron.unschedule(p_id bigint) returns boolean language plpgsql as $$
      begin delete from cron.job where jobid=p_id; return found; end $$;
  `);
  await db.exec(migration);
  assert.equal(await scalar("select count(*)::integer from cron.job where jobname='refresh-roster-creator-gmv'"), 1,
    'Migration must register one named worker job');
  const job = (await rows("select schedule,command from cron.job where jobname='refresh-roster-creator-gmv'"))[0];
  assert.equal(job.schedule, '* * * * *');
  assert.match(job.command, /statement_timeout\s*=\s*'45s'/);
  assert.match(job.command, /process_roster_gmv_refresh_queue\(8\)/);

  // Statement triggers deduplicate a bulk import and invalidate both sides of a
  // key/period change. Weekly data must never enter the daily refresh queue.
  await clear();
  await db.exec(`insert into public.creator_performance(brand,creator_name,report_date,period_type,gmv) values
    ('alpha','Alice','2026-01-05','daily',10),
    ('alpha','Bob','2026-01-05','daily',20),
    ('beta','Carol','2026-01-06','daily',30),
    ('weekly-only','Dana','2026-01-05','weekly',900)`);
  assert.deepEqual(await queueKeys(), [
    {brand_slug:'alpha',stat_date:'2026-01-05'}, {brand_slug:'beta',stat_date:'2026-01-06'},
  ]);
  assert.deepEqual(await rows(`select generation::integer from ${queue} order by brand_slug`), [{generation:1},{generation:1}],
    'One bulk statement must enqueue each brand/day once');
  await db.exec(`truncate ${queue};
    update public.creator_performance set
      brand=case id when 1 then 'gamma' else brand end,
      report_date=case id when 1 then date '2026-01-07' when 3 then date '2026-01-08' else report_date end,
      period_type=case id when 2 then 'weekly' else period_type end
    where id in (1,2,3)`);
  assert.deepEqual(await queueKeys(), [
    {brand_slug:'alpha',stat_date:'2026-01-05'}, {brand_slug:'beta',stat_date:'2026-01-06'},
    {brand_slug:'beta',stat_date:'2026-01-08'}, {brand_slug:'gamma',stat_date:'2026-01-07'},
  ], 'Updates invalidate old and new daily keys, including a move out of daily');
  await db.exec(`truncate ${queue}; update public.creator_performance set period_type='daily' where id=2`);
  assert.deepEqual(await queueKeys(), [{brand_slug:'alpha',stat_date:'2026-01-05'}], 'Moving into daily must enqueue the new key');
  await db.exec(`truncate ${queue}; update public.creator_performance set gmv=999 where id=4; delete from public.creator_performance where id=4`);
  assert.deepEqual(await queueKeys(), [], 'Non-daily updates/deletes must be ignored');
  await db.exec('delete from public.creator_performance where id in (1,2,3)');
  assert.deepEqual(await queueKeys(), [
    {brand_slug:'alpha',stat_date:'2026-01-05'}, {brand_slug:'beta',stat_date:'2026-01-08'},
    {brand_slug:'gamma',stat_date:'2026-01-07'},
  ], 'Deleting daily source rows must invalidate their previous keys');

  // GMV replacement must reconcile downward corrections and vanished creators
  // while leaving posts and all unrelated brand/day rows untouched.
  await clear();
  await db.exec(`insert into public.roster_creator_daily values
    ('alice','alpha','${day}',999,7), ('removed','alpha','${day}',666,2),
    ('outside','beta','${day}',333,4), ('other-day','alpha','2026-01-04',444,5);
    insert into public.creator_performance(brand,creator_name,report_date,period_type,gmv) values
    ('alpha','Alice','${day}','daily',100), ('alpha','aLiCe','${day}','daily',20),
    ('alpha','zero','${day}','daily',0), ('alpha','ignored','${day}','weekly',9000)`);
  assert.equal(await processQueue(), 1);
  assert.deepEqual(await dailyRows(), [
    {handle:'other-day',brand_slug:'alpha',stat_date:'2026-01-04',gmv:444,posts:5},
    {handle:'alice',brand_slug:'alpha',stat_date:day,gmv:120,posts:7},
    {handle:'removed',brand_slug:'alpha',stat_date:day,gmv:0,posts:2},
    {handle:'zero',brand_slug:'alpha',stat_date:day,gmv:0,posts:0},
    {handle:'outside',brand_slug:'beta',stat_date:day,gmv:333,posts:4},
  ]);
  assert.deepEqual(await queueKeys(), []);
  assert.equal(await scalar(`select source_rows::integer from ${status} where brand_slug='alpha' and stat_date='${day}'`), 3);
  const firstRefresh = await dailyRows();
  assert.equal(await processQueue(), 0);
  assert.deepEqual(await dailyRows(), firstRefresh, 'An empty queue is idempotent');
  await db.exec("update public.creator_performance set gmv=gmv where period_type='daily'");
  assert.equal(await processQueue(), 1);
  assert.deepEqual(await dailyRows(), firstRefresh, 'Reimporting identical values is idempotent');
  assert.equal(await scalar(`select changed_rows from ${status} where brand_slug='alpha' and stat_date='${day}'`), 0);
  await db.exec("update public.creator_performance set gmv=5 where creator_name='Alice'");
  assert.equal(await processQueue(), 1);
  assert.equal(await scalar(`select gmv::float8 from public.roster_creator_daily where handle='alice' and brand_slug='alpha' and stat_date='${day}'`), 25);
  await db.exec("delete from public.creator_performance where period_type='daily'");
  assert.equal(await processQueue(), 1);
  assert.equal(await scalar(`select coalesce(sum(gmv),0)::float8 from public.roster_creator_daily where brand_slug='alpha' and stat_date='${day}'`), 0,
    'Deleting the final source row must clear cached GMV');
  assert.equal(await scalar(`select posts from public.roster_creator_daily where handle='alice' and brand_slug='alpha' and stat_date='${day}'`), 7);

  // A null source value is incomplete money, not zero. Failure leaves the
  // existing cache unchanged, records a retry, and does not stop another day.
  await clear();
  await db.exec(`insert into public.roster_creator_daily values ('alice','alpha','${day}',999,7);
    insert into public.creator_performance(brand,creator_name,report_date,period_type,gmv) values
    ('alpha','alice','${day}','daily',20), ('alpha','missing','${day}','daily',null),
    ('beta','valid','2026-01-06','daily',42)`);
  assert.equal(await processQueue(8), 1, 'A failed key must not block an independent day');
  let failed = (await rows(`select attempts,last_error,next_attempt_at > clock_timestamp() as delayed from ${queue} where brand_slug='alpha'`))[0];
  assert.equal(failed.attempts, 1);
  assert.ok(failed.last_error, 'Failed work must expose its reason');
  assert.equal(failed.delayed, true);
  assert.equal(await scalar(`select gmv::float8 from public.roster_creator_daily where handle='alice' and brand_slug='alpha'`), 999);
  assert.equal(await scalar("select gmv::float8 from public.roster_creator_daily where handle='valid' and brand_slug='beta'"), 42);
  assert.equal(await scalar(`select count(*)::integer from ${status} where brand_slug='alpha'`), 0);
  assert.equal(await processQueue(), 0, 'A delayed failure must not be retried immediately');
  await db.exec(`update ${queue} set next_attempt_at=clock_timestamp()-interval '1 second'`);
  assert.equal(await processQueue(), 0);
  failed = (await rows(`select attempts,last_error from ${queue}`))[0];
  assert.equal(failed.attempts, 2);
  await db.exec("update public.creator_performance set gmv=30 where creator_name='missing'");
  assert.equal(await processQueue(), 1, 'A corrected import must make the pending key eligible again');
  assert.equal(await scalar(`select sum(gmv)::float8 from public.roster_creator_daily where brand_slug='alpha'`), 50);
  assert.equal(await scalar("select posts from public.roster_creator_daily where handle='alice' and brand_slug='alpha'"), 7);
  assert.deepEqual(await queueKeys(), []);
  assert.equal(await scalar('select count(*)::integer from public.creator_performance'), 3, 'Refresh must never remove source rows');

  // Enforce both a requested bound and the hard cap, even for hostile limits.
  await clear();
  await db.exec(`insert into public.creator_performance(brand,creator_name,report_date,period_type,gmv)
    select 'bounded','alice',date '2026-01-01'+n,'daily',n from generate_series(0,39) as n`);
  assert.equal(await processQueue(0), 1);
  assert.equal(await scalar(`select count(*)::integer from ${queue}`), 39);
  assert.equal(await processQueue(50000), 32);
  assert.equal(await scalar(`select count(*)::integer from ${queue}`), 7);
  assert.equal(await processQueue(2), 2);
  assert.equal(await scalar(`select count(*)::integer from ${queue}`), 5);
  assert.equal(await processQueue(), 5);

  // Simulated statement cancellation exercises the actual PL/pgSQL exception
  // boundary. Completed keys survive; a partly updated key rolls back, retains
  // its retry marker, and returns control before processing further keys.
  await clear();
  await db.exec(`
    create function public.fixture_cancel_cache_write() returns trigger language plpgsql as $$
    begin
      if new.handle='cancel-last' then
        raise exception using errcode='57014',message='fixture cancellation';
      end if;
      return new;
    end $$;
    insert into public.roster_creator_daily values
      ('a-first','beta','${day}',111,3), ('cancel-last','beta','${day}',222,4);
    create trigger fixture_cancel_cache_write before insert or update on public.roster_creator_daily
      for each row execute function public.fixture_cancel_cache_write();
    insert into public.creator_performance(brand,creator_name,report_date,period_type,gmv) values
      ('alpha','good','${day}','daily',1), ('beta','a-first','${day}','daily',11),
      ('beta','cancel-last','${day}','daily',22), ('gamma','later','${day}','daily',3);
  `);
  assert.equal(await processQueue(), 1);
  assert.equal(await scalar("select gmv::float8 from public.roster_creator_daily where handle='good'"), 1);
  assert.equal(await scalar("select gmv::float8 from public.roster_creator_daily where handle='a-first'"), 111,
    'The cancelled key must roll back its earlier cache writes');
  assert.equal(await scalar("select gmv::float8 from public.roster_creator_daily where handle='cancel-last'"), 222);
  assert.equal(await scalar("select count(*)::integer from public.roster_creator_daily where handle='later'"), 0);
  const cancelled = (await rows(`select attempts,last_error,next_attempt_at > clock_timestamp() as delayed from ${queue} where brand_slug='beta'`))[0];
  assert.equal(cancelled.attempts, 1);
  assert.match(cancelled.last_error, /^57014: fixture cancellation/);
  assert.equal(cancelled.delayed, true);
  assert.equal(await scalar(`select count(*)::integer from ${status} where brand_slug='beta'`), 0);
  await db.exec('drop trigger fixture_cancel_cache_write on public.roster_creator_daily; drop function public.fixture_cancel_cache_write()');
  assert.equal(await processQueue(), 1, 'An independent key remains eligible while the cancelled key backs off');
  await db.exec(`update ${queue} set next_attempt_at=clock_timestamp()-interval '1 second'`);
  assert.equal(await processQueue(), 1);
  assert.equal(await scalar("select sum(gmv)::float8 from public.roster_creator_daily where brand_slug='beta'"), 33);

  // Deterministic generation-change injection, NOT a multi-session concurrency
  // test: a cache trigger changes source data after the worker's SELECT snapshot.
  // This exercises conditional deletion of the exact claimed queue generation.
  await clear();
  await db.exec(`
    create table public.fixture_injection(fired boolean not null);
    insert into public.fixture_injection values(false);
    create function public.fixture_import_during_cache_write() returns trigger language plpgsql as $$
    begin
      if new.handle='race' and not (select fired from public.fixture_injection) then
        update public.fixture_injection set fired=true;
        update public.creator_performance set gmv=41 where brand='race-brand' and creator_name='race';
      end if;
      return new;
    end $$;
    create trigger fixture_import_during_cache_write before insert or update on public.roster_creator_daily
      for each row execute function public.fixture_import_during_cache_write();
    insert into public.creator_performance(brand,creator_name,report_date,period_type,gmv)
      values ('race-brand','race','${day}','daily',10);
  `);
  await processQueue();
  assert.equal(await scalar(`select generation::integer from ${queue} where brand_slug='race-brand'`), 2,
    'Worker must preserve work enqueued after its claimed generation');
  assert.equal(await scalar("select gmv::float8 from public.roster_creator_daily where handle='race'"), 10);
  assert.equal(await processQueue(), 1);
  assert.equal(await scalar("select gmv::float8 from public.roster_creator_daily where handle='race'"), 41);
  assert.deepEqual(await queueKeys(), []);
  await db.exec('drop trigger fixture_import_during_cache_write on public.roster_creator_daily; drop function public.fixture_import_during_cache_write(); drop table public.fixture_injection');

  // Legacy schedule remains useful for posts, including removals, but must not
  // overwrite GMV or delete money rows produced by the dedicated GMV worker.
  await clear();
  await db.exec(`insert into public.roster_creator_daily values
    ('alice','alpha','${day}',500,9), ('removed','alpha','${day}',600,8),
    ('outside','alpha','2026-01-07',700,4);
    insert into public.videos values
    ('v1','Alice','alpha','${day}'), ('v2','alice','alpha','${day}'),
    ('v3','bob','beta','${day}'), ('','alice','alpha','${day}'),
    (null,'alice','alpha','${day}');
    insert into public.video_performance values
    ('v1','Alice','alpha','${day}'), ('v2','alice','alpha','${day}');
    select public.refresh_roster_creator_daily_range('${day}','2026-01-07');
  `);
  assert.deepEqual(await dailyRows(), [
    {handle:'alice',brand_slug:'alpha',stat_date:day,gmv:500,posts:2},
    {handle:'removed',brand_slug:'alpha',stat_date:day,gmv:600,posts:0},
    {handle:'outside',brand_slug:'alpha',stat_date:'2026-01-07',gmv:700,posts:4},
    {handle:'bob',brand_slug:'beta',stat_date:day,gmv:0,posts:1},
  ]);
  await db.exec(`truncate public.videos, public.video_performance; select public.refresh_roster_creator_daily_range('${day}','2026-01-07')`);
  assert.equal(await scalar(`select sum(posts)::integer from public.roster_creator_daily where stat_date='${day}'`), 0);
  assert.equal(await scalar(`select sum(gmv)::float8 from public.roster_creator_daily where stat_date='${day}'`), 1100);

  // An ordinary role with only PUBLIC membership must be denied just as anon
  // and authenticated are. Exercise permissions, rather than SQL-text checks.
  await clear();
  for (const role of ['fixture_public_only', 'anon', 'authenticated']) {
    for (const signature of [worker, dayRefresh, dirtyTrigger, 'public.refresh_roster_creator_daily_range(date,date)']) {
      assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\')', [role,signature]), false,
        `${role} must not execute ${signature}`);
    }
    await db.exec(`set role ${role}`);
    await assert.rejects(processQueue(), /permission denied/);
    await assert.rejects(db.query(`select * from ${queue}`), /permission denied/);
    await assert.rejects(db.query(`select * from ${status}`), /permission denied/);
    await db.exec('reset role');
  }
  assert.equal(await scalar('select has_function_privilege(\'service_role\',$1,\'execute\')', [worker]), true);
  for (const signature of [worker, dayRefresh, 'public.refresh_roster_creator_daily_range(date,date)']) {
    assert.equal(await scalar('select prosecdef from pg_proc where oid=$1::regprocedure', [signature]), false,
      'Refresh functions must use the caller permissions');
  }
  for (const table of [queue, status]) {
    for (const privilege of ['select', 'insert', 'update', 'delete']) {
      assert.equal(await scalar('select has_table_privilege(\'service_role\',$1,$2)', [table,privilege]), true);
    }
    assert.equal(await scalar('select relrowsecurity from pg_class where oid=$1::regclass', [table]), true);
  }
  await db.exec('set role service_role');
  assert.equal(await processQueue(), 0);
  assert.deepEqual(await queueKeys(), []);
  assert.equal(await scalar(`select count(*)::integer from ${status}`), 0);
  await db.exec(`insert into public.creator_performance(brand,creator_name,report_date,period_type,gmv)
    values ('service-brand','service-creator','${day}','daily',81)`);
  assert.equal(await processQueue(), 1, 'Service role must be able to refresh a populated key');
  assert.equal(await scalar("select gmv::float8 from public.roster_creator_daily where handle='service-creator'"), 81);
  await db.exec('reset role');
  console.log('PASS roster GMV refresh SQL: bulk source triggers, old/new keys, corrections/removals, posts isolation, null-money retries, bounded processing, cancellation rollback, generation-change injection, scheduler registration and service-only permissions');
} catch (error) {
  console.error(error.stack?.split('\n').slice(0, 9).join('\n') ?? error);
  process.exitCode = 1;
} finally {
  await db.close();
}
