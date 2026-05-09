'use client';

/**
 * Integrations page — unified view of every external connection that powers
 * Tempo workflows. Per-brand by default; tenant-scoped connections appear
 * under "Workspace-wide".
 *
 * Sections:
 *   1. Connected (existing — pulled from `integrations` + legacy sources)
 *   2. Available to add (catalog of supported types, with comingSoon flags)
 */

import { useEffect, useMemo, useState } from 'react';
import { Plug, AlertCircle, CheckCircle2, Clock, X, MessageSquare, ShoppingBag, Mail, MessageCircle, Sparkles, Database, type LucideIcon, Plus, ExternalLink, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IntegrationView } from '@/lib/data/integration-catalog';
import { TYPE_LABELS, INTEGRATION_TYPE_CATALOG } from '@/lib/data/integration-catalog';

const ICON_FOR_TYPE: Record<string, LucideIcon> = {
  discord: MessageSquare,
  slack: MessageCircle,
  tiktok_shop: ShoppingBag,
  resend: Mail,
  twilio: MessageCircle,
  klaviyo: Mail,
  hubspot: Database,
  notion: Database,
  anthropic: Sparkles,
  openai: Sparkles,
};

const STATUS_STYLE: Record<IntegrationView['status'], string> = {
  connected: 'bg-emerald-50 text-emerald-700',
  pending:   'bg-amber-50 text-amber-700',
  error:     'bg-red-50 text-red-700',
  revoked:   'bg-gray-100 text-gray-500',
};

const STATUS_ICON: Record<IntegrationView['status'], LucideIcon> = {
  connected: CheckCircle2,
  pending:   Clock,
  error:     AlertCircle,
  revoked:   X,
};

const CATEGORY_LABELS: Record<string, string> = {
  messaging: 'Messaging & Channels',
  data:      'Data Sources',
  crm:       'CRM & Marketing',
  ai:        'AI Providers',
};

