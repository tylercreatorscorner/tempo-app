#!/usr/bin/env node
/**
 * Fast batch update: link remaining null creator_id tiktok_accounts.
 * Uses batched updates grouped by handle to minimize API calls.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const sb = createClient(
  'https://elrsgxlyejlkzjcnhmak.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

async function fetchAll(table, select, filter) {
  let all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let q = sb.from(table).select(select).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function main() {
  console.log('Loading remaining null accounts...');
  const nullAccounts = await fetchAll('tiktok_accounts', 'id, tiktok_username', q => q.is('creator_id', null));
  console.log(`  ${nullAccounts.length} remaining`);

  if (nullAccounts.length === 0) {
    console.log('Nothing to do!');
    return;
  }

  // Get all creators_v2 indexed by real_name (for affiliates, real_name = handle)
  const allCreators = await fetchAll('creators_v2', 'id, real_name');
  const creatorByName = new Map();
  for (const c of allCreators) {
    creatorByName.set(c.real_name, c.id);
  }

  // Get managed creator handle groups
  const allManaged = await fetchAll('managed_creators', 'real_name, account_1, account_2, account_3, account_4, account_5, account_6, account_7, account_8, account_9, account_10');
  const handleToManagedName = new Map();
  for (const m of allManaged) {
    for (let i = 1; i <= 10; i++) {
      const h = m[`account_${i}`];
      if (h) handleToManagedName.set(h, m.real_name);
    }
  }

  // Build handle → creator_id map
  const handleToCreatorId = new Map();
  const needsCreation = [];

  // Group null accounts by handle (dedup)
  const handleGroups = new Map();
  for (const acc of nullAccounts) {
    if (!handleGroups.has(acc.tiktok_username)) handleGroups.set(acc.tiktok_username, []);
    handleGroups.get(acc.tiktok_username).push(acc.id);
  }

  for (const [handle, accountIds] of handleGroups) {
    // Try managed name first
    const managedName = handleToManagedName.get(handle);
    const lookupName = managedName || handle;
    
    const existingId = creatorByName.get(lookupName);
    if (existingId) {
      handleToCreatorId.set(handle, existingId);
    } else {
      // Need to create
      const newId = randomUUID();
      needsCreation.push({
        id: newId,
        tenant_id: TENANT_ID,
        real_name: lookupName,
      });
      handleToCreatorId.set(handle, newId);
      creatorByName.set(lookupName, newId); // prevent dupes
    }
  }

  console.log(`  Matched existing: ${handleGroups.size - needsCreation.length}`);
  console.log(`  Need creation: ${needsCreation.length}`);

  // Insert new creators_v2
  if (needsCreation.length > 0) {
    console.log('Inserting new creators_v2...');
    const BATCH = 200;
    for (let i = 0; i < needsCreation.length; i += BATCH) {
      const batch = needsCreation.slice(i, i + BATCH);
      const { error } = await sb.from('creators_v2').insert(batch);
      if (error) console.error(`  Batch ${i}: ${error.message}`);
      else process.stdout.write(`\r  ${Math.min(i + BATCH, needsCreation.length)} / ${needsCreation.length}`);
    }
    console.log('');
  }

  // Update tiktok_accounts — batch by handle (update all rows for a handle at once)
  console.log('Updating tiktok_accounts...');
  let updated = 0;
  const handles = Array.from(handleGroups.keys());
  
  // Use parallel updates — 10 at a time
  const PARALLEL = 10;
  for (let i = 0; i < handles.length; i += PARALLEL) {
    const batch = handles.slice(i, i + PARALLEL);
    await Promise.all(batch.map(async (handle) => {
      const creatorId = handleToCreatorId.get(handle);
      if (!creatorId) return;
      const { error, count } = await sb
        .from('tiktok_accounts')
        .update({ creator_id: creatorId })
        .eq('tiktok_username', handle)
        .is('creator_id', null);
      if (error) {
        console.error(`\n  Failed ${handle}: ${error.message}`);
      } else {
        updated += handleGroups.get(handle).length;
      }
    }));
    if ((i + PARALLEL) % 100 === 0 || i + PARALLEL >= handles.length) {
      process.stdout.write(`\r  ${Math.min(i + PARALLEL, handles.length)} / ${handles.length} handles (${updated} rows)`);
    }
  }
  console.log('');

  // Verify
  const { count: remaining } = await sb.from('tiktok_accounts').select('*', { count: 'exact', head: true }).is('creator_id', null);
  console.log(`\n=== DONE === Remaining null: ${remaining}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
