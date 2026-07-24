'use client';

/**
 * Audit feed — chronological list of changes to financial state:
 * retainer adjustments, commission rate edits, payment status flips, etc.
 *
 * Pulls from /api/payments/history (which reads payment_audit_log).
 * Read-only — there's no UI to add entries; they're written by the
 * various admin actions across the app.
 */

import { History, Users, Percent, CreditCard, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  creator_name: string | null;
  brand: string | null;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  reason: string | null;
  created_at: string;
}

interface Props {
  logs: AuditLog[];
  loading: boolean;
}

function entityIconAndBg(type: string): { icon: React.ComponentType<{ className?: string }>; tint: string; iconColor: string } {
  switch (type) {
    case 'retainer':         return { icon: Users,      tint: 'bg-purple-500/10',   iconColor: 'text-purple-500' };
    case 'commission_rate':  return { icon: Percent,    tint: 'bg-emerald-500/10',  iconColor: 'text-emerald-500' };
    case 'payment_status':   return { icon: CreditCard, tint: 'bg-blue-500/10',     iconColor: 'text-blue-500' };
    case 'invoice_status':   return { icon: FileText,   tint: 'bg-primary/10',     iconColor: 'text-[var(--primary)]' };
    default:                 return { icon: History,    tint: 'bg-muted',     iconColor: 'text-muted-foreground' };
  }
}

export function AuditFeed({ logs, loading }: Props) {
  const brandMeta = useBrandMeta();
  if (loading && logs.length === 0) {
    return (
      <div className="rounded-2xl bg-card border border-border shadow-sm p-12 text-center">
        <div className="inline-block h-6 w-6 rounded-full border-2 border-border border-t-[var(--primary)] animate-spin" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-2xl bg-card border border-border shadow-sm p-12 text-center">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
          <History className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-bold text-[var(--foreground)]">No audit history yet</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          Changes to retainers, commission rates, payment statuses, and invoices will appear here as they happen.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--foreground)]">Recent Activity</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Latest {logs.length} change{logs.length === 1 ? '' : 's'} to financial state</p>
        </div>
      </div>
      <div className="divide-y divide-border border-t border-border">
        {logs.map((log) => {
          const { icon: Icon, tint, iconColor } = entityIconAndBg(log.entity_type);
          return (
            <div key={log.id} className="flex items-start gap-3 px-5 py-3 hover:bg-muted/40 transition-colors">
              <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', tint)}>
                <Icon className={cn('h-4 w-4', iconColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--foreground)]">
                  <span className="font-semibold">{log.field_changed}</span>
                  {log.creator_name && <> for <span className="font-semibold">{log.creator_name}</span></>}
                  {log.brand && <span className="text-muted-foreground"> · {brandMeta.label(log.brand)}</span>}
                  {' '}changed
                  {log.old_value !== null && log.old_value !== '' && (
                    <> from <code className="font-mono text-[11px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded">{log.old_value}</code></>
                  )}
                  {log.new_value !== null && log.new_value !== '' && (
                    <> to <code className="font-mono text-[11px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded">{log.new_value}</code></>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-muted-foreground">{formatDate(log.created_at)}</span>
                  <span className="text-[11px] text-muted-foreground">·</span>
                  <span className="text-[11px] text-muted-foreground">{log.changed_by}</span>
                  {log.reason && (
                    <>
                      <span className="text-[11px] text-muted-foreground">·</span>
                      <span className="text-[11px] text-muted-foreground italic">{log.reason}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
