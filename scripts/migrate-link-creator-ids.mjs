#!/usr/bin/env node
/**
 * Migration: Link all tiktok_accounts rows to creators_v2 UUIDs.
 *
 * Strategy:
 * 1. Group null-creator_id tiktok_accounts by person (via managed_creators multi-handle grouping)
 * 2. For managed creators: match to existing creators_v2 by name, or create new
 * 3. For unmanaged affiliates: create a creators_v2 record per handle
 * 4. Update tiktok_accounts.creator_id for all
 *
 * Run with: node scripts/migrate-link-creator-ids.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = 'https://elrsgxlyejlkzjcnhmak.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

const dryRun = process.argv.includes('--dry-run');
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchAll(table, select = '*', filter) {
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
  console.log(dryRun ? '=== DRY RUN ===' : '=== LIVE RUN ===');
  console.log('');

  // 1. Load all data
  console.log('Loading data...');
  const [nullAccounts, allCreators, allManaged] = await Promise.all([
    fetchAll('tiktok_accounts', '*', q => q.is('creator_id', null)),
    fetchAll('creators_v2', 'id, real_name, email, discord_username'),
    fetchAll('managed_creators', 'id, real_name, account_1, account_2, account_3, account_4, account_5, account_6, account_7, account_8, account_9, account_10, email, phone, discord_name, discord_id, discord_avatar, discord_user_id, notes, tags, brand'),
  ]);

  console.log(`  tiktok_accounts with null creator_id: ${nullAccounts.length}`);
  console.log(`  creators_v2: ${allCreators.length}`);
  console.log(`  managed_creators: ${allManaged.length}`);
  console.log('');

  // 2. Build lookup maps
  // creators_v2 by lowercase name (handle dupes carefully)
  const creatorsByName = new Map();
  for (const c of allCreators) {
    const key = (c.real_name || '').toLowerCase().trim();
    if (!key) continue;
    if (!creatorsByName.has(key)) creatorsByName.set(key, []);
    creatorsByName.get(key).push(c);
  }

  // managed_creators: build handle→managed record map + group handles per person
  const handleToManaged = new Map();
  const managedGroups = []; // [{managed, handles: ['h1','h2',...]}]
  for (const m of allManaged) {
    const handles = [];
    for (let i = 1; i <= 10; i++) {
      const h = m[`account_${i}`];
      if (h) {
        handles.push(h);
        handleToManaged.set(h, m);
      }
    }
    if (handles.length > 0) {
      managedGroups.push({ managed: m, handles });
    }
  }

  // Set of null-linked handles for quick lookup
  const nullHandleSet = new Set(nullAccounts.map(a => a.tiktok_username));

  // 3. Process managed creators first — find or create creators_v2
  const handleToCreatorId = new Map(); // tiktok_username → creators_v2.id
  const creatorsToInsert = [];
  const stats = { matchedExisting: 0, createdManaged: 0, createdAffiliate: 0, updated: 0, skippedDupe: 0 };

  for (const { managed, handles } of managedGroups) {
    // Check which handles are in the null set
    const relevantHandles = handles.filter(h => nullHandleSet.has(h));
    if (relevantHandles.length === 0) continue;

    // Try to match by name to existing creators_v2
    const nameKey = (managed.real_name || '').toLowerCase().trim();
    const candidates = creatorsByName.get(nameKey) || [];

    let creatorId;
    if (candidates.length === 1) {
      // Unambiguous match
      creatorId = candidates[0].id;
      stats.matchedExisting++;
    } else if (candidates.length > 1) {
      // Multiple matches — try to disambiguate by email or discord
      const byEmail = candidates.find(c => c.email && c.email === managed.email);
      const byDiscord = candidates.find(c => c.discord_username && c.discord_username === managed.discord_name);
      if (byEmail) {
        creatorId = byEmail.id;
        stats.matchedExisting++;
      } else if (byDiscord) {
        creatorId = byDiscord.id;
        stats.matchedExisting++;
      } else {
        // Can't disambiguate, take first match (they share the same name)
        creatorId = candidates[0].id;
        stats.matchedExisting++;
        stats.skippedDupe++;
      }
    } else {
      // No match — create new creators_v2 record
      creatorId = randomUUID();
      creatorsToInsert.push({
        id: creatorId,
        tenant_id: TENANT_ID,
        real_name: managed.real_name || relevantHandles[0],
        email: managed.email || null,
        phone: managed.phone || null,
        discord_id: managed.discord_id || null,
        discord_username: managed.discord_name || null,
        discord_avatar: managed.discord_avatar || null,
        notes: managed.notes || null,
        tags: managed.tags || null,
      });
      stats.createdManaged++;
    }

    for (const h of relevantHandles) {
      handleToCreatorId.set(h, creatorId);
    }
  }

  // 4. Process unmanaged affiliates — create a creators_v2 per unique handle
  const processedHandles = new Set(handleToCreatorId.keys());
  for (const acc of nullAccounts) {
    if (processedHandles.has(acc.tiktok_username)) continue;
    processedHandles.add(acc.tiktok_username);

    // Check if another null row for the same handle was already processed
    if (handleToCreatorId.has(acc.tiktok_username)) continue;

    const creatorId = randomUUID();
    creatorsToInsert.push({
      id: creatorId,
      tenant_id: TENANT_ID,
      real_name: acc.tiktok_username, // Use handle as name for affiliates
      email: null,
      phone: null,
      discord_id: null,
      discord_username: null,
      discord_avatar: null,
      notes: null,
      tags: null,
    });
    handleToCreatorId.set(acc.tiktok_username, creatorId);
    stats.createdAffiliate++;
  }

  console.log('Plan:');
  console.log(`  Matched to existing creators_v2: ${stats.matchedExisting}`);
  console.log(`  New creators_v2 (managed): ${stats.createdManaged}`);
  console.log(`  New creators_v2 (affiliate): ${stats.createdAffiliate}`);
  console.log(`  Ambiguous name matches (took first): ${stats.skippedDupe}`);
  console.log(`  Total tiktok_accounts to update: ${nullAccounts.length}`);
  console.log(`  Total new creators_v2 to insert: ${creatorsToInsert.length}`);
  console.log('');

  if (dryRun) {
    console.log('Dry run — no changes written.');
    return;
  }

  // 5. Insert new creators_v2 in batches
  console.log('Inserting new creators_v2...');
  const BATCH = 200;
  for (let i = 0; i < creatorsToInsert.length; i += BATCH) {
    const batch = creatorsToInsert.slice(i, i + BATCH);
    const { error } = await sb.from('creators_v2').insert(batch);
    if (error) {
      console.error(`Insert batch ${i}-${i + batch.length} failed:`, error.message);
      // Try one by one for this batch
      for (const row of batch) {
        const { error: e2 } = await sb.from('creators_v2').insert(row);
        if (e2) console.error(`  Failed: ${row.real_name}: ${e2.message}`);
      }
    }
    if ((i + BATCH) % 1000 === 0 || i + BATCH >= creatorsToInsert.length) {
      console.log(`  ${Math.min(i + BATCH, creatorsToInsert.length)} / ${creatorsToInsert.length}`);
    }
  }

  // 6. Update tiktok_accounts.creator_id in batches
  console.log('Updating tiktok_accounts...');
  let updated = 0;
  for (let i = 0; i < nullAccounts.length; i += BATCH) {
    const batch = nullAccounts.slice(i, i + BATCH);
    for (const acc of batch) {
      const creatorId = handleToCreatorId.get(acc.tiktok_username);
      if (!creatorId) {
        console.error(`  No creator_id for handle: ${acc.tiktok_username}`);
        continue;
      }
      const { error } = await sb.from('tiktok_accounts').update({ creator_id: creatorId }).eq('id', acc.id);
      if (error) {
        console.error(`  Update failed for ${acc.tiktok_username}: ${error.message}`);
      } else {
        updated++;
      }
    }
    if ((i + BATCH) % 1000 === 0 || i + BATCH >= nullAccounts.length) {
      console.log(`  ${Math.min(i + BATCH, nullAccounts.length)} / ${nullAccounts.length} (${updated} updated)`);
    }
  }

  console.log('');
  console.log('=== DONE ===');
  console.log(`  creators_v2 inserted: ${creatorsToInsert.length}`);
  console.log(`  tiktok_accounts updated: ${updated}`);

  // 7. Verify
  const { count: remaining } = await sb.from('tiktok_accounts').select('*', { count: 'exact', head: true }).is('creator_id', null);
  console.log(`  Remaining null creator_id: ${remaining}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
