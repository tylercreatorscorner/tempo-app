/**
 * Broadcast audience resolver.
 *
 * Resolving a broadcast audience = replaying a SegmentFilterCriteria snapshot
 * through the SAME roster logic that powers /api/roster (runRosterQuery — the
 * extracted handler core, called directly, no HTTP round-trip), then joining
 * per-channel contact + consent data to split the list into eligible
 * recipients and skipped rows with a reason.
 *
 * Consent model (mirrors creator-contacts.ts):
 *   discord → not_applicable → allowed unless an explicit opt-out exists
 *   email   → opt-OUT model → any non-opted-out email contact is usable
 *   sms     → opt-IN (TCPA) → ONLY consent_status='opted_in' rows are eligible
 *
 * Server-only (admin client): broadcasts/broadcast_recipients are RLS-no-policy.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry, resolveUuids } from '@/lib/data/brand-registry';
import { runRosterQuery, NO_MATCH_BRAND_ID, type EnrichedRow } from '@/lib/data/roster-query';
import { criteriaToRosterParams, type SegmentFilterCriteria } from '@/lib/data/segments';
import type { WorkspaceScope } from '@/lib/auth/workspace-scope';

export type BroadcastChannel = 'discord_dm' | 'email' | 'sms';
export const BROADCAST_CHANNELS = ['discord_dm', 'email', 'sms'] as const;

export type SkipReason = 'no_contact' | 'opted_out' | 'not_opted_in' | 'duplicate_contact';

/** One resolved audience member (pre-contact-join). Feeds token resolution. */
export interface AudienceRow {
  creatorId: string | null;      // creators_v2 uuid (null for unmanaged rows)
  handle: string;                // primary TikTok handle, no @ prefix
  displayName: string | null;
  brand: string | null;          // brand slug of the row's contract
  gmvPeriod: number;             // GMV over the criteria's selected window
  gmv7d: number;                 // trailing-7d GMV (for the {gmv_7d} token)
  gmv30d: number;                // trailing-30d GMV (for the {gmv_30d} token)
  postsPeriod: number;
  lastPostDate: string | null;   // yyyy-MM-dd
  /** 1-based position within the resolved audience, ordered by gmvPeriod desc. */
  rank: number;
}

export interface EligibleRecipient extends AudienceRow {
  contactValue: string;          // discord snowflake / email / E.164
}

export interface SkippedRecipient extends AudienceRow {
  reason: SkipReason;
}

export interface ResolvedAudience {
  eligible: EligibleRecipient[];
  skipped: SkippedRecipient[];
}

/** Roster-core failure surfaced with its HTTP status so routes can pass it through. */
export class AudienceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AudienceError';
    this.status = status;
  }
}

// House rule: `.in()` lists chunked ≤500 (PostgREST URL overflow → silent
// partial result), and every plain select paged past the 1000-row cap.
const IN_CHUNK = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface ContactLite {
  creator_id: string;
  channel: string;
  value: string | null;
  consent_status: string | null;
}

interface PerfLite {
  tiktok_username: string;
  gmv_period: string | number;
}

/**
 * Resolve a criteria snapshot to the per-channel recipient split.
 * Throws AudienceError when the underlying roster query rejects (403/500).
 */
