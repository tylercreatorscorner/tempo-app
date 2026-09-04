#!/usr/bin/env node
/**
 * JiYu Discord ops tool. Read-and-organise only, it never messages a creator.
 *
 * Run from agents/audit-fresh:
 *   node scripts/jiyu-discord.mjs whoami
 *   node scripts/jiyu-discord.mjs census
 *   node scripts/jiyu-discord.mjs read "ONBOARDING CHATS" [--limit 15] [--out file.json]
 *   node scripts/jiyu-discord.mjs move <channelName> "<TARGET CATEGORY>" [--yes]
 *
 * WHY THIS EXISTS: onboarding triage used to mean driving the Discord web client
 * one channel at a time. That cost roughly forty browser round trips per pass and
 * still under-reported, because Discord drops collapsed sidebar categories out of
 * the DOM entirely, so channels the operator never expanded were invisible rather
 * than merely unread. The REST API returns every channel with its parent category
 * in one call, which removes that whole failure mode.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: send creator-facing messages. Discord has no
 * API for posting as a human account, and the near-miss (a webhook wearing
 * someone's name and avatar) would show creators a fake Tyler. Offers and replies
 * stay hand-sent from the real account in the browser. This tool exists to make
 * the reading and the filing fast, not to automate the talking.
 *
 * PERMISSIONS: the bot needs View Channel plus Read Message History on each
 * category, and Manage Channels to move a channel between categories. Those are
 * granted on the Discord role, not here. `whoami` reports exactly which are
 * missing. Every read failure is reported as a failure and never as an empty
 * channel, because a permission error that renders as "0 messages" reads as
 * "nothing to do here" and silently drops a creator from triage.
 */
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://discord.com/api/v10';

// Servers this tool knows about. Pick one with --server <key> (default jiyu).
// M3 is a structural clone of JiYu: same ONBOARDING / WAITING ON FIRST POST /
// AFFILIATES categories and the same get-feedback unlock, so every command works
// against either without special-casing.
const SERVERS = {
  jiyu: { id: '1339335585776533708', label: 'CC x JiYu Family' },
  m3: { id: '1512067155905085522', label: 'THE M3 FAMILY' },
};

// A raw guild id is also accepted, so a newly added server works before anyone
// gets round to naming it in SERVERS above.
const { GUILD_ID, SERVER_LABEL } = (() => {
  const i = process.argv.indexOf('--server');
  const key = i >= 0 ? process.argv[i + 1] : 'jiyu';
  if (SERVERS[key]) return { GUILD_ID: SERVERS[key].id, SERVER_LABEL: SERVERS[key].label };
  if (/^\d{17,20}$/.test(key)) return { GUILD_ID: key, SERVER_LABEL: `guild ${key}` };
  console.error(
    `\n  ERROR: unknown --server "${key}".\n` +
      `  Known names: ${Object.keys(SERVERS).join(', ')}\n` +
      `  Or pass a raw guild id.\n`
  );
  process.exit(1);
})();

// Permission bits we care about (Discord packs these into a bitfield string).
const PERM = {
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  READ_MESSAGE_HISTORY: 1n << 16n,
};

// Administrator overrides every channel and category overwrite. Checking the
// individual bits without checking this one first reports NO-READ on categories
// the bot can in fact read, which is how this diagnostic lied the first time.
const isAdmin = (bits) => (bits & PERM.ADMINISTRATOR) === PERM.ADMINISTRATOR;

