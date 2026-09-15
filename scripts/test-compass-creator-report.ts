import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { PGlite } from '@electric-sql/pglite';
import { COMPASS_CREATOR_COLUMNS, isCompassCreatorDay, isCompassCreatorReport, parseCompassCreatorRows } from '../src/lib/tiktok/compass-creator-report';
import { assertReportMatchesModule, marketToday } from '../src/lib/tiktok/compass';

async function main() {
  const header = Object.fromEntries(COMPASS_CREATOR_COLUMNS.map(key => [key, '']));
  const fixture = { ...header, 'Creator name': 'creator', 'Creator-attributed GMV': '$12.34', 'Creator-attributed items sold': '2', 'Attributed orders': '1' };
  assert(isCompassCreatorReport(header));
  assert(assertReportMatchesModule(header, 'CREATOR').ok);
  assert(!assertReportMatchesModule(header, 'VIDEO').ok);
  assert(!isCompassCreatorReport({ ...header, Unexpected: '' }));
  assert(isCompassCreatorDay('Transaction_Analysis_Creator_List_20260724-20260724', '2026-07-24'));
  assert(!isCompassCreatorDay('Transaction_Analysis_Creator_List_20260723-20260724', '2026-07-24'));
  assert(!isCompassCreatorDay('Transaction_Analysis_Creator_List_20260725-20260725', '2026-07-24'));
  assert(!isCompassCreatorDay(null, '2026-07-24'));
  assert.equal(marketToday(new Date('2026-07-25T07:30:00Z')), '2026-07-24');
  assert.equal(marketToday(new Date('2026-07-25T08:00:00Z')), '2026-07-25');
  const parse = (rows: Record<string, unknown>[]) => parseCompassCreatorRows(rows, 'test-brand', '2026-07-24');
  const valid = parse([fixture]);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.totalGmv, 12.34);
  assert(!Object.hasOwn(valid.records[0] as object, 'videos'));
  assert(parse([{ ...fixture, 'Creator-attributed GMV': '' }]).errors.length);
  assert(parse([{ ...fixture, 'Creator name': '', 'Creator-attributed GMV': '9'.repeat(45) }]).errors.length);
  assert(parse([{ ...fixture, 'Creator-attributed items sold': '2.5' }]).errors.length);
  assert(parse([fixture, fixture]).errors.length);
  assert.deepEqual(parse([{ ...fixture, 'Creator-attributed GMV': '$0.00', 'Creator-attributed items sold': '0' }]).errors, []);

  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE brands_v2(slug text,tenant_id uuid,is_archived boolean);
      INSERT INTO brands_v2 VALUES ('test-brand','11111111-1111-4111-8111-111111111111',false);
      CREATE TABLE creator_performance(
        tenant_id uuid,brand text,report_date date,period_type text,creator_name text,gmv numeric,items_sold integer,data_source text,
        refunds numeric,orders integer,items_refunded integer,aov numeric,avg_daily_products_with_sales numeric,
        videos integer,live_streams integer,est_commission numeric,samples_shipped integer,est_flat_fee numeric,
        video_gmv numeric,live_gmv numeric,product_card_gmv numeric,managed_creator_id integer,
        UNIQUE(creator_name,brand,report_date));
      ALTER TABLE creator_performance ADD COLUMN created_at timestamptz DEFAULT now();
      ALTER TABLE brands_v2 ADD COLUMN id uuid DEFAULT '22222222-2222-4222-8222-222222222222';
      CREATE TABLE daily_creator_stats (
        report_date date,brand_id uuid,tiktok_username text,gmv numeric,refunds numeric,orders integer,
        items_sold integer,items_refunded integer,aov numeric,avg_daily_products_sold numeric,videos integer,
        livestreams integer,est_commission numeric,samples_shipped integer,est_flat_fee numeric,
        data_source text,tenant_id uuid,created_at timestamptz,
        UNIQUE(report_date,brand_id,tiktok_username));
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
    const triggerSource = readFileSync('supabase/migrations/052_brand_portal_sync_trigger_dbdriven.sql', 'utf8');
    await db.exec(triggerSource.slice(triggerSource.indexOf('CREATE OR REPLACE FUNCTION'), triggerSource.indexOf('$function$;') + '$function$;'.length));
    await db.exec('CREATE TRIGGER sync_stats AFTER INSERT OR UPDATE ON creator_performance FOR EACH ROW EXECUTE FUNCTION sync_creator_performance_to_daily_stats()');
    await db.exec(readFileSync('supabase/migrations/20260915025452_compass_creator_metrics_merge.sql', 'utf8'));
    const write = (records: unknown[], overwrite = true) => db.query('SELECT merge_compass_creator_metrics($1,$2,$3::jsonb,$4) AS result', ['test-brand', '2026-07-24', JSON.stringify(records), overwrite]);
    await db.exec('SET ROLE service_role');
    await write(valid.records);
    assert.deepEqual((await db.query('SELECT gmv,items_sold,videos,orders FROM creator_performance')).rows, [{ gmv: '12.34', items_sold: 2, videos: null, orders: null }]);
    await db.exec('UPDATE creator_performance SET videos=7,live_streams=3,orders=5,video_gmv=9.99,managed_creator_id=42');
    const updated = [{ ...(valid.records[0] as object), gmv: 25.01, items_sold: 4 }];
    await write(updated);
    await write(updated); // Replays do not add revenue or duplicate creators.
    assert.deepEqual((await db.query('SELECT gmv,items_sold,videos,live_streams,orders,video_gmv,managed_creator_id FROM creator_performance')).rows,
      [{ gmv: '25.01', items_sold: 4, videos: 7, live_streams: 3, orders: 5, video_gmv: '9.99', managed_creator_id: 42 }]);
    assert.deepEqual((await db.query('SELECT gmv,items_sold,videos,livestreams FROM daily_creator_stats')).rows,
      [{ gmv: '25.01', items_sold: 4, videos: 7, livestreams: 3 }]);
    await assert.rejects(write(updated, false), /overwrite was disabled/);
    await assert.rejects(write([{ ...(updated[0]), creator_name: 'missing' }]), /omits existing creators/);
    await assert.rejects(write([{ ...(updated[0]), brand: 'other' }]), /record scope/);
    await assert.rejects(write([{ ...(updated[0]), report_date: '2026-07-25' }]), /record scope/);
    await assert.rejects(write([updated[0], updated[0]]), /Duplicate/);
    await assert.rejects(write([]), /Empty/);
    assert.equal((await db.query<{ gmv: string }>('SELECT sum(gmv) AS gmv FROM creator_performance')).rows[0].gmv, '25.01');
    await db.exec('RESET ROLE; SET ROLE authenticated');
    await assert.rejects(write(updated), /permission denied/);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(write(updated), /permission denied/);

    if (process.argv[2]) {
      const workbook = XLSX.read(readFileSync(process.argv[2]), { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
      assert(isCompassCreatorReport(rows[0]));
      const actual = parse(rows);
      assert.deepEqual(actual.errors, []);
      assert.equal(actual.records.length, 8943);
      assert.equal(actual.totalGmv, 22436.68);
      const records = actual.records as { creator_name: string; gmv: number; items_sold: number }[];
      assert.equal(records.reduce((sum, row) => sum + row.items_sold, 0), 579);
      assert.equal(records.filter(row => row.gmv === 0).length, 8771);
      assert.deepEqual([...records].sort((a,b) => b.gmv-a.gmv).slice(0,5).map(row => [row.creator_name,row.gmv]),
        [['shopbyjake',1327.57],['hilss_fit',1208.83],['scrublifewithnursenancy',1046.28],['kbeautymom75',595.74],['lalatellsitall',566.84]]);
      await db.exec("RESET ROLE; DELETE FROM creator_performance; DELETE FROM daily_creator_stats; SET ROLE service_role");
      await write(actual.records);
      assert.deepEqual((await db.query('SELECT count(*)::integer AS count,sum(gmv) AS gmv,sum(items_sold)::integer AS units FROM creator_performance')).rows,
        [{ count:8943,gmv:'22436.68',units:579 }]);
      console.log('Real JiYu workbook: 8,943 creators, $22,436.68, 579 units; top five exact; SQL total exact.');
    }
    console.log('PASS: schema, fixed UTC-8, zero sales, partial merge, idempotency, coverage, scope and role guards.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