export async function resolveAudience(
  scope: WorkspaceScope,
  criteria: SegmentFilterCriteria,
  channel: BroadcastChannel,
): Promise<ResolvedAudience> {
  // ── 1. Replay the criteria through the roster core. `all=1` returns the full
  // filtered set (export mode, ≤5000 rows, granular per-contract rows, no
  // sparkline enrichment); `summary=0` skips the ~84-RPC KPI block.
  const params = criteriaToRosterParams(criteria);
  params.set('all', '1');
  params.set('summary', '0');

  const result = await runRosterQuery(scope, params);
  if (result.status !== 200) {
    throw new AudienceError(result.body.error, result.status);
  }
  const rows = result.body.data;

  // ── 2. Dedup to one row per PERSON. The export-mode roster stays granular
  // (one row per creator × brand contract), but a broadcast must never DM the
  // same human twice. Keep each person's highest-GMV contract row as the
  // representative (its brand feeds the {brand} token).
  const byPerson = new Map<string, EnrichedRow>();
  for (const r of rows) {
    const key = r.creator_id ?? `row:${String(r.id)}`;
    const prev = byPerson.get(key);
    if (!prev || (Number(r.gmv_period) || 0) > (Number(prev.gmv_period) || 0)) {
      byPerson.set(key, r);
    }
  }
  const people = Array.from(byPerson.values());

  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();

  // ── 3. Trailing 7d/30d GMV for the {gmv_7d}/{gmv_30d} tokens — same RPC +
  // brand scoping the roster itself uses. Errors are non-fatal (tokens render
  // $0); an audience resolve must not die on a perf hiccup.
  const resolvedIds = resolveUuids(reg, criteria.brand ?? null);
  const brandIds = resolvedIds && resolvedIds.length === 0 ? [NO_MATCH_BRAND_ID] : resolvedIds;
  const allHandles = Array.from(new Set(
    people.flatMap((r) => (r.handles ?? []).map((h) => h.toLowerCase())).filter(Boolean),
  ));
  const gmv7ByHandle = new Map<string, number>();
  const gmv30ByHandle = new Map<string, number>();
  if (allHandles.length > 0) {
    const [p7, p30] = await Promise.all([
      supabase.rpc('get_creator_handle_perf', {
        handles: allHandles, brand_ids: brandIds, days_back: 7, p_start_date: null, p_end_date: null,
      }),
      supabase.rpc('get_creator_handle_perf', {
        handles: allHandles, brand_ids: brandIds, days_back: 30, p_start_date: null, p_end_date: null,
      }),
    ]);
    if (p7.error) console.error('[comms/audience] 7d perf RPC failed:', p7.error.message);
    else for (const r of (p7.data as PerfLite[] | null) ?? []) {
      gmv7ByHandle.set(r.tiktok_username.toLowerCase(), Number(r.gmv_period) || 0);
    }
    if (p30.error) console.error('[comms/audience] 30d perf RPC failed:', p30.error.message);
    else for (const r of (p30.data as PerfLite[] | null) ?? []) {
      gmv30ByHandle.set(r.tiktok_username.toLowerCase(), Number(r.gmv_period) || 0);
    }
  }

  // ── 4. Rank by period GMV (desc), ties broken by handle for stability, then
  // shape the audience rows. Rank covers the WHOLE resolved audience — a
  // creator's {rank} shouldn't change because someone else lacks a Discord id.
  const sorted = [...people].sort((a, b) => {
    const d = (Number(b.gmv_period) || 0) - (Number(a.gmv_period) || 0);
    if (d !== 0) return d;
    return String(a.handles?.[0] ?? a.account_1 ?? '').localeCompare(String(b.handles?.[0] ?? b.account_1 ?? ''));
  });
  const audience: { row: EnrichedRow; shaped: AudienceRow }[] = sorted.map((r, i) => {
    const handle = (r.handles?.[0] ?? r.account_1 ?? '').trim().replace(/^@/, '');
    const hs = (r.handles ?? []).map((h) => h.toLowerCase());
    return {
      row: r,
      shaped: {
        creatorId: r.creator_id,
        handle,
        displayName: r.real_name,
        brand: r.brand,
        gmvPeriod: Number(r.gmv_period) || 0,
        gmv7d: hs.reduce((s, h) => s + (gmv7ByHandle.get(h) ?? 0), 0),
        gmv30d: hs.reduce((s, h) => s + (gmv30ByHandle.get(h) ?? 0), 0),
        postsPeriod: Number(r.posts_period) || 0,
        lastPostDate: r.last_post_date,
        rank: i + 1,
      },
    };
  });

  // ── 5. Batch-join contact data: creators_v2.discord_id, managed_creators
  // .discord_id (legacy column — some rows only carry it there), and
  // creator_contacts (channel + consent + value, primary first).
  const creatorIds = Array.from(new Set(
    audience.map((a) => a.shaped.creatorId).filter((v): v is string => !!v),
  ));

  const cv2DiscordByCreator = new Map<string, string>();
  const contactsByCreator = new Map<string, ContactLite[]>();
  const mcDiscordByCreator = new Map<string, string>();
  const mcDiscordByRowId = new Map<string, string>();

  for (const ids of chunk(creatorIds, IN_CHUNK)) {
    const [cv2Res, mcRes] = await Promise.all([
      supabase.from('creators_v2').select('id, discord_id').in('id', ids),
      supabase.from('managed_creators').select('creator_id, discord_id').in('creator_id', ids).not('discord_id', 'is', null),
    ]);
    for (const r of (cv2Res.data as { id: string; discord_id: string | null }[] | null) ?? []) {
      const v = (r.discord_id ?? '').trim();
      if (v) cv2DiscordByCreator.set(r.id, v);
    }
    for (const r of (mcRes.data as { creator_id: string | null; discord_id: string | null }[] | null) ?? []) {
      const v = (r.discord_id ?? '').trim();
      if (v && r.creator_id && !mcDiscordByCreator.has(r.creator_id)) mcDiscordByCreator.set(r.creator_id, v);
    }
    // creator_contacts: paged within the chunk (a creator can hold several
    // rows per channel; 500 creators × contacts can pass the 1000-row cap).
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('creator_contacts')
        .select('creator_id, channel, value, consent_status, is_primary')
        .in('creator_id', ids)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
        .range(from, from + 999);
      if (error) { console.error('[comms/audience] creator_contacts read failed:', error.message); break; }
      if (!data || data.length === 0) break;
      for (const r of data as ContactLite[]) {
        const list = contactsByCreator.get(r.creator_id) ?? [];
        list.push(r);
        contactsByCreator.set(r.creator_id, list);
      }
      if (data.length < 1000) break;
    }
  }

  // Managed rows with NO creators_v2 link can still carry a legacy
  // managed_creators.discord_id — fetch those by row id.
  const unlinkRowIds = audience
    .filter((a) => !a.shaped.creatorId && !String(a.row.id).startsWith('unmanaged:'))
    .map((a) => a.row.id);
  for (const ids of chunk(unlinkRowIds, IN_CHUNK)) {
    const { data } = await supabase
      .from('managed_creators').select('id, discord_id').in('id', ids).not('discord_id', 'is', null);
    for (const r of (data as { id: string | number; discord_id: string | null }[] | null) ?? []) {
      const v = (r.discord_id ?? '').trim();
      if (v) mcDiscordByRowId.set(String(r.id), v);
    }
  }

  // ── 6. Per-channel eligibility split.
  const eligible: EligibleRecipient[] = [];
  const skipped: SkippedRecipient[] = [];

  // Person-level dedup upstream is keyed on creators_v2 id, but UNLINKED
  // managed rows (Track B identity cleanup still pending) can resolve to the
  // SAME Discord snowflake / email through the legacy paths. Final guard:
  // never enqueue the same contact value twice in one broadcast. The
  // audience iterates in rank (GMV desc) order, so the highest-GMV contract
  // row wins as the single recipient.
  const seenContactValues = new Set<string>();
  const pushEligible = (shaped: Omit<EligibleRecipient, 'contactValue'>, rawValue: string) => {
    const key = channel === 'email' ? rawValue.trim().toLowerCase() : rawValue.trim();
    if (seenContactValues.has(key)) {
      skipped.push({ ...shaped, reason: 'duplicate_contact' });
      return;
    }
    seenContactValues.add(key);
    eligible.push({ ...shaped, contactValue: rawValue.trim() });
  };

  for (const { row, shaped } of audience) {
    const contacts = shaped.creatorId
      ? (contactsByCreator.get(shaped.creatorId) ?? []).filter((c) => (c.value ?? '').trim())
      : [];

    if (channel === 'discord_dm') {
      const discord = contacts.filter((c) => c.channel === 'discord');
      if (discord.some((c) => c.consent_status === 'opted_out')) {
        skipped.push({ ...shaped, reason: 'opted_out' });
        continue;
      }
      const value =
        discord[0]?.value?.trim()
        || (shaped.creatorId
          ? (cv2DiscordByCreator.get(shaped.creatorId) ?? mcDiscordByCreator.get(shaped.creatorId))
          : mcDiscordByRowId.get(String(row.id)));
      if (!value) { skipped.push({ ...shaped, reason: 'no_contact' }); continue; }
      pushEligible(shaped, value);
    } else if (channel === 'email') {
      const emails = contacts.filter((c) => c.channel === 'email');
      if (emails.length === 0) { skipped.push({ ...shaped, reason: 'no_contact' }); continue; }
      const usable = emails.find((c) => c.consent_status !== 'opted_out');
      if (!usable) { skipped.push({ ...shaped, reason: 'opted_out' }); continue; }
      pushEligible(shaped, usable.value!);
    } else {
      // sms — TCPA opt-IN: only an explicit opted_in row is ever eligible.
      const sms = contacts.filter((c) => c.channel === 'sms');
      if (sms.length === 0) { skipped.push({ ...shaped, reason: 'no_contact' }); continue; }
      const optedIn = sms.find((c) => c.consent_status === 'opted_in');
      if (optedIn) { pushEligible(shaped, optedIn.value!); continue; }
      skipped.push({
        ...shaped,
        reason: sms.some((c) => c.consent_status === 'opted_out') ? 'opted_out' : 'not_opted_in',
      });
    }
  }

  return { eligible, skipped };
}
