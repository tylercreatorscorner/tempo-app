/**
 * Brand parity harness.
 *
 * Proves the DB-driven brand registry (brands_v2 + parent_brand_id, migration
 * 056 / brand-registry-core.ts) resolves every brand IDENTICALLY to the legacy
 * hardcoded maps in constants.ts. Run this before retiring each map in the
 * staged brand-map retirement: a non-zero exit = a real mismatch that would move
 * a number downstream (every data/money path consumes only these resolver
 * outputs, so identical outputs => identical numbers).
 *
 * "NEW_RESOLVED" (legacy returned empty, the DB resolves) is the INTENDED fix for
 * newer brands absent from the old maps — reported, not a failure.
 *
 * Run:  npx tsx scripts/brand-parity.ts
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (env or .env.local).
 * Read-only.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  buildRegistry,
  expandSlugs,
  resolveUuids,
  slugToUuid,
  activeBrandSlugs,
  type BrandRow,
} from '../src/lib/data/brand-registry-core';
import {
  expandBrandToDataSlugs,
  resolveBrandDataUuids,
  BRAND_UUID_MAP,
  ACTIVE_BRANDS,
  HIDDEN_FROM_PICKER,
} from '../src/lib/utils/constants';

function loadEnv(key: string): string {
  if (process.env[key]) return process.env[key] as string;
  for (const f of ['.env.local', '.env']) {
    if (existsSync(f)) {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  }
  throw new Error(`Missing env ${key} (set it or add it to .env.local)`);
}

const sortn = (a: string[] | null): string[] | null => (a ? [...a].sort() : a);
const eq = (a: string[] | null, b: string[] | null) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const supabase = createClient(loadEnv('NEXT_PUBLIC_SUPABASE_URL'), loadEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const { data, error } = await supabase
    .from('brands_v2')
    .select('id, slug, name, display_name, color, is_archived, is_umbrella, parent_brand_id, store_order');
  if (error) throw error;
  const reg = buildRegistry((data ?? []) as BrandRow[]);

  const slugs = Array.from(new Set([...reg.bySlug.keys(), ...Object.keys(BRAND_UUID_MAP), ...ACTIVE_BRANDS]));
  const mismatches: string[] = [];
  const newResolved: string[] = [];

  for (const slug of slugs) {
    if (!eq(sortn(expandSlugs(reg, slug)), sortn([...expandBrandToDataSlugs(slug)]))) {
      mismatches.push(`expand(${slug}): db=${JSON.stringify(expandSlugs(reg, slug))} legacy=${JSON.stringify([...expandBrandToDataSlugs(slug)])}`);
    }
    const uNew = sortn(resolveUuids(reg, slug));
    const uOld = sortn(resolveBrandDataUuids(slug) as string[] | null);
    if (!eq(uNew, uOld)) {
      if ((!uOld || uOld.length === 0) && uNew && uNew.length > 0) newResolved.push(`${slug} -> ${JSON.stringify(uNew)}`);
      else mismatches.push(`resolveUuids(${slug}): db=${JSON.stringify(uNew)} legacy=${JSON.stringify(uOld)}`);
    }
    if (BRAND_UUID_MAP[slug] && slugToUuid(reg, slug) !== BRAND_UUID_MAP[slug]) {
      mismatches.push(`slugToUuid(${slug}): db=${slugToUuid(reg, slug)} legacy=${BRAND_UUID_MAP[slug]}`);
    }
  }

  const hiddenNew = reg.rows.filter((r) => r.parent_brand_id != null).map((r) => r.slug).sort();
  const hiddenOld = [...HIDDEN_FROM_PICKER].sort();
  const hiddenMatch = eq(hiddenNew, hiddenOld);
  if (!hiddenMatch) mismatches.push(`hidden set: db=${JSON.stringify(hiddenNew)} legacy=${JSON.stringify(hiddenOld)}`);

  const activeNew = new Set(activeBrandSlugs(reg));
  const droppedActive = [...ACTIVE_BRANDS].filter((s) => !activeNew.has(s));
  const addedActive = activeBrandSlugs(reg).filter((s) => !(ACTIVE_BRANDS as readonly string[]).includes(s)).sort();
  if (droppedActive.length) mismatches.push(`active set dropped legacy brands: ${JSON.stringify(droppedActive)}`);

  console.log('Brand parity — DB registry vs legacy maps');
  console.log(`  brands in brands_v2:                     ${reg.rows.length}`);
  console.log(`  hidden-from-picker set match:            ${hiddenMatch ? 'PASS' : 'FAIL'}`);
  console.log(`  newly-resolved (newer brands, intended): ${newResolved.length}`);
  for (const n of newResolved) console.log(`      + ${n}`);
  console.log(`  active-set additions (newer, intended):  ${JSON.stringify(addedActive)}`);
  console.log(`  MISMATCHES (must be 0):                   ${mismatches.length}`);
  for (const m of mismatches) console.log(`      ! ${m}`);

  if (mismatches.length) {
    console.error('\nPARITY FAILED — a swap here would move a number.');
    process.exit(1);
  }
  console.log('\nPARITY OK — the DB resolver is a faithful superset of the legacy maps.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
