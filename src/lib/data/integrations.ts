/**
 * Unified read of "what's connected" — combines the new `integrations` table
 * with legacy connection data already tracked across the schema.
 *
 * The new `integrations` table is authoritative going forward (Slack, Twilio,
 * future systems), but Discord guilds + TikTok scrape sessions live in their
 * own tables for historical reasons. This view surfaces all of them in a
 * single shape so the /workflows/integrations page can render one coherent
 * list day 1, with no migration required.
 */
import { createAdminClient } from '@/lib/supabase/server';

export interface IntegrationView {
  /** Stable identifier — either an integrations.id or `legacy:<source>:<key>`. */
  id: string;
  /** Connection type: 'discord' | 'tiktok_shop' | 'resend' | 'slack' | ... */
  type: string;
  /** User-set name, falling back to the brand or system name. */
  displayName: string;
  /** When set, this connection is brand-scoped. */
  brandId: string | null;
  brandSlug: string | null;
  brandName: string | null;
  status: 'connected' | 'error' | 'revoked' | 'pending';
  /** Compact summary string shown in the list — e.g. guild ID, last scrape, channel name. */
  summary: string | null;
  lastUsedAt: string | null;
  lastErrorMessage: string | null;
  /** True when this row comes from the new integrations table (vs. legacy auto-detected). */
  managed: boolean;
}

interface BrandRow {
  id: string;
  slug: string;
  name: string;
  display_name: string | null;
  discord_guild_id: string | null;
  tiktok_shop_id: string | null;
}

interface IntegrationRow {
  id: string;
  brand_id: string | null;
  type: string;
  display_name: string | null;
  config: Record<string, unknown>;
  status: string;
  last_used_at: string | null;
  last_error_message: string | null;
}

interface BrandSessionRow {
  brand_slug: string;
  status: string;
  last_successful_scrape: string | null;
  last_health_status: string | null;
}

export async function listIntegrations(): Promise<IntegrationView[]> {
  const supabase = await createAdminClient();

  const [brandsRes, integrationsRes, sessionsRes] = await Promise.all([
    supabase
      .from('brands_v2')
      .select('id, slug, name, display_name, discord_guild_id, tiktok_shop_id')
      .eq('is_archived', false),
    supabase
      .from('integrations')
      .select('id, brand_id, type, display_name, config, status, last_used_at, last_error_message'),
    supabase
      .from('brand_sessions')
      .select('brand_slug, status, last_successful_scrape, last_health_status'),
  ]);

  const brands = (brandsRes.data ?? []) as BrandRow[];
  const integrations = (integrationsRes.data ?? []) as IntegrationRow[];
  const sessions = (sessionsRes.data ?? []) as BrandSessionRow[];

  const brandsById = new Map(brands.map(b => [b.id, b]));
  const brandsBySlug = new Map(brands.map(b => [b.slug, b]));

  const out: IntegrationView[] = [];

  // 1. Managed integrations — anything Tyler has explicitly added.
  for (const i of integrations) {
    const brand = i.brand_id ? brandsById.get(i.brand_id) : null;
    out.push({
      id: i.id,
      type: i.type,
      displayName: i.display_name || labelForType(i.type),
      brandId: i.brand_id,
      brandSlug: brand?.slug ?? null,
      brandName: brand?.display_name || brand?.name || null,
      status: (i.status as IntegrationView['status']) ?? 'connected',
      summary: summarizeConfig(i.type, i.config),
      lastUsedAt: i.last_used_at,
      lastErrorMessage: i.last_error_message,
      managed: true,
    });
  }

  // 2. Legacy Discord (per-brand guild_id). Skip if there's already a managed
  //    discord row for this brand — Tyler already migrated it.
  for (const b of brands) {
    if (!b.discord_guild_id) continue;
    const alreadyManaged = integrations.some(
      i => i.type === 'discord' && i.brand_id === b.id,
    );
    if (alreadyManaged) continue;
    out.push({
      id: `legacy:discord:${b.id}`,
      type: 'discord',
      displayName: `${b.display_name || b.name} Server`,
      brandId: b.id,
      brandSlug: b.slug,
      brandName: b.display_name || b.name,
      status: 'connected',
      summary: `Guild ${b.discord_guild_id}`,
      lastUsedAt: null,
      lastErrorMessage: null,
      managed: false,
    });
  }

  // 3. Legacy TikTok Shop scrape (per-brand session). Same dedupe.
  for (const s of sessions) {
    const brand = brandsBySlug.get(s.brand_slug);
    if (!brand) continue;
    const alreadyManaged = integrations.some(
      i => i.type === 'tiktok_shop' && i.brand_id === brand.id,
    );
    if (alreadyManaged) continue;
    const status: IntegrationView['status'] =
      s.status === 'active' ? 'connected'
      : s.status === 'expiring' ? 'connected'
      : s.status === 'expired' ? 'revoked'
      : s.status === 'error' ? 'error'
      : 'pending';
    out.push({
      id: `legacy:tiktok_shop:${brand.id}`,
      type: 'tiktok_shop',
      displayName: `${brand.display_name || brand.name} TikTok Shop`,
      brandId: brand.id,
      brandSlug: brand.slug,
      brandName: brand.display_name || brand.name,
      status,
      summary: s.last_successful_scrape
        ? `Last scrape: ${new Date(s.last_successful_scrape).toLocaleDateString()}`
        : 'No scrape yet',
      lastUsedAt: s.last_successful_scrape,
      lastErrorMessage: null,
      managed: false,
    });
  }

  // 4. Resend (email) at tenant level — detected purely via env. We can't tell
  //    from the DB whether it's wired, so we report it as connected when the
  //    env var exists at request time. Keep this client-side concern off the
  //    server response; render a static row instead.

  // Sort: errors first, then connected, then by brand → type.
  out.sort((a, b) => {
    const sa = statusOrder(a.status), sb = statusOrder(b.status);
    if (sa !== sb) return sa - sb;
    const ba = a.brandName ?? '~', bb = b.brandName ?? '~';
    if (ba !== bb) return ba.localeCompare(bb);
    return a.type.localeCompare(b.type);
  });

  return out;
}

