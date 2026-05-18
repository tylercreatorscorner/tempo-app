#!/usr/bin/env node
/**
 * Creators Corner manager onboarding seed.
 *
 * Idempotently:
 *  1. Creates the brands_v2 rows that don't exist yet (existing ones are reused).
 *  2. Invites each manager / super-admin via Supabase Auth (passwordless).
 *  3. Upserts their user_profiles row (role + tenant + status=active).
 *  4. Sets each manager's user_brand_access to exactly their brand list
 *     (LeeFar expands to the umbrella + both sub-stores, matching the
 *     existing brand-portal convention). Super-admins get NO brand-access
 *     rows — role=admin already grants full-tenant visibility.
 *
 * Safe by default: NO writes unless --execute is passed. Default is a dry run
 * that prints exactly what it would do. Re-runnable: existing brands/users are
 * detected and not duplicated; only the 10 listed accounts are touched, so
 * pre-existing managers (Victoria, Matthew) and everyone else are untouched.
 *
 * Account creation and invite emails are DECOUPLED:
 *   --execute        creates brands + auth users (silently, email pre-confirmed,
 *                     NO email sent) + profiles + brand access.
 *   --send-invites   separate later step: emails a magic-link to all 10 so they
 *                     can actually log in. Requires APP_URL (prod domain).
 *
 *   Dry run:        node scripts/seed-cc-onboarding.mjs
 *   Create only:    SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-cc-onboarding.mjs --execute
 *   Send invites:   APP_URL=https://app.tempoapp.ai SUPABASE_SERVICE_ROLE_KEY=... \
 *                   node scripts/seed-cc-onboarding.mjs --send-invites
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Self-load secrets from tempo-app/.env.local (sibling of scripts/) so the run
// command is a single, tightly-scopable `node <this-script> ...` with no
// secrets on the command line and no shell env-export wrapper.
function loadEnvLocal() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const txt = readFileSync(join(here, '..', '.env.local'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const k = m[1];
      let v = m[2].replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  } catch { /* env may already be in process.env */ }
}
loadEnvLocal();

const SUPABASE_URL = 'https://elrsgxlyejlkzjcnhmak.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
// Production login domain (verified via Vercel: app.tempoapp.ai). Override
// with APP_URL=... only if the canonical domain ever changes.
const APP_URL = process.env.APP_URL || 'https://app.tempoapp.ai';
const sendInvites = process.argv.includes('--send-invites');
const execute = process.argv.includes('--execute') || sendInvites;
// --only=<email> restricts the run to a single person (for piloting invites).
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const onlyEmail = onlyArg ? onlyArg.slice('--only='.length).trim().toLowerCase() : null;

if (!SUPABASE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1);
}
if (sendInvites && !APP_URL) {
  console.error('--send-invites requires APP_URL (the production login domain,');
  console.error('e.g. https://app.tempoapp.ai) so the magic-link redirect works.');
  process.exit(1);
}
if (sendInvites && !ANON_KEY) {
  console.error('--send-invites requires NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = ANON_KEY
  ? createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  : null;

const slugify = (s) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/\([^)]*\)/g, '')
   .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// display name -> slug. LeeFar is an umbrella; expand at assignment time.
const BRAND_SLUG = {
  'Taily': 'taily', 'Earth Breeze': 'earth_breeze',
  'MicroIngredients': 'microingredients', 'Neurogum': 'neurogum',
  'Rosabella': 'rosabella', 'Serene Herbs': 'serene_herbs',
  'Mary Ruth': 'mary_ruth', 'Nello': 'nello', 'Evil Goods': 'evil_goods',
  'Forchics': 'forchics', 'Dr. Dent': 'dr_dent', 'Peach Slices': 'peach_slices',
  'Cata-Kor': 'catakor', 'JiYu': 'jiyu', 'LeeFar': 'leefar',
  'Lemme': 'lemme', 'COSRX': 'cosrx', 'Physicians Choice': 'physicians_choice',
  'Goli': 'goli', 'Deos': 'deos', 'Kalshi': 'kalshi',
  'Nathan & Sons (Underbrush)': 'nathan_and_sons',
  'Kitsch': 'kitsch', 'Keeps': 'keeps',
};

const LEEFAR_EXPANSION = ['leefar', 'leefar_nutrition', 'leefar_supplements'];

const MANAGERS = [
  { name: 'Pete',   email: 'pete.a@thecreatorscorner.io',        brands: ['Taily', 'Earth Breeze'] },
  { name: 'Zander', email: 'zander.h@thecreatorscorner.io',      brands: ['MicroIngredients'] },
  { name: 'Kyle',   email: 'kyle.e@thecreatorscorner.io',        brands: ['Neurogum'] },
  { name: 'Shah',   email: 'shah.o@thecreatorscorner.io',        brands: ['Rosabella', 'Serene Herbs'] },
  { name: 'Mia',    email: 'mia.m@thecreatorscorner.io',         brands: ['Mary Ruth', 'Nello', 'Evil Goods', 'Forchics', 'Dr. Dent', 'Peach Slices'] },
  { name: 'Tyler',  email: 'tyler.d@thecreatorscorner.io',       brands: ['Cata-Kor', 'JiYu', 'LeeFar', 'Lemme', 'COSRX'] },
  { name: 'Nick',   email: 'nick.l@thecreatorscorner.io',        brands: ['Goli', 'Deos', 'Kalshi'] },
  { name: 'Justin', email: 'justinmiller@thecreatorscorner.io',  brands: ['Nathan & Sons (Underbrush)'] },
];

// role=admin → full-tenant; no brand-access rows.
const ADMINS = [
  { name: 'CC Ops',  email: 'ops@thecreatorscorner.io' },
  { name: 'CJoe',    email: 'cjoe@thecreatorscorner.io' },
];

