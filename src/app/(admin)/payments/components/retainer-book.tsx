'use client';

/**
 * Retainer book — every active managed creator on a paid retainer: who, which
 * brand, how much per month, since when. Contract data from managed_creators
 * only.
 *
 * This replaced the old "Retainer Tracker", whose post-progress bars and
 * On Track / Behind / At Risk statuses were computed from creator_payments —
 * a table nothing writes — so every row's pace was fabricated from a fake 0.
 * Posting pace lives with the roster health model; this table stays honest.
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Search, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { Table, TBody, THead, TD, TH, TR } from '@/components/ui/table';

export interface RetainerBookRow {
  creator_name: string;
  real_name: string | null;
  brand: string;
  retainer: number;
  retainer_start_date: string | null;
  accounts: string[];
}

const PAGE_SIZE = 25;
const MAX_ACCOUNT_CHIPS = 3;

interface Props {
  creators: RetainerBookRow[];
  loading: boolean;
  brandFilter: string;
  /** Brand slugs available in the dropdown — derived from real data, not hardcoded. */
  availableBrands: string[];
  onBrandFilterChange: (v: string) => void;
  /** Dim the table body during a brand refetch — the filter bar stays crisp. */
  refetching?: boolean;
}

export function RetainerBook({
  creators, loading, brandFilter, availableBrands = [], onBrandFilterChange, refetching = false,
}: Props) {
  const brandMeta = useBrandMeta();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  // Reset to page 0 on any filter change (safePage below also clamps when the
  // row set shrinks under the current page, e.g. after a refetch).
  const handleBrandChange = (v: string) => { setPage(0); onBrandFilterChange(v); };
  const handleSearchChange = (v: string) => { setPage(0); setSearch(v); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter((c) => {
      const haystack = [
        c.creator_name,
        c.real_name ?? '',
        c.brand,
        brandMeta.label(c.brand),
        ...c.accounts,
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [creators, search, brandMeta]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const end = Math.min(total, start + PAGE_SIZE);
  const pageRows = filtered.slice(start, end);
  const bookTotal = useMemo(() => filtered.reduce((s, c) => s + c.retainer, 0), [filtered]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--pulse-elev-2)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-3 pt-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Retainer book</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {total === 0
              ? 'No creators on retainer'
              : `${total} creator${total === 1 ? '' : 's'} on a monthly retainer`}
          </p>
        </div>
        {total > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-bold tabular-nums text-foreground">{formatCurrency(bookTotal)}</span> /mo
          </p>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 border-y border-border bg-muted/40 px-5 py-3">
        <div className="relative">
          <select
            value={brandFilter}
            onChange={(e) => handleBrandChange(e.target.value)}
            className="cursor-pointer appearance-none rounded-xl border border-border bg-card py-2 pl-9 pr-8 text-xs font-semibold text-foreground focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
          >
            <option value="all">All brands</option>
            {availableBrands.map((b) => (
              <option key={b} value={b}>{brandMeta.label(b)}</option>
            ))}
          </select>
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search creator, handle, brand"
            className="w-56 rounded-xl border border-border bg-card py-2 pl-9 pr-8 text-xs text-foreground transition-colors focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
          />
          {search && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className={cn('transition-opacity duration-200', refetching && 'opacity-60')}>
        {loading && creators.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-border border-t-[var(--primary)]" />
          </div>
        ) : total === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-bold text-foreground">No creators on retainer</p>
            <p className="mt-1 text-xs text-muted-foreground">Try changing the brand filter or clearing search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Creator</TH>
                  <TH className="text-left">Brand</TH>
                  <TH className="text-left">TikTok accounts</TH>
                  <TH>Retainer /mo</TH>
                  <TH className="text-left">Started</TH>
                </TR>
              </THead>
              <TBody>
                {pageRows.map((c, i) => (
                  <TR key={`${c.brand}|${c.creator_name}|${i}`} className="hover:bg-muted/40">
                    <TD className="font-semibold text-foreground">{c.creator_name}</TD>
                    <TD className="text-left">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: brandMeta.color(c.brand) }}
                          aria-hidden="true"
                        />
                        <span className="text-foreground">{brandMeta.label(c.brand)}</span>
                      </span>
                    </TD>
                    <TD className="text-left">
                      {c.accounts.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-1.5">
                          {c.accounts.slice(0, MAX_ACCOUNT_CHIPS).map((a) => (
                            <span
                              key={a}
                              className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-foreground"
                            >
                              @{a.replace(/^@/, '')}
                            </span>
                          ))}
                          {c.accounts.length > MAX_ACCOUNT_CHIPS && (
                            <span className="text-xs text-muted-foreground">
                              +{c.accounts.length - MAX_ACCOUNT_CHIPS} more
                            </span>
                          )}
                        </span>
                      )}
                    </TD>
                    <TD className="font-bold text-foreground">{formatCurrency(c.retainer)}</TD>
                    <TD className="text-left text-xs">
                      {c.retainer_start_date ? formatDate(c.retainer_start_date) : <span className="text-muted-foreground">—</span>}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}

        {/* Pagination footer */}
        {total > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-3">
            <span className="text-xs tabular-nums text-muted-foreground">
              Showing {start + 1}-{end} of {total}
            </span>
            <div className="flex items-center gap-1">
              <PageButton onClick={() => setPage(0)} disabled={safePage === 0} title="First">
                <ChevronsLeft className="h-3.5 w-3.5" />
              </PageButton>
              <PageButton onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} title="Previous">
                <ChevronLeft className="h-3.5 w-3.5" />
              </PageButton>
              <span className="px-3 text-xs font-semibold tabular-nums text-foreground">
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
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary)] disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted-foreground"
    >
      {children}
    </button>
  );
}