export function IntegrationsClient({
  initialIntegrations,
}: {
  initialIntegrations: IntegrationView[];
}) {
  const [integrations, setIntegrations] = useState<IntegrationView[]>(initialIntegrations);
  const [active, setActive] = useState<IntegrationView | null>(null);

  async function refresh() {
    try {
      const res = await fetch('/api/integrations');
      if (!res.ok) return;
      const j = await res.json() as { integrations: IntegrationView[] };
      setIntegrations(j.integrations ?? []);
    } catch { /* ignore */ }
  }

  // Group connected integrations by brand, with tenant-scoped at the bottom.
  const byBrand = useMemo(() => {
    const groups = new Map<string, { brandName: string; rows: IntegrationView[] }>();
    for (const i of integrations) {
      const key = i.brandName ?? '__tenant__';
      if (!groups.has(key)) {
        groups.set(key, { brandName: i.brandName ?? 'Workspace-wide', rows: [] });
      }
      groups.get(key)!.rows.push(i);
    }
    // Sort: tenant-wide first if we wanted, but Tyler's mental model is
    // brands-first, so tenant goes last.
    return Array.from(groups.values()).sort((a, b) => {
      if (a.brandName === 'Workspace-wide') return 1;
      if (b.brandName === 'Workspace-wide') return -1;
      return a.brandName.localeCompare(b.brandName);
    });
  }, [integrations]);

  const catalogByCategory = useMemo(() => {
    const out: Record<string, typeof INTEGRATION_TYPE_CATALOG> = {};
    for (const item of INTEGRATION_TYPE_CATALOG) {
      (out[item.category] ??= []).push(item);
    }
    return out;
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1B3A]">Integrations</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            External systems Tempo connects to. Each integration powers Automations and Outreach campaigns.
            Most connections are scoped to a single brand — Workspace-wide ones (Resend, AI providers) are shared across all brands.
          </p>
        </div>
      </div>

      {/* Connected section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
            Connected
          </h2>
          <span className="text-xs text-gray-400">{integrations.length} total</span>
        </div>

        {integrations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
            <Plug className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">No integrations yet</p>
            <p className="text-xs text-gray-400 mt-1">Connect Discord, Slack, or another system below to power your first automation.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {byBrand.map(group => (
              <div key={group.brandName}>
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  {group.brandName}
                </p>
                <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden divide-y divide-gray-50">
                  {group.rows.map(row => (
                    <IntegrationRow
                      key={row.id}
                      integration={row}
                      onClick={() => setActive(row)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Detail drawer for the selected integration */}
      {active && (
        <IntegrationDetailDrawer
          integration={active}
          onClose={() => setActive(null)}
          onAfterAction={async () => { await refresh(); }}
        />
      )}

      {/* Available section */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Available to add
        </h2>
        {Object.entries(catalogByCategory).map(([cat, items]) => (
          <div key={cat}>
            <p className="text-xs font-semibold text-gray-500 mb-2">{CATEGORY_LABELS[cat] ?? cat}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(item => (
                <CatalogCard key={item.type} item={item} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function IntegrationRow({ integration, onClick }: { integration: IntegrationView; onClick: () => void }) {
  const Icon = ICON_FOR_TYPE[integration.type] ?? Plug;
  const StatusIcon = STATUS_ICON[integration.status];
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-start gap-4 p-4 hover:bg-gray-50/40 transition-colors"
    >
      <div className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-gray-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-[#1A1B3A]">
            {integration.displayName}
          </p>
          <span className="text-xs text-gray-400">
            {TYPE_LABELS[integration.type] ?? integration.type}
          </span>
          <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full', STATUS_STYLE[integration.status])}>
            <StatusIcon className="h-2.5 w-2.5" />
            {integration.status}
          </span>
          {!integration.managed && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500" title="Detected from existing data — not yet migrated to the integrations table">
              auto
            </span>
          )}
        </div>
        {integration.summary && (
          <p className="text-xs text-gray-500 mt-0.5">{integration.summary}</p>
        )}
        {integration.lastErrorMessage && (
          <p className="text-xs text-red-600 mt-0.5">{integration.lastErrorMessage}</p>
        )}
        {integration.lastUsedAt && (
          <p className="text-[11px] text-gray-400 mt-0.5">
            Last used {new Date(integration.lastUsedAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Detail drawer ───────────────────────────────────────────────────────

function IntegrationDetailDrawer({
  integration,
  onClose,
  onAfterAction,
}: {
  integration: IntegrationView;
  onClose: () => void;
  onAfterAction: () => Promise<void>;
}) {
  const Icon = ICON_FOR_TYPE[integration.type] ?? Plug;
  const supportsTestSend = integration.type === 'discord';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-md bg-white shadow-2xl h-full overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
              <Icon className="h-5 w-5 text-gray-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">
                {TYPE_LABELS[integration.type] ?? integration.type}
              </p>
              <h2 className="text-base font-bold text-[#1A1B3A] truncate">
                {integration.displayName}
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 flex-1">
          <DetailRow label="Status">
            <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full', STATUS_STYLE[integration.status])}>
              {integration.status}
            </span>
          </DetailRow>
          {integration.brandName && (
            <DetailRow label="Brand">
              <span className="text-sm">{integration.brandName}</span>
            </DetailRow>
          )}
          {integration.summary && (
            <DetailRow label="Details">
              <span className="text-sm text-gray-700 break-all">{integration.summary}</span>
            </DetailRow>
          )}
          {integration.lastUsedAt && (
            <DetailRow label="Last used">
              <span className="text-sm text-gray-700">
                {new Date(integration.lastUsedAt).toLocaleString()}
              </span>
            </DetailRow>
          )}
          {integration.lastErrorMessage && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-700 mb-1">Last error</p>
              <p className="text-xs text-red-700 leading-relaxed">{integration.lastErrorMessage}</p>
            </div>
          )}
          {!integration.managed && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
              <p className="text-xs text-amber-800 leading-relaxed">
                This connection was auto-detected from existing data. The first time you fire a test send,
                it will be promoted into the managed integrations table — meaning it becomes editable and
                appears in automation history.
              </p>
            </div>
          )}

          {/* Test send (Discord only for now) */}
          {supportsTestSend && (
            <TestSendSection integration={integration} onSent={onAfterAction} />
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <div>{children}</div>
    </div>
  );
}

interface DiscordChannel {
  id: string;
  name: string;
  parentName: string | null;
  isAnnouncement: boolean;
}

function TestSendSection({
  integration,
  onSent,
}: {
  integration: IntegrationView;
  onSent: () => Promise<void>;
}) {
  const [channelId, setChannelId] = useState('');
  const [content, setContent] = useState('Test message from Tempo 👋');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<
    | { kind: 'success'; messageId?: string }
    | { kind: 'error'; message: string }
    | null
  >(null);

  // Channel list — lazy-loaded once on first render so a brand with 50 channels
  // doesn't pay the round-trip until the drawer is actually opened.
  const [channels, setChannels] = useState<DiscordChannel[] | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingChannels(true);
      setChannelsError(null);
      try {
        const res = await fetch(`/api/integrations/${encodeURIComponent(integration.id)}/channels`);
        const j = await res.json() as { channels?: DiscordChannel[]; error?: string };
        if (cancelled) return;
        if (j.channels) {
          setChannels(j.channels);
        } else {
          setChannelsError(j.error ?? 'Failed to load channels');
        }
      } catch (e) {
        if (!cancelled) setChannelsError(e instanceof Error ? e.message : 'Network error');
      } finally {
        if (!cancelled) setLoadingChannels(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [integration.id]);

  async function send() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/integrations/${encodeURIComponent(integration.id)}/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId.trim(), content: content.trim() }),
      });
      const j = await res.json() as { ok: boolean; error?: string; message_id?: string };
      if (j.ok) {
        setResult({ kind: 'success', messageId: j.message_id });
        await onSent();
      } else {
        setResult({ kind: 'error', message: j.error ?? 'Send failed' });
      }
    } catch (e) {
      setResult({ kind: 'error', message: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setSending(false);
    }
  }

  // Group channels by category for visual structure in the dropdown
  const grouped = useMemo(() => {
    if (!channels) return null;
    const map = new Map<string, DiscordChannel[]>();
    for (const c of channels) {
      const key = c.parentName ?? 'Uncategorized';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries());
  }, [channels]);

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-[#1A1B3A]">Test send</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Post a single message to a channel to confirm the bot can write here. Logs an automation run regardless of outcome.
        </p>
      </div>
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Channel</label>
        {loadingChannels ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
            <span className="text-xs text-gray-500">Loading channels…</span>
          </div>
        ) : channelsError ? (
          <div>
            <input
              type="text"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="1465474331365736552"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
            />
            <p className="text-[10px] text-amber-600 mt-1">
              Couldn&apos;t list channels: {channelsError}. Paste a channel ID manually.
            </p>
          </div>
        ) : grouped && grouped.length > 0 ? (
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
          >
            <option value="">— pick a channel —</option>
            {grouped.map(([category, items]) => (
              <optgroup key={category} label={category}>
                {items.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.isAnnouncement ? '📢 ' : '#'}
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <div className="px-3 py-2 rounded-lg border border-gray-200 bg-white">
            <p className="text-xs text-gray-500">No postable channels found in this server.</p>
          </div>
        )}
      </div>
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Message</label>
        <textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] resize-none"
        />
      </div>
      <button
        onClick={send}
        disabled={sending || !channelId.trim()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#FF4D8D] text-white hover:bg-[#E91E8C] disabled:opacity-50 transition-colors"
      >
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        {sending ? 'Sending…' : 'Send test message'}
      </button>

      {result?.kind === 'success' && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
          <p className="text-xs text-emerald-700 font-medium">
            Sent successfully{result.messageId ? ` (message ${result.messageId})` : ''}.
          </p>
        </div>
      )}
      {result?.kind === 'error' && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
          <p className="text-xs text-red-700">{result.message}</p>
        </div>
      )}
    </div>
  );
}

function CatalogCard({ item }: { item: (typeof INTEGRATION_TYPE_CATALOG)[number] }) {
  const Icon = ICON_FOR_TYPE[item.type] ?? Plug;
  return (
    <div className={cn(
      'relative rounded-2xl border bg-white p-4 transition-shadow',
      item.comingSoon ? 'border-gray-100' : 'border-gray-100 hover:shadow-md cursor-pointer',
    )}>
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
          <Icon className="h-4 w-4 text-gray-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[#1A1B3A]">{item.label}</p>
            {item.comingSoon && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                Coming soon
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.description}</p>
        </div>
      </div>
      {!item.comingSoon && (
        <button className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-[#FF4D8D]/10 text-[#FF4D8D] hover:bg-[#FF4D8D]/15 transition-colors">
          <Plus className="h-3 w-3" />
          Connect
        </button>
      )}
    </div>
  );
}

// Currently-unused but kept for the imports tree-shake check.
void ExternalLink;