// ── env ──────────────────────────────────────────────────────────────────────
// The token lives in .env.local alongside the Next app rather than .env, so load
// that first and fall back rather than assuming either one exists.
function loadToken() {
  const roots = [process.cwd(), path.resolve(process.cwd(), '..', '..')];
  const names = ['.env.local', '.env'];
  for (const root of roots) {
    for (const name of names) {
      const file = path.join(root, name);
      if (!fs.existsSync(file)) continue;
      const hit = fs.readFileSync(file, 'utf8').match(/^DISCORD_BOT_TOKEN\s*=\s*(.+)$/m);
      if (hit) return hit[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  if (process.env.DISCORD_BOT_TOKEN) return process.env.DISCORD_BOT_TOKEN;
  fail('DISCORD_BOT_TOKEN not found in .env.local, .env, or the environment.');
}

function fail(msg) {
  console.error(`\n  ERROR: ${msg}\n`);
  process.exit(1);
}

const TOKEN = loadToken();
const HEADERS = { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' };

// ── transport ────────────────────────────────────────────────────────────────
// Discord returns 429 with a retry_after rather than a Retry-After header on most
// routes. Honour it and retry, because a dropped request during a census produces
// a short list that looks complete.
async function api(route, init = {}, attempt = 0) {
  const res = await fetch(API + route, { ...init, headers: HEADERS });

  if (res.status === 429 && attempt < 5) {
    const body = await res.json().catch(() => ({}));
    const waitMs = Math.ceil((body.retry_after ?? 1) * 1000) + 100;
    console.error(`  rate limited on ${route}, waiting ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
    return api(route, init, attempt + 1);
  }

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function apiOrThrow(route, init) {
  const r = await api(route, init);
  if (!r.ok) throw new Error(`${route} returned ${r.status}: ${r.text.slice(0, 200)}`);
  return r.json;
}

// ── shared lookups ───────────────────────────────────────────────────────────
async function getTree() {
  const channels = await apiOrThrow(`/guilds/${GUILD_ID}/channels`);
  const categories = new Map(channels.filter((c) => c.type === 4).map((c) => [c.id, c.name]));
  const texts = channels
    .filter((c) => c.type === 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parent_id,
      category: categories.get(c.parent_id) ?? '(uncategorised)',
      position: c.position,
    }));
  return { categories, texts };
}

function groupByCategory(texts) {
  const out = new Map();
  for (const c of texts) {
    if (!out.has(c.category)) out.set(c.category, []);
    out.get(c.category).push(c);
  }
  for (const list of out.values()) list.sort((a, b) => a.position - b.position);
  return out;
}

// ── whoami ───────────────────────────────────────────────────────────────────
// Prints what the bot can and cannot do, per category. This is the first thing to
// run when a read comes back empty, so the answer to "is it broken or is it just
// quiet" never requires guesswork.
async function cmdWhoami() {
  const me = await apiOrThrow('/users/@me');
  const member = await apiOrThrow(`/guilds/${GUILD_ID}/members/${me.id}`);
  const roles = await apiOrThrow(`/guilds/${GUILD_ID}/roles`);
  const mine = roles.filter((r) => member.roles.includes(r.id));

  console.log(`\nBot: ${me.username} (${me.id})`);
  console.log(`Roles: ${mine.map((r) => r.name).join(', ') || '(none)'}`);

  let base = 0n;
  for (const r of mine) base |= BigInt(r.permissions);
  console.log('\nServer-wide role permissions:');
  for (const [name, bit] of Object.entries(PERM)) {
    console.log(`  ${(base & bit) === bit ? 'yes' : 'NO '}  ${name}`);
  }

  const channels = await apiOrThrow(`/guilds/${GUILD_ID}/channels`);
  const cats = channels.filter((c) => c.type === 4);
  const roleIds = new Set([...member.roles, GUILD_ID, me.id]);

  // Category level only. Individual channels can carry their own overwrites, so a
  // category that reports "read" can still hold channels that 403. Treat this as a
  // triage hint and the read command as the ground truth.
  if (isAdmin(base)) {
    console.log(
      '\nRole has ADMINISTRATOR, which bypasses every channel and category overwrite.\n' +
        'All categories are readable and movable. Listing them for reference only.\n' +
        'Worth narrowing later: Administrator also grants ban, role and webhook control,\n' +
        'which this tool never needs. View Channel + Read Message History + Manage\n' +
        'Channels on the relevant categories would be enough.'
    );
  }

  console.log('\nPer-category access (category level, individual channels may still deny):');
  for (const cat of cats.sort((a, b) => a.position - b.position)) {
    let allow = 0n;
    let deny = 0n;
    for (const o of cat.permission_overwrites ?? []) {
      if (!roleIds.has(o.id)) continue;
      allow |= BigInt(o.allow);
      deny |= BigInt(o.deny);
    }
    const eff = isAdmin(base) ? ~0n : (base & ~deny) | allow;
    const canView = (eff & PERM.VIEW_CHANNEL) === PERM.VIEW_CHANNEL;
    const canRead = canView && (eff & PERM.READ_MESSAGE_HISTORY) === PERM.READ_MESSAGE_HISTORY;
    const canMove = (eff & PERM.MANAGE_CHANNELS) === PERM.MANAGE_CHANNELS;
    const flags = [canRead ? 'read' : 'NO-READ', canMove ? 'move' : 'no-move'];
    console.log(`  ${flags.join(' ').padEnd(18)} ${cat.name}`);
  }
  console.log(
    '\nTo fix NO-READ: add the bot role to that category with View Channel and\n' +
      'Read Message History. To fix no-move: grant Manage Channels, ideally as a\n' +
      'category overwrite rather than server-wide.\n'
  );
}

// ── census ───────────────────────────────────────────────────────────────────
async function cmdCensus(args) {
  const { texts, categories } = await getTree();
  const grouped = groupByCategory(texts);
  const asJson = args.includes('--json');

  if (asJson) {
    console.log(JSON.stringify(Object.fromEntries([...grouped].map(([k, v]) => [k, v.map((c) => c.name)])), null, 2));
    return;
  }

  console.log(`\n${categories.size} categories, ${texts.length} text channels visible\n`);
  for (const [cat, list] of grouped) {
    console.log(`${cat}  (${list.length})`);
    console.log(`  ${list.map((c) => c.name).join(', ')}\n`);
  }
}

// ── read ─────────────────────────────────────────────────────────────────────
// Pulls the tail of every channel in a category. Failures are collected and
// reported, never folded into the success path as an empty channel.
async function cmdRead(args) {
  const category = args[0];
  if (!category) fail('Usage: read "<CATEGORY NAME>" [--limit 15] [--out file.json]');

  const limit = Number(flagValue(args, '--limit') ?? 15);
  const outFile = flagValue(args, '--out');

  const { texts } = await getTree();
  const inCat = texts.filter((c) => c.category.toLowerCase() === category.toLowerCase());
  if (!inCat.length) {
    fail(`No visible channels in category "${category}". Run census to see the exact names.`);
  }

  console.error(`Reading ${inCat.length} channels in "${category}" (last ${limit} each)...`);

  const results = [];
  const failures = [];

  for (const ch of inCat) {
    const r = await api(`/channels/${ch.id}/messages?limit=${limit}`);
    if (!r.ok) {
      failures.push({ channel: ch.name, status: r.status, detail: r.text.slice(0, 120) });
      continue;
    }
    const messages = (r.json ?? [])
      .slice()
      .reverse()
      .map((m) => ({
        author: m.author?.global_name || m.author?.username || '(unknown)',
        bot: Boolean(m.author?.bot),
        at: m.timestamp,
        content: m.content,
      }));
    results.push({ channel: ch.name, id: ch.id, messages });
    await new Promise((r2) => setTimeout(r2, 120)); // stay well inside the rate limit
  }

  if (failures.length) {
    console.error(`\n  ${failures.length} of ${inCat.length} channels could NOT be read:`);
    for (const f of failures) console.error(`    ${f.channel}: HTTP ${f.status} ${f.detail}`);
    if (failures.some((f) => f.status === 403)) {
      console.error(
        '\n  HTTP 403 means the bot role lacks access to this category, not that the\n' +
          '  channels are empty. Run whoami, then grant View Channel and Read Message\n' +
          '  History on the category. These channels are UNREAD, not clear.\n'
      );
    }
  }

  if (!results.length) fail('Nothing could be read. Refusing to write an empty result that would read as "all clear".');

  const payload = { category, readAt: new Date().toISOString(), channels: results, unreadable: failures };
  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
    console.error(`\nWrote ${results.length} channels to ${outFile}`);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
}

// ── move ─────────────────────────────────────────────────────────────────────
// The reason this tool exists at all: Discord's web client only moves a channel
// between categories by drag and drop, which browser automation cannot do
// reliably. One PATCH does it.
async function cmdMove(args) {
  const channelName = args[0];
  const targetCat = args[1];
  if (!channelName || !targetCat) fail('Usage: move <channelName> "<TARGET CATEGORY>" [--yes]');

  const { texts, categories } = await getTree();
  const ch = texts.find((c) => c.name.toLowerCase() === channelName.toLowerCase());
  if (!ch) fail(`Channel "${channelName}" not found or not visible to the bot.`);

  const targetId = [...categories.entries()].find(([, name]) => name.toLowerCase() === targetCat.toLowerCase())?.[0];
  if (!targetId) fail(`Category "${targetCat}" not found. Run census for exact names.`);

  if (ch.parentId === targetId) {
    console.log(`#${ch.name} is already in ${targetCat}. Nothing to do.`);
    return;
  }

  console.log(`Move #${ch.name}: ${ch.category}  ->  ${targetCat}`);
  if (!args.includes('--yes')) {
    console.log('Dry run. Re-run with --yes to apply.');
    return;
  }

  const r = await api(`/channels/${ch.id}`, { method: 'PATCH', body: JSON.stringify({ parent_id: targetId }) });
  if (!r.ok) {
    if (r.status === 403) {
      fail(`Missing Manage Channels on one or both categories. Nothing was moved. (HTTP 403)`);
    }
    fail(`Move failed: HTTP ${r.status} ${r.text.slice(0, 200)}`);
  }
  console.log(`Moved #${ch.name} to ${targetCat}.`);
}

function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

// ── dispatch ─────────────────────────────────────────────────────────────────
// Strip the --server pair before dispatch so it can appear anywhere on the line
// without being mistaken for a positional argument.
const argv = process.argv.slice(2).filter((a, i, all) => a !== '--server' && all[i - 1] !== '--server');
const [cmd, ...rest] = argv;
const commands = { whoami: cmdWhoami, census: cmdCensus, read: cmdRead, move: cmdMove };
if (cmd && commands[cmd]) console.error(`[${SERVER_LABEL}]`);

if (!cmd || !commands[cmd]) {
  console.log(`
JiYu Discord ops tool

  whoami                                  what the bot can read and move, per category
  census [--json]                         every category and channel in one call
  read "<CATEGORY>" [--limit N] [--out f] tail of every channel in a category
  move <channel> "<CATEGORY>" [--yes]     move a channel between categories

  --server jiyu | m3                      which server (default jiyu)

This tool never sends creator-facing messages. Those stay hand-sent.
`);
  process.exit(cmd ? 1 : 0);
}

commands[cmd](rest).catch((e) => fail(e.message));
