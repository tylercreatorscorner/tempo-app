'use client';

/**
 * Invoicing List view — the heavy-lifting table: status tabs, brand + payee
 * filters, search, aging panel, bulk actions, CSV/XLSX export.
 *
 * Extracted from the 718-line invoicing-client monolith when the Board view
 * landed. All filtering is CLIENT-side over the orchestrator's single full
 * fetch (invoice counts are small), so tab/filter switches are instant and the
 * Board and List always agree on the data. Void invoices appear here only —
 * the board carries the 4 core lifecycle states.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Receipt, FileText, Clock, CheckCircle2, Filter, RefreshCw, Download, Plus,
  AlertCircle, Ban, Search, X, Send, Loader2, FileDown, Users, FileSpreadsheet,
} from 'lucide-react';
import { downloadCsv } from '@/lib/utils/csv';
import { downloadXlsx } from '@/lib/utils/xlsx';
import { cn } from '@/lib/utils';
import { daysOverdue, isOverdue } from '@/lib/finance/overdue';
import { formatCurrency, formatDate, formatPeriod } from '@/lib/utils/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { StatCard } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import type { Invoice } from './invoice-detail-sheet';
import { AgingPanel, bucketFor, type AgingBucket } from './aging-panel';
import { NudgeButton, NudgedSpan, ViewedSpan } from './invoice-telemetry';

type Status = 'all' | 'pending' | 'sent' | 'paid' | 'void';

const STATUS_TABS: { value: Status; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'all',     label: 'All',     icon: FileText },
  { value: 'pending', label: 'Pending', icon: Clock },
  { value: 'sent',    label: 'Sent',    icon: Receipt },
  { value: 'paid',    label: 'Paid',    icon: CheckCircle2 },
  { value: 'void',    label: 'Void',    icon: Ban },
];

export interface TeamMemberOption { id: string; name: string }

interface Props {
  invoices: Invoice[];
  loading: boolean;
  /** yyyy-mm-dd (UTC) — computed once per page render so every surface agrees. */
  todayIso: string;
  teamMembers: TeamMemberOption[];
  onOpen: (inv: Invoice) => void;
  onCreate: () => void;
  onRefresh: () => void;
  /** Merge server-updated rows (bulk status flips) back into the shared set. */
  onMerge: (updated: Invoice[]) => void;
}

