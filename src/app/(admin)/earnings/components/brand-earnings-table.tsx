'use client';

/**
 * The cockpit's brand table (mockup Surface 1): dot + name (umbrella-tagged),
 * Model caption, Managed GMV (with the inline marketing-GMV editor), Commission,
 * Retainer, Total, invoice lifecycle chip, and a row expander with the dense
 * per-creator breakdown. Row click expands; the pencil opens the brand edit
 * sheet; the Ready chip generates a single draft invoice.
 */
import { Fragment, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { InvoiceChip } from './invoice-chip';
import { MarketingGmvEditor } from './marketing-gmv-editor';
import { modelCaption, type BrandRow, type EarningsResponse } from './types';

export type SortKey = 'brandLabel' | 'totalGmv' | 'commission' | 'retainer' | 'total';

export function BrandEarningsTable({
  rows, todayIso, sortKey, sortDir, onSort, onEdit, onGenerateInvoice, generatingBrand,
  totals, month, onMarketingSaved, onMarketingError,
}: {
  rows: BrandRow[];
  /** yyyy-mm-dd (UTC) — computed once per page render so every surface agrees. */
  todayIso: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  onEdit: (row: BrandRow) => void;
  onGenerateInvoice: (brand: string) => void;
  generatingBrand: string | null;
  totals: EarningsResponse['totals'] | null;
  month: string;
  onMarketingSaved: () => void;
  onMarketingError: (message: string) => void;
}) {
  const meta = useBrandMeta();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (brand: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(brand)) next.delete(brand); else next.add(brand);
    return next;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-border bg-secondary">
            <SortHeader k="brandLabel" label="Brand"       align="left"  sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Model</th>
            <SortHeader k="totalGmv"   label="Managed GMV" align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader k="commission" label="Commission"  align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader k="retainer"   label="Retainer"    align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader k="total"      label="Total"       align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Invoice</th>
            <th className="w-16 px-4 py-3" aria-label="Row actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isExpanded = expanded.has(row.brand);
            const retainerTotal = row.retainer + row.productRetainer;
            return (
              <Fragment key={row.brand}>
                <tr
                  className="group cursor-pointer border-b border-border transition-colors hover:bg-muted/60"
                  onClick={() => toggle(row.brand)}
                >
                  {/* Brand */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: meta.color(row.brand) }}
                        aria-hidden="true"
                      />
                      <span className="font-semibold text-foreground">{row.brandLabel}</span>
                      {row.umbrella && (
                        <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                          (umbrella · {row.umbrella.storeCount} store{row.umbrella.storeCount === 1 ? '' : 's'})
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Model */}
                  <td className="px-4 py-3">
                    <div
                      className="text-[11px] text-muted-foreground"
                      title={
                        row.revshareMaxOutcome
                          ? `MAX(retainer, commission) — ${row.revshareMaxOutcome.winner} won at ${formatCurrency(row.revshareMaxOutcome.activeAmount)} (vs ${formatCurrency(row.revshareMaxOutcome.comparison)})`
                          : undefined
                      }
                    >
                      {modelCaption(row.compensationModel, row.rate)}
                    </div>
                    {Math.abs(row.effectiveRate - row.rate) > 0.01 && (
                      <div className="mt-0.5 text-[10px] text-[var(--primary)]" title="Effective rate after per-creator overrides">
                        eff {row.effectiveRate.toFixed(2)}%
                      </div>
                    )}
                    {row.marketingGmv > 0 && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground" title="Marketing commission rate applied to marketing GMV">
                        mkt {(row.marketingCommissionRate * 100).toFixed(2)}%
                      </div>
                    )}
                  </td>
                  {/* Managed GMV */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div className="font-semibold text-foreground" title="Affiliate GMV — matches the Creators page Managed GMV">
                      {formatCurrency(row.affiliateGmv)}
                    </div>
                    <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                      <span className="uppercase tracking-wide">affiliate</span>
                      <span aria-hidden="true">·</span>
                      <MarketingGmvEditor row={row} month={month} onSaved={onMarketingSaved} onError={onMarketingError} />
                    </div>
                    {row.marketingGmv > 0 && (
                      <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground" title="Affiliate GMV + marketing GMV">
                        = {formatCurrency(row.totalGmv)} total
                      </div>
                    )}
                  </td>
                  {/* Commission */}
                  <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: 'var(--pulse-pos)' }}>
                    {row.commission > 0 ? formatCurrency(row.commission) : <span className="font-normal text-muted-foreground">—</span>}
                    {row.commission > 0 && row.marketingCommission > 0 && (
                      <div className="mt-0.5 text-[10px] font-normal text-muted-foreground" title="Affiliate vs marketing commission split">
                        {formatCurrency(row.affiliateCommission)} aff · {formatCurrency(row.marketingCommission)} mkt
                      </div>
                    )}
                  </td>
                  {/* Retainer */}
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {retainerTotal > 0 ? formatCurrency(retainerTotal) : <span className="text-muted-foreground">—</span>}
                    {row.productRetainer > 0 && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        +{formatCurrency(row.productRetainer)} {row.productRetainerName ?? 'product'}
                      </div>
                    )}
                  </td>
                  {/* Total */}
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-foreground">
                    {formatCurrency(row.total)}
                    {row.launchFee > 0 && (
                      <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                        incl. {formatCurrency(row.launchFee)} {row.launchFeeName ?? 'launch fee'}
                      </div>
                    )}
                  </td>
                  {/* Invoice lifecycle */}
                  <td className="px-4 py-3">
                    <InvoiceChip row={row} todayIso={todayIso} generating={generatingBrand === row.brand} onGenerate={onGenerateInvoice} />
                  </td>
                  {/* Actions + expander */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-[color,opacity,background-color] hover:bg-card hover:text-[var(--primary)] focus-visible:opacity-100 group-hover:opacity-100"
                        title="Edit brand settings"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRight
                        className={cn(
                          'h-3.5 w-3.5 text-muted-foreground transition-transform',
                          isExpanded && 'rotate-90 text-[var(--primary)]',
                        )}
                      />
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="border-b border-border bg-muted/40">
                    <td colSpan={8} className="px-4 py-3">
                      <CreatorBreakdownPanel row={row} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="border-t-2 border-border bg-secondary font-bold text-foreground">
              <td className="px-4 py-3">Totals</td>
              <td />
              <td className="px-4 py-3 text-right tabular-nums">
                <div>{formatCurrency(totals.affiliateGmv)}</div>
                {totals.marketingGmv > 0 && (
                  <div className="text-[10px] font-medium tabular-nums text-muted-foreground">= {formatCurrency(totals.totalGmv)} total</div>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--pulse-pos)' }}>{formatCurrency(totals.commission)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.retainers)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[var(--primary)]">{formatCurrency(totals.earnings)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function SortHeader({ k, label, align, sortKey, sortDir, onSort }: {
  k: SortKey;
  label: string;
  align: 'left' | 'right';
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onSort(k)}
      className={cn(
        'cursor-pointer select-none px-4 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors',
        align === 'right' ? 'text-right' : 'text-left',
        active ? 'text-[var(--primary)]' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  );
}

/** Dense per-creator commission breakdown inside the row expander. */
function CreatorBreakdownPanel({ row }: { row: BrandRow }) {
  if (row.creators.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-muted-foreground">
        No managed creators contributed GMV to this brand for this month.
      </div>
    );
  }
  const top = row.creators.slice(0, 25);
  const remaining = row.creators.length - top.length;
  const remainingGmv = row.creators.slice(25).reduce((s, c) => s + c.gmv, 0);
  const remainingCommission = row.creators.slice(25).reduce((s, c) => s + c.commission, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-baseline justify-between border-b border-border bg-muted/40 px-4 py-2">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Creator Breakdown
        </h4>
        <span className="text-[11px] text-muted-foreground">
          {row.creators.length} creator{row.creators.length === 1 ? '' : 's'} · {formatCurrency(row.affiliateGmv)} affiliate GMV
        </span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-1.5 text-left text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Creator</th>
            <th className="px-4 py-1.5 text-right text-[9px] font-bold uppercase tracking-wider text-muted-foreground">GMV</th>
            <th className="px-4 py-1.5 text-right text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Rate</th>
            <th className="px-4 py-1.5 text-right text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Commission</th>
          </tr>
        </thead>
        <tbody>
          {top.map((c, i) => {
            const isOverride = Math.abs(c.rate - row.rate) > 0.01;
            return (
              <tr key={`${c.name}-${i}`} className="border-b border-border last:border-0">
                <td className="px-4 py-1 font-medium text-foreground">
                  {c.name.startsWith('@') ? c.name : `@${c.name}`}
                </td>
                <td className="px-4 py-1 text-right tabular-nums text-muted-foreground">{formatCurrency(c.gmv)}</td>
                <td className="px-4 py-1 text-right tabular-nums">
                  <span className={cn(isOverride ? 'font-semibold text-[var(--primary)]' : 'text-muted-foreground')}>
                    {c.rate.toFixed(2)}%
                  </span>
                  {isOverride && <span className="ml-1 text-[9px] text-[var(--primary)]" title="Per-creator rate override">*</span>}
                </td>
                <td className="px-4 py-1 text-right font-semibold tabular-nums" style={{ color: 'var(--pulse-pos)' }}>
                  {formatCurrency(c.commission)}
                </td>
              </tr>
            );
          })}
          {remaining > 0 && (
            <tr className="border-b border-border bg-muted/30 last:border-0">
              <td className="px-4 py-1 italic text-muted-foreground">
                + {remaining} more creator{remaining === 1 ? '' : 's'}
              </td>
              <td className="px-4 py-1 text-right tabular-nums text-muted-foreground">{formatCurrency(remainingGmv)}</td>
              <td className="px-4 py-1" />
              <td className="px-4 py-1 text-right tabular-nums text-muted-foreground">{formatCurrency(remainingCommission)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
