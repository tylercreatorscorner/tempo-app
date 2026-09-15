/** Test-only replay of the exact UI-reconciled JiYu workbook. No TikTok calls,
 * production connections or credentials are used by this script. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse as parseEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { isCompassCreatorReport, parseCompassCreatorRows } from '../src/lib/tiktok/compass-creator-report';

async function main() {
  const env = parseEnv(readFileSync('.env.local'));
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://otwssgedcnxamcglqpnn.supabase.co', 'Replay is restricted to the existing test project');
  const date = process.argv[3] ?? '2026-07-24';
  const cases: Record<string, { hash: string; rows: number; gmv: number }> = {
    '2026-07-24': { hash: 'bf2449a6e19729d5438f3c285d6221045d7949579471607bed700411623a19e2', rows: 8943, gmv: 22436.68 },
    '2026-07-25': { hash: '42d7980655e1eff0f2522dfbba67d3082be05e9dbb0e8f4ec7f66b4c846c9465', rows: 8852, gmv: 21114.34 },
  };
  const expected = cases[date];
  assert(expected, 'Only the two reconciled reporting days may be replayed');
  const bytes = readFileSync(process.argv[2]);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.hash, 'Expected the reconciled workbook for this date');
  const workbook = XLSX.read(bytes, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
  assert(isCompassCreatorReport(rows[0]));
  const parsed = parseCompassCreatorRows(rows, 'jiyu-api-test', date);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.records.length, expected.rows);
  assert.equal(parsed.totalGmv, expected.gmv);
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc('merge_compass_creator_metrics', {
    p_brand: 'jiyu-api-test', p_report_date: date, p_records: parsed.records, p_overwrite: true,
  });
  if (error) throw new Error(`Test merge failed: ${error.message}`);
  assert.equal(data.upserted, expected.rows);
  assert.equal(data.deleted, 0);
  console.log(JSON.stringify({ testProject: 'otwssgedcnxamcglqpnn', brand: 'jiyu-api-test', date, ...data, expectedGmv: expected.gmv }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