export function InvoiceList({ invoices, loading, todayIso, teamMembers, onOpen, onCreate, onRefresh, onMerge }: Props) {
  const brandMeta = useBrandMeta();
  const [status, setStatus] = useState<Status>('all');
  const [brand, setBrand] = useState<string>('all');
  const [teamMemberFilter, setTeamMemberFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [agingBucket, setAgingBucket] = useState<AgingBucket>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'sent' | 'paid' | 'void' | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  // Gate the load bar behind a short delay so it doesn't flash on fast loads.
  const showBar = useDelayedFlag(loading);

  const memberNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const tm of teamMembers) m.set(tm.id, tm.name);
    return m;
  }, [teamMembers]);

  // Brand filter options from the full set (values are slugs; labels resolve
  // through useBrandMeta so the raw slug never reaches the UI).
  const brandOptions = useMemo(() => {
    const set = new Set(invoices.map((i) => i.brand));
    return Array.from(set).sort((a, b) => brandMeta.label(a).localeCompare(brandMeta.label(b)));
  }, [invoices, brandMeta]);

  // Brand + payee scope — feeds the stat cards AND the aging panel, so both
  // stay stable while the user flips status tabs.
  const scopedInvoices = useMemo(() => invoices.filter((inv) => {
    if (brand !== 'all' && inv.brand !== brand) return false;
    if (teamMemberFilter !== 'all' && inv.team_member_id !== teamMemberFilter) return false;
    return true;
  }), [invoices, brand, teamMemberFilter]);

  // Stats — all dollar amounts, with counts shown as subtitles for context.
  const stats = useMemo(() => {
    let pendingAmount = 0, pendingCount = 0;
    let sentAmount = 0, sentCount = 0;
    let paidThisYearAmount = 0, paidThisYearCount = 0;
    let outstandingAmount = 0;
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    for (const inv of scopedInvoices) {
      const amt = Number(inv.total_amount);
      if (inv.status === 'pending') { pendingAmount += amt; pendingCount += 1; }
      if (inv.status === 'sent') { sentAmount += amt; sentCount += 1; }
      if (inv.status !== 'paid' && inv.status !== 'void') outstandingAmount += amt;
      if (inv.status === 'paid' && inv.paid_at && inv.paid_at >= yearStart) {
        paidThisYearAmount += amt;
        paidThisYearCount += 1;
      }
    }
    return { outstandingAmount, pendingAmount, pendingCount, sentAmount, sentCount, paidThisYearAmount, paidThisYearCount };
  }, [scopedInvoices]);

  // Status + aging + search on top of the brand/payee scope.
  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedInvoices.filter((inv) => {
      if (status !== 'all' && inv.status !== status) return false;
      if (agingBucket !== 'all' && bucketFor(inv, todayIso) !== agingBucket) return false;
      if (q) {
        const haystack = [
          inv.invoice_number,
          inv.brand,
          brandMeta.label(inv.brand),
          inv.period_month,
          inv.notes ?? '',
          inv.bill_to_name ?? '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [scopedInvoices, status, agingBucket, search, brandMeta, todayIso]);

  // Selection helpers — selection is keyed by invoice id and persists across filters.
  const visibleSelectedCount = filteredInvoices.filter((i) => selectedIds.has(i.id)).length;
  const allVisibleSelected = filteredInvoices.length > 0 && visibleSelectedCount === filteredInvoices.length;
  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const inv of filteredInvoices) next.delete(inv.id);
      else for (const inv of filteredInvoices) next.add(inv.id);
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulk = useCallback(async (action: 'sent' | 'paid' | 'void') => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (action === 'void' && !confirm(`Void ${ids.length} invoice${ids.length === 1 ? '' : 's'}? They stay on file but won't count toward outstanding.`)) {
      return;
    }
    setBulkAction(action);
    setBulkError(null);
    try {
      const res = await fetch('/api/invoices/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status: action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onMerge((j.invoices ?? []) as Invoice[]);
      setSelectedIds(new Set());
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : 'Bulk action failed');
    } finally {
      setBulkAction(null);
    }
  }, [selectedIds, onMerge]);

  const buildExportRows = useCallback(() => {
    const list = filteredInvoices.length > 0 ? filteredInvoices : invoices;
    return list.map((inv) => ({
      invoice_number: inv.invoice_number,
      brand: brandMeta.label(inv.brand),
      brand_slug: inv.brand,
      period_month: inv.period_month,
      status: inv.status,
      affiliate_gmv: Number(inv.affiliate_gmv),
      marketing_gmv: Number(inv.marketing_gmv),
      total_gmv: Number(inv.total_gmv),
      commission: Number(inv.commission),
      retainer: Number(inv.retainer),
      product_retainer: Number(inv.product_retainer),
      launch_fee: Number(inv.launch_fee),
      total_amount: Number(inv.total_amount),
      generated_at: inv.generated_at,
      sent_at: inv.sent_at ?? '',
      paid_at: inv.paid_at ?? '',
      due_date: inv.due_date ?? '',
      bill_to_name: inv.bill_to_name ?? '',
      bill_to_email: inv.bill_to_email ?? '',
    }));
  }, [filteredInvoices, invoices, brandMeta]);

  const handleExportCsv = useCallback(() => {
    const rows = buildExportRows();
    if (rows.length === 0) return;
    const stamp = new Date().toISOString().split('T')[0];
    downloadCsv(`invoices_${stamp}.csv`, rows);
  }, [buildExportRows]);

  const handleExportXlsx = useCallback(() => {
    const rows = buildExportRows();
    if (rows.length === 0) return;
    const stamp = new Date().toISOString().split('T')[0];
    void downloadXlsx(`invoices_${stamp}.xlsx`, [{ name: 'Invoices', rows }]);
  }, [buildExportRows]);

  return (
    <div className="space-y-6">
      {/* Stats row — all $ amounts with counts as context */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          className="col-span-2"
          hero
          label="Outstanding"
          value={formatCurrency(stats.outstandingAmount)}
          subValue={`${stats.pendingCount + stats.sentCount} unpaid`}
        />
        <StatCard
          label="Pending"
          value={formatCurrency(stats.pendingAmount)}
          subValue={`${stats.pendingCount} invoice${stats.pendingCount === 1 ? '' : 's'}`}
          accentColor="var(--pulse-warn)"
        />
        <StatCard
          label="Sent"
          value={formatCurrency(stats.sentAmount)}
          subValue={`${stats.sentCount} invoice${stats.sentCount === 1 ? '' : 's'}`}
          accentColor="var(--primary)"
        />
        <StatCard
          label="Paid This Year"
          value={formatCurrency(stats.paidThisYearAmount)}
          subValue={`${stats.paidThisYearCount} invoice${stats.paidThisYearCount === 1 ? '' : 's'}`}
          accentColor="var(--pulse-pos)"
        />
      </div>

      {/* Aging panel — click a bucket to filter the table */}
      <AgingPanel invoices={scopedInvoices} todayIso={todayIso} active={agingBucket} onPick={setAgingBucket} />

      {/* Filter bar + table */}
      <Card className="relative overflow-hidden">
        <TableLoadBar active={showBar} />
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <SegmentedControl<Status>
            ariaLabel="Filter by status"
            size="sm"
            value={status}
            onValueChange={setStatus}
            options={STATUS_TABS.map((tab) => {
              const Icon = tab.icon;
              return {
                value: tab.value,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </span>
                ),
              };
            })}
          />

          <BrandFilter value={brand} onChange={setBrand} options={brandOptions} labelFor={brandMeta.label} />

          {teamMembers.length > 1 && (
            <TeamMemberFilter value={teamMemberFilter} onChange={setTeamMemberFilter} members={teamMembers} />
          )}

          <SearchInput value={search} onChange={setSearch} />

          {agingBucket !== 'all' && (
            <button
              onClick={() => setAgingBucket('all')}
              className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary"
              title="Clear aging filter"
            >
              Aging: {agingBucket === 'current' ? 'Current' : `${agingBucket} days`}
              <X className="h-3 w-3" />
            </button>
          )}

          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="ml-auto" title="Refresh">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={loading || invoices.length === 0}
            title={filteredInvoices.length < invoices.length ? `Export ${filteredInvoices.length} filtered invoices to CSV` : `Export all ${invoices.length} invoices to CSV`}
          >
            <FileDown className="h-3.5 w-3.5" />
            CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportXlsx}
            disabled={loading || invoices.length === 0}
            title={filteredInvoices.length < invoices.length ? `Export ${filteredInvoices.length} filtered invoices to Excel` : `Export all ${invoices.length} invoices to Excel`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </Button>
        </div>

        {bulkError && (
          <div className="flex items-center gap-2 border-b border-[var(--pulse-neg)]/20 bg-[var(--pulse-neg-bg)] px-5 py-3 text-sm text-[var(--pulse-neg)]">
            <AlertCircle className="h-4 w-4" />
            {bulkError}
          </div>
        )}

        {/* Invoice table */}
        {loading && invoices.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-border border-t-[var(--primary)]" />
          </div>
        ) : invoices.length === 0 ? (
          <ListEmptyState onCreate={onCreate} />
        ) : filteredInvoices.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-bold text-foreground">No invoices match your filters</p>
            <p className="mt-1 text-xs text-muted-foreground">Try clearing search, status, or aging filters.</p>
          </div>
        ) : (
          <div className={cn('overflow-x-auto', showBar && invoices.length > 0 && 'opacity-60 transition-opacity duration-200')}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="h-3.5 w-3.5 cursor-pointer rounded border-border text-[var(--primary)] focus:ring-[var(--primary)]/30"
                      aria-label="Select all visible"
                    />
                  </th>
                  <Th align="left">Invoice #</Th>
                  <Th align="left">Brand</Th>
                  <Th align="left">Period</Th>
                  <Th align="right">Total</Th>
                  <Th align="center">Status</Th>
                  <Th align="left">Issued</Th>
                  <Th align="left">Due / Aging</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  const isSelected = selectedIds.has(inv.id);
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => onOpen(inv)}
                      className={cn(
                        'cursor-pointer border-b border-border transition-colors',
                        isSelected ? 'bg-primary/10 hover:bg-primary/[0.14]' : 'hover:bg-muted/50',
                      )}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(inv.id)}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-border text-[var(--primary)] focus:ring-[var(--primary)]/30"
                          aria-label={`Select ${inv.invoice_number}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">
                        <div>{inv.invoice_number}</div>
                        {/* Issuer name when there's > 1 team member, so Tyler's and
                            Vic's invoices are distinguishable unfiltered. */}
                        {teamMembers.length > 1 && inv.team_member_id && (
                          <div className="mt-0.5 text-[10px] font-normal normal-case text-muted-foreground">
                            {memberNameById.get(inv.team_member_id) ?? '—'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: brandMeta.color(inv.brand) }}
                            aria-hidden="true"
                          />
                          <span className="font-semibold text-foreground">{brandMeta.label(inv.brand)}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatPeriod(inv.period_month, { short: true })}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-foreground">
                        {formatCurrency(Number(inv.total_amount))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={inv.status} />
                        {/* Viewed telemetry is only meaningful once sent. */}
                        {inv.sent_at && inv.status !== 'void' && (
                          <div className="mt-1 text-[10px]"><ViewedSpan invoice={inv} /></div>
                        )}
                        {Number(inv.nudge_count ?? 0) > 0 && (
                          <div className="mt-0.5 text-[10px]"><NudgedSpan invoice={inv} /></div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(inv.generated_at)}</td>
                      <td className="px-4 py-3 text-xs">
                        {inv.due_date ? (
                          <div>
                            <div className="text-muted-foreground">{formatDate(inv.due_date)}</div>
                            <DueIndicator invoice={inv} todayIso={todayIso} />
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isOverdue(inv, todayIso) && (
                            <NudgeButton invoice={inv} onDone={onRefresh} />
                          )}
                          <a
                            href={`/api/invoices/${inv.id}/pdf`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-[var(--primary)]"
                            title="Download PDF"
                          >
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Bulk action bar (sticky bottom) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-foreground px-5 py-3 text-background shadow-2xl">
            <span className="text-sm">
              <span className="font-bold">{selectedIds.size}</span> selected
            </span>
            <span className="h-5 w-px bg-background/20" />
            <button
              onClick={() => handleBulk('sent')}
              disabled={bulkAction !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-bold text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
            >
              {bulkAction === 'sent' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Mark as Sent
            </button>
            <button
              onClick={() => handleBulk('paid')}
              disabled={bulkAction !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--pulse-pos)] px-3 py-1.5 text-xs font-bold text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
            >
              {bulkAction === 'paid' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Mark as Paid
            </button>
            <button
              onClick={() => handleBulk('void')}
              disabled={bulkAction !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pulse-neg)]/40 px-3 py-1.5 text-xs font-bold text-[var(--pulse-neg)] transition-colors hover:bg-[var(--pulse-neg)]/15 disabled:opacity-50"
            >
              {bulkAction === 'void' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
              Void
            </button>
            <span className="h-5 w-px bg-background/20" />
            <button
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-background/60 transition-colors hover:bg-background/10 hover:text-background"
              title="Clear selection"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers / sub-components ──────────────────────────────────────────

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search invoice #, brand, period"
        className="w-56 rounded-xl border border-border bg-card py-2 pl-9 pr-8 text-xs text-foreground transition-colors focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function DueIndicator({ invoice, todayIso }: { invoice: Invoice; todayIso: string }) {
  if (invoice.status === 'paid' || invoice.status === 'void') return null;
  if (!invoice.due_date) return null;
  // THE shared overdue rule (lib/finance/overdue) — 0 means not yet due.
  const days = daysOverdue(invoice, todayIso);
  if (days === 0) {
    const inDays = Math.max(0, Math.round((Date.parse(invoice.due_date) - Date.parse(todayIso)) / 86_400_000));
    return (
      <div className="mt-0.5 text-[10px] text-muted-foreground">
        {inDays === 0 ? 'Due today' : `Due in ${inDays} day${inDays === 1 ? '' : 's'}`}
      </div>
    );
  }
  const tone = days > 30 ? 'text-[var(--pulse-neg)]' : 'text-[var(--pulse-warn)]';
  return (
    <div className={cn('mt-0.5 text-[10px] font-bold', tone)}>
      {days} day{days === 1 ? '' : 's'} overdue
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: 'positive' | 'warning' | 'negative' | 'neutral' | 'accent'; label: string }> = {
    pending: { variant: 'warning',  label: 'Pending' },
    sent:    { variant: 'accent',   label: 'Sent' },
    paid:    { variant: 'positive', label: 'Paid' },
    void:    { variant: 'neutral',  label: 'Void' },
  };
  const c = config[status] ?? { variant: 'neutral' as const, label: status };
  return (
    <Badge variant={c.variant} size="sm" className="uppercase tracking-wider">
      {c.label}
    </Badge>
  );
}

function BrandFilter({ value, onChange, options, labelFor }: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labelFor: (slug: string) => string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none rounded-xl border border-border bg-card py-2 pl-9 pr-8 text-xs font-semibold text-foreground focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
      >
        <option value="all">All brands</option>
        {options.map((b) => <option key={b} value={b}>{labelFor(b)}</option>)}
      </select>
      <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function TeamMemberFilter({ value, onChange, members }: {
  value: string;
  onChange: (v: string) => void;
  members: TeamMemberOption[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none rounded-xl border border-border bg-card py-2 pl-9 pr-8 text-xs font-semibold text-foreground focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
        title="Filter invoices by who issued them"
      >
        <option value="all">All payees</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <Users className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function ListEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Receipt className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-base font-bold text-foreground">No invoices yet</h3>
      <p className="mx-auto mb-6 max-w-sm text-sm text-muted-foreground">
        Generate your first invoice: pick a brand and a month, and the line items come from your earnings.
      </p>
      <Button variant="primary" onClick={onCreate} className="mx-auto">
        <Plus className="h-4 w-4" />
        Create Invoice
      </Button>
    </div>
  );
}