function statusOrder(s: IntegrationView['status']): number {
  switch (s) {
    case 'error': return 0;
    case 'pending': return 1;
    case 'revoked': return 2;
    case 'connected': return 3;
  }
}

function labelForType(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

function summarizeConfig(type: string, config: Record<string, unknown>): string | null {
  switch (type) {
    case 'discord': {
      const guild = config.guild_id as string | undefined;
      const channel = config.default_channel_name as string | undefined;
      return [guild && `Guild ${guild}`, channel && `#${channel}`].filter(Boolean).join(' · ') || null;
    }
    case 'slack': {
      const ws = config.workspace_name as string | undefined;
      const channel = config.default_channel_name as string | undefined;
      return [ws, channel && `#${channel}`].filter(Boolean).join(' · ') || null;
    }
    case 'resend':
      return (config.from_email as string) ?? null;
    case 'twilio':
      return (config.phone_number as string) ?? null;
    case 'tiktok_shop':
      return (config.shop_name as string) ?? null;
    default:
      return null;
  }
}

export const TYPE_LABELS: Record<string, string> = {
  discord: 'Discord',
  slack: 'Slack',
  tiktok_shop: 'TikTok Shop',
  resend: 'Resend (Email)',
  twilio: 'Twilio (SMS)',
  klaviyo: 'Klaviyo',
  hubspot: 'HubSpot',
  notion: 'Notion',
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
};

/** Categories used to group integration types in the "Add Integration" picker. */
export interface IntegrationTypeOption {
  type: string;
  label: string;
  category: 'messaging' | 'data' | 'crm' | 'ai';
  description: string;
  comingSoon?: boolean;
}

export const INTEGRATION_TYPE_CATALOG: IntegrationTypeOption[] = [
  { type: 'discord', label: 'Discord', category: 'messaging', description: 'Per-server bot access for daily drops, alerts, and creator messages.' },
  { type: 'slack', label: 'Slack', category: 'messaging', description: 'Workspace + channel for ops alerts and team-internal notifications.', comingSoon: true },
  { type: 'resend', label: 'Resend (Email)', category: 'messaging', description: 'Branded email send for invoices, creator outreach, weekly recaps.', comingSoon: true },
  { type: 'twilio', label: 'Twilio (SMS)', category: 'messaging', description: 'Mass-text creators or send 1:1 alerts.', comingSoon: true },
  { type: 'tiktok_shop', label: 'TikTok Shop', category: 'data', description: 'Affiliate / Seller Center scrape session per brand.' },
  { type: 'hubspot', label: 'HubSpot', category: 'crm', description: 'Sync contacts and creator outreach into HubSpot CRM.', comingSoon: true },
  { type: 'klaviyo', label: 'Klaviyo', category: 'crm', description: 'Push creator + brand events into Klaviyo flows.', comingSoon: true },
  { type: 'notion', label: 'Notion', category: 'data', description: 'Mirror brand notes / creator docs in Notion.', comingSoon: true },
  { type: 'anthropic', label: 'Anthropic Claude', category: 'ai', description: 'Power AI workflows — summaries, brand client reports, creator analysis.', comingSoon: true },
  { type: 'openai', label: 'OpenAI', category: 'ai', description: 'Alternative AI provider for workflow steps.', comingSoon: true },
];
