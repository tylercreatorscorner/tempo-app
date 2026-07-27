/**
 * Backfill Discord numeric user IDs from the guild member lists.
 *
 * WHY: a Discord mention only notifies via `<@snowflake>`. Plain `@username`
 * text pings nobody. 731 of 1,410 active contracts carry a discord_name with no
 * discord_id, so the What's Cooking / Who's Cooking / Daily Drop generators
 * cannot build a mention for them and fall back to printing the TikTok handle.
 * The bot is in the servers those creators live in, so the id is recoverable.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-discord-ids.ts
 *   npx tsx --env-file=.env.local scripts/backfill-discord-ids.ts --apply
 *
 * MATCHING DISCIPLINE. Discord retired discriminators in 2023, so `username` is
 * globally unique and is the only field safe to auto-apply on. `global_name`
 * (display name) and per-guild `nick` are NOT unique — two people can both be
 * "Macy". Those are reported as suggestions and never written, because writing
 * a wrong id means @-ing a stranger in a client's server.
 */
import { createClient } from '@supabase/supabase-js';

const API = 'https://discord.com/api/v10';
const APPLY = process.argv.includes('--apply');

const norm = (s: string | null | undefined) =>
  (s ?? '').toString().trim().toLowerCase().replace(/^@/, '');

interface Member {
  user?: { id: string; username: string; global_name?: string | null; bot?: boolean };
  nick?: string | null;
}

async function listGuildMembers(guildId: string, token: string): Promise<Member[]> {
  const out: Member[] = [];
  let after = '0';
  for (;;) {
    const res = await fetch(`${API}/guilds/${guildId}/members?limit=1000&after=${after}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? '1') * 1000;
      await new Promise((r) => setTimeout(r, retry + 250));
      continue;
    }
    if (!res.ok) throw new Error(`guild ${guildId} members -> ${res.status} ${await res.text()}`);
    const batch = (await res.json()) as Member[];
    if (batch.length === 0) break;
    out.push(...batch);
    after = batch[batch.length - 1]?.user?.id ?? after;
    if (batch.length < 1000) break;
  }
  return out;
}

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !url || !key) throw new Error('need DISCORD_BOT_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  const db = createClient(url, key, { auth: { persistSession: false } });

  // ── 1. Every member of every guild the bot is in ────────────────────────
  const guildsRes = await fetch(`${API}/users/@me/guilds`, { headers: { Authorization: `Bot ${token}` } });
  const guilds = (await guildsRes.json()) as { id: string; name: string }[];

  const byUsername = new Map<string, Set<string>>();   // username -> ids (should be 1)
  const byDisplay = new Map<string, Set<string>>();    // global_name/nick -> ids (may be many)
  let totalMembers = 0;

  for (const g of guilds) {
    const members = await listGuildMembers(g.id, token);
    totalMembers += members.length;
    console.log(`  ${g.name.padEnd(26)} ${members.length} members`);
    for (const m of members) {
      const u = m.user;
      if (!u || u.bot) continue;
      const add = (map: Map<string, Set<string>>, k: string) => {
        if (!k) return;
        const s = map.get(k) ?? new Set<string>();
        s.add(u.id);
        map.set(k, s);
      };
      add(byUsername, norm(u.username));
      add(byDisplay, norm(u.global_name));
      add(byDisplay, norm(m.nick));
    }
  }
  console.log(`\n${totalMembers} member rows across ${guilds.length} guilds; ` +
    `${byUsername.size} distinct usernames, ${byDisplay.size} distinct display names.\n`);

  // ── 2. Contracts needing an id ──────────────────────────────────────────
  // Deliberately NOT filtered to Active/unarchived. getDiscordMap() reads every
  // managed_creators row that has a discord_id — it has no status filter — so a
  // creator whose contract lapsed still gets mentioned when they show up in a
  // post on affiliate GMV. Filtering here but not there is what left Taliaa
  // (ms.lia_love, two entries in this week's top performers) untaggable while
  // her Discord id sat one query away.
  const { data: rows, error } = await db
    .from('managed_creators')
    .select('id, real_name, brand, discord_name, discord_id');
  if (error) throw error;

  const needing = (rows ?? []).filter(
    (r) => !norm(r.discord_id) && norm(r.discord_name),
  );

  const exact: { id: number; name: string; discordName: string; discordId: string }[] = [];
  const ambiguous: string[] = [];
  const displayOnly: string[] = [];
  const unmatched = new Set<string>();

  for (const r of needing) {
    const n = norm(r.discord_name);
    const uHit = byUsername.get(n);
    if (uHit && uHit.size === 1) {
      exact.push({ id: r.id, name: r.real_name ?? '?', discordName: r.discord_name!, discordId: [...uHit][0] });
      continue;
    }
    if (uHit && uHit.size > 1) { ambiguous.push(`${r.discord_name} -> ${uHit.size} accounts`); continue; }
    const dHit = byDisplay.get(n);
    if (dHit && dHit.size === 1) { displayOnly.push(`${r.discord_name} (display-name match, ${[...dHit][0]})`); continue; }
    if (dHit && dHit.size > 1) { ambiguous.push(`${r.discord_name} -> ${dHit.size} display-name matches`); continue; }
    unmatched.add(r.discord_name!);
  }

  const uniqueCreators = new Set(exact.map((e) => e.discordName)).size;
  console.log('RESULT');
  console.log(`  contracts missing an id      ${needing.length}`);
  console.log(`  exact username match         ${exact.length}  (${uniqueCreators} distinct people)`);
  console.log(`  display-name only (NOT safe) ${displayOnly.length}`);
  console.log(`  ambiguous (NOT safe)         ${ambiguous.length}`);
  console.log(`  no match in any guild        ${needing.length - exact.length - displayOnly.length - ambiguous.length}` +
    `  (${unmatched.size} distinct names)`);

  console.log('\nSAMPLE OF EXACT MATCHES');
  for (const e of exact.slice(0, 12)) {
    console.log(`  ${String(e.id).padStart(5)}  ${e.name.padEnd(20)} ${e.discordName.padEnd(24)} -> ${e.discordId}`);
  }
  if (displayOnly.length) {
    console.log('\nDISPLAY-NAME-ONLY (needs a human, never auto-written)');
    for (const d of displayOnly.slice(0, 8)) console.log('  ' + d);
  }
  if (ambiguous.length) {
    console.log('\nAMBIGUOUS (never auto-written)');
    for (const a of ambiguous.slice(0, 8)) console.log('  ' + a);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write the exact matches.');
    return;
  }

  // ── 3. Write, in chunks, asserting rowcount ─────────────────────────────
  let written = 0;
  for (const e of exact) {
    const { error: uErr, count } = await db
      .from('managed_creators')
      .update({ discord_id: e.discordId, discord_user_id: e.discordId }, { count: 'exact' })
      .eq('id', e.id);
    if (uErr) { console.error(`  FAILED id=${e.id}: ${uErr.message}`); continue; }
    if (!count) { console.error(`  NO ROW UPDATED id=${e.id}`); continue; }
    written++;
  }
  console.log(`\nAPPLIED — ${written} of ${exact.length} contract rows updated.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
