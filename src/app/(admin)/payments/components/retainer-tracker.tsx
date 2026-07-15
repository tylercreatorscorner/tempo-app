'use client';

/**
 * Retainer tracker — the operational view of every creator on a retainer:
 * are they posting enough to earn it this month?
 *
 * Each row shows: creator, brand, retainer $, post progress (visual bar),
 * status (On Track / Behind / At Risk), retainer start date.
 *
 * Click a row to expand and see TikTok handles, payment status, and
 * pacing context.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, CheckCircle2, AlertTriangle, AlertCircle, Filter, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 0] as const; // 0 = "All"

export interface RetainerCreator {
  creator_name: string;
  real_name?: string | null;
  brand: string;
  retainer: number;
  posts_required: number;
  posts_found: number;
  monthly_post_requirement: number;
  retainer_start_date: string | null;
  status: 'On Track' | 'Behind' | 'At Risk';
  payment_status: string;
  account_1?: string | null;
  account_2?: string | null;
  account_3?: string | null;
  account_4?: string | null;
  account_5?: string | null;
}

interface Props {
  creators: RetainerCreator[];
  loading: boolean;
  brandFilter: string;
  statusFilter: 'all' | 'On Track' | 'Behind' | 'At Risk';
  /** Brand slugs available in the dropdown — derived from real data, not hardcoded. */
  availableBrands: string[];
  onBrandFilterChange: (v: string) => void;
  onStatusFilterChange: (v: 'all' | 'On Track' | 'Behind' | 'At Risk') => void;
  /** Dim the table body during a brand/status refetch — the filter bar stays crisp. */
  refetching?: boolean;
}

const STATUS_TABS = [
  { value: 'all', label: 'All', icon: Users },
  { value: 'On Track', label: 'On Track', icon: CheckCircle2 },
  { value: 'Behind', label: 'Behind', icon: AlertTriangle },
  { value: 'At Risk', label: 'At Risk', icon: AlertCircle },
] as const;

