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

import { useMemo, useState } from 'react';
import { Plug, AlertCircle, CheckCircle2, Clock, X, MessageSquare, ShoppingBag, Mail, MessageCircle, Sparkles, Database, type LucideIcon, Plus, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IntegrationView } from '@/lib/data/integrations';
import { TYPE_LABELS, INTEGRATION_TYPE_CATALOG } from '@/lib/data/integrations';

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
  const [integrations] = useState<IntegrationView[]>(initialIntegrations);

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
                    <IntegrationRow key={row.id} integration={row} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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

function IntegrationRow({ integration }: { integration: IntegrationView }) {
  const Icon = ICON_FOR_TYPE[integration.type] ?? Plug;
  const StatusIcon = STATUS_ICON[integration.status];
  return (
    <div className="flex items-start gap-4 p-4 hover:bg-gray-50/40 transition-colors">
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
