import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.daily_video_product_stats (
      tenant_id text, tiktok_username text, brand_id text, video_id text, report_date date
    );
    ALTER TABLE public.daily_video_product_stats ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_rows ON public.daily_video_product_stats TO authenticated
      USING (tenant_id = current_setting('test.tenant'));
    GRANT SELECT ON public.daily_video_product_stats TO authenticated;
    INSERT INTO public.daily_video_product_stats
      SELECT 'a', 'first', 'alpha', 'video-' || n, '2025-02-01'::date
      FROM generate_series(1, 1205) n;
    INSERT INTO public.daily_video_product_stats VALUES
      ('a','first','alpha','video-1','2025-02-02'),
      ('a','second','beta','video-1','2025-02-03'),
      ('a','second',null,'unique','2025-02-04'),
      ('a','second','beta','','2025-01-01'),
      ('a','second','beta',null,null),
      ('b','first','private','foreign','2020-01-01');
  `);
  const migration = readdirSync('supabase/migrations').find(name => name.endsWith('_creator_video_history_aggregate.sql'));
  assert.ok(migration);
  await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
  assert.equal((await db.query("SELECT prosecdef FROM pg_proc WHERE proname='get_creator_video_history'")).rows[0].prosecdef, false);
  await db.exec("SET ROLE authenticated; SET test.tenant = 'a';");
  const history = async handles => (await db.query('SELECT public.get_creator_video_history($1::text[]) AS result', [handles])).rows[0].result;
  const visible = (await db.query("SELECT tiktok_username, brand_id, video_id, report_date::text FROM public.daily_video_product_stats WHERE tiktok_username = ANY($1::text[])", [['first', 'second']])).rows;
  const expected = {
    brands: [...new Map(visible.filter(r => r.brand_id).map(r => [JSON.stringify([r.tiktok_username, r.brand_id]), { tiktok_username: r.tiktok_username, brand_id: r.brand_id }])).values()],
    total_videos: new Set(visible.map(r => r.video_id).filter(Boolean)).size,
    first_active_date: visible.map(r => r.report_date).filter(Boolean).sort()[0],
  };
  const actual = await history(['first', 'second']);
  const normalized = value => ({ ...value, brands: value.brands.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
  assert.deepEqual(normalized(actual), normalized(expected));
  assert.equal(actual.total_videos, 1206);
  assert.deepEqual(await history([]), { brands: [], total_videos: 0, first_active_date: null });
  assert.deepEqual(await history(null), { brands: [], total_videos: 0, first_active_date: null });
  await db.exec('RESET ROLE; SET ROLE anon;');
  await assert.rejects(history(['first']), /permission denied/);
  await db.exec("RESET ROLE; SET ROLE authenticated; SET test.tenant = 'a';");

  let calls = 0;
  let fail = false;
  let handles = ['first', 'second'];
  const caches = [];
  const cache = fn => {
    const values = new Map();
    caches.push(values);
    return key => {
      if (!values.has(key)) values.set(key, fn(key));
      return values.get(key);
    };
  };
  const newRequest = () => caches.forEach(values => values.clear());
  const client = {
    from(table) {
      assert.notEqual(table, 'daily_video_product_stats', 'Profile and lifetime must not download raw history');
      const result = () => ({ data: table === 'creators_v2' ? { id: 'creator', real_name: 'Example' } : table === 'managed_creators' ? [{ brand: 'contract', retainer: 99, account_1: 'first' }] : handles.map(tiktok_username => ({ tiktok_username, brand_id: 'registered' })), error: null });
      const q = { select: () => q, eq: () => q, or: () => q, single: async () => result(), then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject) };
      return q;
    },
    async rpc(name, args) {
      if (name === 'get_creator_video_history') {
        calls++;
        if (fail) return { data: null, error: new Error('History query failed') };
        return { data: await history(Array.from(args.p_handles)), error: null };
      }
      assert.equal(name, 'get_creator_perf_by_handles');
      return { data: [{ handle: 'first', brand: 'alpha', gmv: 200, orders: 4, commission: 20 }], error: null };
    },
  };
  const deps = {
    react: { cache },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/auth/creator-report-scope': {},
    '@/lib/data/brand-registry': { getBrandRegistry: async () => ({}) },
    '@/lib/data/brand-registry-core': { uuidToSlug: (_reg, id) => id },
  };
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync('src/lib/data/creator-profile.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, console, Date, require: name => { assert.ok(name in deps, `Unexpected dependency ${name}`); return deps[name]; },
  });
  const profile = await exports.getCreatorProfile('creator');
  const lifetime = await exports.getCreatorLifetimeStats('creator');
  assert.equal(calls, 1, 'Profile and lifetime share one aggregate per request');
  assert.equal(profile.brand, 'contract', 'Managed contract remains the primary brand');
  assert.deepEqual(Array.from(profile.accounts[0].brands), ['alpha']);
  assert.deepEqual(Array.from(profile.accounts[1].brands), ['beta']);
  assert.equal(lifetime.total_videos, expected.total_videos);
  assert.equal(lifetime.first_active_date, expected.first_active_date);
  assert.equal(lifetime.total_gmv, 200);
  assert.equal(lifetime.total_orders, 4);
  assert.equal(lifetime.total_commission, 20);
  newRequest();
  await db.exec("SET test.tenant = 'b';");
  assert.equal((await exports.getCreatorLifetimeStats('creator')).total_videos, 1);
  assert.equal(calls, 2, 'New requests must use their own session and result');
  newRequest(); fail = true;
  await assert.rejects(exports.getCreatorLifetimeStats('creator'), /History query failed/);
  newRequest(); fail = false; handles = [];
  assert.equal((await exports.getCreatorLifetimeStats('creator')).total_videos, 0);
  console.log('PASS history aggregate parity beyond 1,000 rows, duplicate/null/empty video IDs, multiple handles, RLS and anonymous denial');
  console.log('PASS actual profile/lifetime callers share one request aggregate, preserve contract and monetary data, and surface query failures');
} finally {
  await db.close();
}