export function RetainerTracker({
  creators, loading, brandFilter, statusFilter, availableBrands = [], onBrandFilterChange, onStatusFilterChange, refetching = false,
}: Props) {
  const brandMeta = useBrandMeta();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(25);

  // Reset to page 0 whenever filters change or the underlying list changes shape
  useEffect(() => { setPage(0); setExpanded(null); }, [brandFilter, statusFilter, pageSize, creators.length]);

  const total = creators.length;
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = pageSize === 0 ? 0 : safePage * pageSize;
  const end = pageSize === 0 ? total : Math.min(total, start + pageSize);
  const pagedCreators = useMemo(
    () => pageSize === 0 ? creators : creators.slice(start, end),
    [creators, pageSize, start, end],
  );

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <h3 className="text-sm font-bold text-[var(--foreground)]">Retainer Tracker</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {total === 0 ? 'No creators on retainer' :
            pageSize === 0
              ? `${total} creator${total === 1 ? '' : 's'} on retainer · click a row for details`
              : `Showing ${start + 1}–${end} of ${total} creator${total === 1 ? '' : 's'} · click a row for details`}
        </p>
      </div>

      {/* Filter bar */}
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap border-y border-border bg-muted/40">
        <div className="flex items-center gap-1 bg-card rounded-xl p-1 border border-border">
          {STATUS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => onStatusFilterChange(tab.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all',
                  active ? 'bg-primary/10 text-[var(--primary)]' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <select
            value={brandFilter}
            onChange={(e) => onBrandFilterChange(e.target.value)}
            className="appearance-none bg-card border border-border rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] cursor-pointer"
          >
            <option value="all">All brands</option>
            {availableBrands.map((b) => (
              <option key={b} value={b}>{brandMeta.label(b)}</option>
            ))}
          </select>
          <Filter className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Table + pagination — dims on refetch; the filter bar above stays crisp. */}
      <div className={cn('transition-opacity duration-200', refetching && 'opacity-60')}>
      {loading && creators.length === 0 ? (
        <div className="p-12 text-center">
          <div className="inline-block h-8 w-8 rounded-full border-2 border-border border-t-[var(--primary)] animate-spin" />
        </div>
      ) : creators.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-bold text-[var(--foreground)]">No creators on retainer</p>
          <p className="text-xs text-muted-foreground mt-1">Try changing the brand or status filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Creator</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Brand</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Retainer</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[200px]">Post Progress</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Started</th>
              </tr>
            </thead>
            <tbody>
              {pagedCreators.map((c) => {
                const key = `${c.creator_name}|${c.brand}`;
                const isExpanded = expanded === key;
                const required = c.monthly_post_requirement || c.posts_required || 0;
                const pct = required > 0 ? Math.min(100, (c.posts_found / required) * 100) : 0;
                const accounts = [c.account_1, c.account_2, c.account_3, c.account_4, c.account_5].filter(Boolean) as string[];
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => setExpanded(isExpanded ? null : key)}
                      className="border-b border-border hover:bg-primary/5 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', isExpanded && 'rotate-90 text-[var(--primary)]')} />
                          <span className="text-sm font-semibold text-[var(--foreground)]">{c.creator_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <BrandPill brand={c.brand} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-[var(--foreground)]">
                        {formatCurrency(c.retainer)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                c.status === 'At Risk' ? 'bg-red-400' :
                                c.status === 'Behind'  ? 'bg-amber-400' : 'bg-emerald-400',
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold text-muted-foreground tabular-nums w-12 text-right">
                            {c.posts_found}/{required}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {c.retainer_start_date ? formatDate(c.retainer_start_date) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-muted/50 border-b border-border">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <DetailBlock label="Payment Status">
                              <PaymentBadge status={c.payment_status} />
                            </DetailBlock>
                            <DetailBlock label="Real Name">
                              <span className="text-xs text-[var(--foreground)]">{c.real_name || '—'}</span>
                            </DetailBlock>
                            <DetailBlock label="Pace">
                              <PaceLabel postsFound={c.posts_found} required={required} />
                            </DetailBlock>
                            {accounts.length > 0 && (
                              <DetailBlock label="TikTok Accounts" className="sm:col-span-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {accounts.map((a) => (
                                    <span key={a} className="inline-flex items-center px-2 py-0.5 rounded-md bg-card border border-border text-xs font-medium text-[var(--foreground)]">
                                      @{a.replace(/^@/, '')}
                                    </span>
                                  ))}
                                </div>
                              </DetailBlock>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination footer — only shows when there's more than one page worth */}
      {total > 0 && (pageSize === 0 ? false : total > pageSize) && (
        <div className="px-5 py-3 border-t border-border bg-muted/40 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="appearance-none bg-card border border-border rounded-lg pl-2 pr-6 py-1 text-xs font-semibold text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] cursor-pointer"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n === 0 ? 'All' : n}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <PageButton onClick={() => setPage(0)} disabled={safePage === 0} title="First">
              <ChevronsLeft className="h-3.5 w-3.5" />
            </PageButton>
            <PageButton onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} title="Previous">
              <ChevronLeft className="h-3.5 w-3.5" />
            </PageButton>
            <span className="text-xs font-semibold text-[var(--foreground)] tabular-nums px-3">
              Page {safePage + 1} of {totalPages}
            </span>
            <PageButton onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} title="Next">
              <ChevronRight className="h-3.5 w-3.5" />
            </PageButton>
            <PageButton onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1} title="Last">
              <ChevronsRight className="h-3.5 w-3.5" />
            </PageButton>
          </div>
        </div>
      )}

      {/* When pageSize === 0 (All) and total exceeds default, show a slim row-count footer with a way to switch back */}
      {pageSize === 0 && total > 25 && (
        <div className="px-5 py-2 border-t border-border bg-muted/40 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Showing all {total} rows</span>
          <button
            onClick={() => setPageSize(25)}
            className="font-semibold text-[var(--primary)] hover:text-[var(--primary)] transition-colors"
          >
            Paginate
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

function PageButton({
  onClick, disabled, title, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-border bg-card text-muted-foreground hover:text-[var(--primary)] hover:border-[var(--primary)]/30 disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:border-border transition-colors"
    >
      {children}
    </button>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function BrandPill({ brand }: { brand: string }) {
  const brandMeta = useBrandMeta();
  const color = brandMeta.color(brand);
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white uppercase tracking-wider"
      style={{ backgroundColor: color }}
    >
      {brandMeta.label(brand)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
    'On Track': { bg: 'bg-emerald-500/10 border-emerald-500/25', text: 'text-emerald-500', icon: CheckCircle2 },
    'Behind':   { bg: 'bg-amber-500/10 border-amber-500/25',     text: 'text-amber-500',   icon: AlertTriangle },
    'At Risk':  { bg: 'bg-red-500/10 border-red-500/25',         text: 'text-red-500',     icon: AlertCircle },
  };
  const c = config[status] ?? config['On Track'];
  const Icon = c.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border', c.bg, c.text)}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending:  { bg: 'bg-amber-500/10 border-amber-500/25',     text: 'text-amber-500',   label: 'Pending' },
    approved: { bg: 'bg-blue-500/10 border-blue-500/25',       text: 'text-blue-500',    label: 'Approved' },
    sent:     { bg: 'bg-blue-500/10 border-blue-500/25',       text: 'text-blue-500',    label: 'Sent' },
    paid:     { bg: 'bg-emerald-500/10 border-emerald-500/25', text: 'text-emerald-500', label: 'Paid' },
  };
  const c = config[status] ?? { bg: 'bg-muted border-border', text: 'text-foreground', label: status };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border', c.bg, c.text)}>
      {c.label}
    </span>
  );
}

function DetailBlock({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function PaceLabel({ postsFound, required }: { postsFound: number; required: number }) {
  if (required === 0) return <span className="text-xs text-muted-foreground">No requirement</span>;
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const expected = Math.round((required / daysInMonth) * dayOfMonth);
  const diff = postsFound - expected;
  const tone = diff < 0 ? 'text-amber-500' : diff > 0 ? 'text-emerald-500' : 'text-foreground';
  return (
    <span className={cn('text-xs font-medium', tone)}>
      {postsFound} of {expected} expected by today
      {diff !== 0 && (
        <span className="text-[10px] text-muted-foreground ml-1">({diff > 0 ? '+' : ''}{diff})</span>
      )}
    </span>
  );
}
