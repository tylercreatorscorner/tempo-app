/**
 * Pure-data exports for integrations: types, type labels, and the catalog of
 * supported integration types. Lives in its own file (separate from
 * `integrations.ts`) so that `'use client'` components can import the
 * catalog without dragging in server-only deps (next/headers via the
 * createAdminClient import).
 *
 * The richer `listIntegrations()` data fetcher stays in `integrations.ts`
 * and re-exports these names for ergonomic server-side use.
 */

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
  { type: 'slack', label: 'Slack', category: 'messaging', description: 'Workspace + channel for ops alerts and team-internal notifications.' },
  // Resend is auto-connected when RESEND_API_KEY is present in env, so it
  // doesn't show up in "Available to add" — it shows up directly in
  // "Connected" via listIntegrations(). Kept the type label here for
  // displayName fallback in the UI.
  // Twilio is auto-connected when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN are
  // set, same as Resend. Stays out of the "Available to add" list to avoid
  // showing it as both connected and connectable.
  { type: 'tiktok_shop', label: 'TikTok Shop', category: 'data', description: 'Affiliate / Seller Center scrape session per brand.' },
  { type: 'hubspot', label: 'HubSpot', category: 'crm', description: 'Sync contacts and creator outreach into HubSpot CRM.', comingSoon: true },
  { type: 'klaviyo', label: 'Klaviyo', category: 'crm', description: 'Push creator + brand events into Klaviyo flows.', comingSoon: true },
  { type: 'notion', label: 'Notion', category: 'data', description: 'Mirror brand notes / creator docs in Notion.', comingSoon: true },
  { type: 'anthropic', label: 'Anthropic Claude', category: 'ai', description: 'Power AI workflows — summaries, brand client reports, creator analysis.', comingSoon: true },
  { type: 'openai', label: 'OpenAI', category: 'ai', description: 'Alternative AI provider for workflow steps.', comingSoon: true },
];