// Brands that must exist but have no manager yet.
const UNMANAGED_BRANDS = ['Physicians Choice', 'Kitsch', 'Keeps'];

const mode = sendInvites ? 'SEND INVITES' : execute ? 'CREATE (no email)' : 'DRY RUN';
const log = (...a) => console.log(...a);

async function main() {
  log(`\n=== CC onboarding seed — ${mode} ===\n`);

  // 1. Brands -------------------------------------------------------------
  const { data: existing, error: be } = await sb
    .from('brands_v2').select('id, slug, name').eq('tenant_id', TENANT_ID);
  if (be) throw new Error(`brands_v2 read: ${be.message}`);
  const slugToId = new Map(existing.map((b) => [b.slug, b.id]));

  // Every slug referenced anywhere we need a row for.
  const allDisplayNames = new Set([
    ...MANAGERS.flatMap((m) => m.brands), ...UNMANAGED_BRANDS,
  ]);
  const wantSlugs = new Set();
  for (const dn of allDisplayNames) {
    const slug = BRAND_SLUG[dn] ?? slugify(dn);
    if (slug === 'leefar') LEEFAR_EXPANSION.forEach((s) => wantSlugs.add(s));
    else wantSlugs.add(slug);
  }
  const missing = [...wantSlugs].filter((s) => !slugToId.has(s));

  log(`Brands: ${existing.length} exist, ${missing.length} to create.`);
  for (const slug of missing) {
    const dn = Object.entries(BRAND_SLUG).find(([, v]) => v === slug)?.[0]
      ?? slug;
    log(`  + create brand "${dn}" (slug=${slug})`);
    if (execute) {
      const { data, error } = await sb.from('brands_v2')
        .upsert({ tenant_id: TENANT_ID, name: dn, slug },
                { onConflict: 'tenant_id,slug' })
        .select('id, slug').single();
      if (error) throw new Error(`brand ${slug}: ${error.message}`);
      slugToId.set(data.slug, data.id);
    }
  }

  // 2. Resolve existing auth users once -----------------------------------
  const emailToId = new Map();
  if (execute) {
    let page = 1;
    for (;;) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(`listUsers: ${error.message}`);
      for (const u of data.users) if (u.email) emailToId.set(u.email.toLowerCase(), u.id);
      if (data.users.length < 1000) break;
      page += 1;
    }
  }

  // 3. Users + profiles + brand access ------------------------------------
  const everyone = [
    ...MANAGERS.map((m) => ({ ...m, role: 'manager' })),
    ...ADMINS.map((a) => ({ ...a, role: 'admin', brands: [] })),
  ];

  for (const person of everyone) {
    const email = person.email.toLowerCase();
    if (onlyEmail && email !== onlyEmail) continue; // --only= pilot filter
    log(`\n${person.role.toUpperCase()}  ${person.name} <${email}>`);

    let userId = emailToId.get(email) ?? null;
    if (!execute) {
      log(`  would create account (no email) + upsert profile role=${person.role}`);
    } else if (userId) {
      log(`  exists (${userId}) — reusing, no email`);
    } else {
      const { data, error } = await sb.auth.admin.createUser({
        email, email_confirm: true, user_metadata: { full_name: person.name },
      });
      if (error) {
        if (/already.*regist|already.*exist/i.test(error.message)) {
          const { data: l } = await sb.auth.admin.listUsers();
          userId = l?.users?.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
          log(`  already registered — reusing ${userId}`);
        } else {
          throw new Error(`createUser ${email}: ${error.message}`);
        }
      } else {
        userId = data.user.id;
        log(`  created (no email sent) → ${userId}`);
      }
    }

    if (execute) {
      if (!userId) throw new Error(`no user id for ${email}`);
      const { error: pe } = await sb.from('user_profiles').upsert({
        user_id: userId, email, name: person.name,
        role: person.role, tenant_id: TENANT_ID, status: 'active',
      }, { onConflict: 'user_id' });
      if (pe) throw new Error(`profile ${email}: ${pe.message}`);
    }

    if (sendInvites && userId) {
      const { error: oe } = await anon.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${APP_URL}/auth/callback` },
      });
      if (oe) throw new Error(`invite email ${email}: ${oe.message}`);
      log(`  invite email sent`);
    }

    // Brand access (managers only).
    if (person.role !== 'manager') {
      log(`  brand access: none (role=admin → full tenant)`);
      continue;
    }
    const slugs = [];
    for (const dn of person.brands) {
      const slug = BRAND_SLUG[dn] ?? slugify(dn);
      if (slug === 'leefar') slugs.push(...LEEFAR_EXPANSION);
      else slugs.push(slug);
    }
    const ids = [];
    for (const s of slugs) {
      const id = slugToId.get(s);
      if (!id && !execute) { log(`  brand "${s}" → (created above in execute mode)`); continue; }
      if (!id) throw new Error(`brand slug ${s} missing for ${email}`);
      ids.push(id);
    }
    log(`  brand access → [${slugs.join(', ')}] (${ids.length} rows)`);
    if (execute) {
      await sb.from('user_brand_access').delete().eq('user_id', userId);
      if (ids.length) {
        const { error: ue } = await sb.from('user_brand_access').insert(
          ids.map((brand_id) => ({ user_id: userId, brand_id, tenant_id: TENANT_ID }))
        );
        if (ue) throw new Error(`uba ${email}: ${ue.message}`);
      }
    }
  }

  log(`\n=== ${mode} complete ===`);
  if (!execute) log('Re-run with --execute to create accounts (no emails sent).');
  else if (!sendInvites) log('Accounts created. Later: --send-invites (with APP_URL) to email logins.\n');
}

main().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
