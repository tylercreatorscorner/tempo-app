'use client';

/**
 * Public-facing invoice view. Mirrors the PDF layout (dark band header,
 * line items, creator breakdown, totals, payment instructions) so brands
 * see consistent branding whether they view in-browser or download.
 */

import { Download, Lock } from 'lucide-react';
import { formatCurrency, formatDate, formatPeriod } from '@/lib/utils/format';

export interface ShareInvoice {
  id: string;
  invoiceNumber: string;
  brand: string;
  brandName: string;
  periodMonth: string;
  generatedAt: string;
  dueDate: string | null;
  status: string;
  affiliateGmv: number;
  marketingGmv: number;
  totalGmv: number;
  commission: number;
  retainer: number;
  productRetainer: number;
  launchFee: number;
  totalAmount: number;
  notes: string | null;
  paymentInstructions: string | null;
  billTo: {
    name: string | null;
    email: string | null;
    address: string | null;
  };
  creators: Array<{ name?: string; gmv?: number; rate?: number; commission?: number }>;
}

interface Props {
  token: string;
  invoice: ShareInvoice;
}

export function ShareView({ token, invoice }: Props) {
  const lineItems: { title: string; sub?: string; amount: number }[] = [];
  if (invoice.commission > 0) {
    const subParts: string[] = [];
    if (invoice.affiliateGmv > 0) subParts.push(`Affiliate GMV ${formatCurrency(invoice.affiliateGmv)}`);
    if (invoice.marketingGmv > 0) subParts.push(`Marketing GMV ${formatCurrency(invoice.marketingGmv)}`);
    lineItems.push({ title: 'Creator Commission', sub: subParts.join(' · '), amount: invoice.commission });
  }
  if (invoice.retainer > 0)        lineItems.push({ title: 'Monthly Retainer', amount: invoice.retainer });
  if (invoice.productRetainer > 0) lineItems.push({ title: 'Product Retainer', amount: invoice.productRetainer });
  if (invoice.launchFee > 0)       lineItems.push({ title: 'Launch Fee', amount: invoice.launchFee });

  const creators = invoice.creators.filter((c) => c && c.name);
  const totalCreatorCommission = creators.reduce((s, c) => s + Number(c.commission ?? 0), 0);
  const totalCreatorGmv = creators.reduce((s, c) => s + Number(c.gmv ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top color band — matches the PDF header */}
      <div className="bg-[#1A1B3A] text-white">
        <div className="max-w-3xl mx-auto px-6 sm:px-12 py-12 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-baseline">
              <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">tempo</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-[#FF4D8D]">.</span>
            </div>
            <p className="text-[10px] tracking-[0.2em] uppercase font-semibold text-pink-200 mt-2">Creator Performance Invoice</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] tracking-[0.2em] uppercase font-semibold text-pink-200">Invoice</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight mt-1">{invoice.invoiceNumber}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-6 sm:px-12 py-10 space-y-8">
        {/* Action bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-500">
            <Lock className="inline h-3 w-3 -mt-0.5" /> This is a private invoice link. Please don't share publicly.
          </p>
          <a
            href={`/api/invoices/share/${token}/pdf`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1A1B3A] text-white text-sm font-bold hover:bg-[#2D2E5C] transition-colors shadow-sm"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </a>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetaCell label="Period" value={formatPeriod(invoice.periodMonth)} />
          <MetaCell label="Issued" value={formatDate(invoice.generatedAt)} />
          <MetaCell label="Due Date" value={invoice.dueDate ? formatDate(invoice.dueDate) : '—'} />
        </div>

        {/* Bill to */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PartyBlock label="Billed To">
            <p className="text-base font-bold text-[#1A1B3A]">{invoice.brandName}</p>
            {invoice.billTo.name && <p className="text-sm text-gray-600 mt-1">{invoice.billTo.name}</p>}
            {invoice.billTo.address && (
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{invoice.billTo.address}</p>
            )}
            {invoice.billTo.email && <p className="text-sm text-gray-600 mt-1">{invoice.billTo.email}</p>}
          </PartyBlock>
          <PartyBlock label="From">
            <p className="text-base font-bold text-[#1A1B3A]">Creators Corner</p>
          </PartyBlock>
        </div>

        {/* Line items */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
          <div className="px-5 py-3 bg-[#1A1B3A] text-white flex items-baseline justify-between">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.15em]">Description</h3>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.15em]">Amount</h3>
          </div>
          {lineItems.map((item, i) => (
            <div key={i} className={`px-5 py-4 flex items-baseline justify-between border-t border-gray-100 ${i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
              <div>
                <p className="text-sm font-bold text-[#1A1B3A]">{item.title}</p>
                {item.sub && <p className="text-xs text-gray-500 mt-0.5">{item.sub}</p>}
              </div>
              <p className="text-base font-bold text-[#1A1B3A] tabular-nums">{formatCurrency(item.amount)}</p>
            </div>
          ))}
        </div>

        {/* Creator breakdown */}
        {creators.length > 0 && (
          <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
            <div className="px-5 py-3 bg-gray-50/60 border-b border-gray-100 flex items-baseline justify-between">
              <h3 className="text-sm font-bold text-[#1A1B3A]">Creator Breakdown</h3>
              <p className="text-xs text-gray-500">
                {creators.length} creator{creators.length === 1 ? '' : 's'} · {formatCurrency(totalCreatorGmv)} affiliate GMV
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50/40">
                    <th className="px-5 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-gray-500">Creator</th>
                    <th className="px-5 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-gray-500">GMV</th>
                    <th className="px-5 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-gray-500">Rate</th>
                    <th className="px-5 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-gray-500">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {creators.map((c, i) => {
                    const name = String(c.name ?? '');
                    const display = name.startsWith('@') ? name : `@${name}`;
                    return (
                      <tr key={`${name}-${i}`} className="border-t border-gray-100">
                        <td className="px-5 py-1.5 font-semibold text-[#1A1B3A]">{display}</td>
                        <td className="px-5 py-1.5 text-right tabular-nums text-gray-600">{formatCurrency(Number(c.gmv ?? 0))}</td>
                        <td className="px-5 py-1.5 text-right tabular-nums text-gray-500">{Number(c.rate ?? 0).toFixed(2)}%</td>
                        <td className="px-5 py-1.5 text-right tabular-nums font-bold text-[#1A1B3A]">{formatCurrency(Number(c.commission ?? 0))}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-[#1A1B3A] bg-gray-50/60">
                    <td className="px-5 py-2 font-bold text-[#1A1B3A] uppercase tracking-wider text-[10px]" colSpan={3}>Subtotal — Creator Commission</td>
                    <td className="px-5 py-2 text-right tabular-nums font-bold text-[#1A1B3A]">{formatCurrency(totalCreatorCommission)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Total */}
        <div className="rounded-2xl bg-[#1A1B3A] text-white p-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] tracking-[0.2em] uppercase font-bold text-pink-200">Total Due</p>
            <p className="text-xs text-pink-200/80 mt-0.5">
              Payable on or before {invoice.dueDate ? formatDate(invoice.dueDate) : '—'}
            </p>
          </div>
          <p className="text-3xl sm:text-4xl font-extrabold tabular-nums">{formatCurrency(invoice.totalAmount)}</p>
        </div>

        {/* Payment instructions */}
        {invoice.paymentInstructions && (
          <div className="rounded-2xl bg-white border border-gray-200 border-l-4 border-l-[#1A1B3A] p-5">
            <p className="text-[10px] tracking-[0.15em] uppercase font-bold text-[#1A1B3A] mb-2">Payment Instructions</p>
            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{invoice.paymentInstructions}</p>
          </div>
        )}

        {/* Notes */}
        {invoice.notes && (
          <div className="rounded-2xl bg-pink-50 border border-pink-100 border-l-4 border-l-[#FF4D8D] p-5">
            <p className="text-[10px] tracking-[0.15em] uppercase font-bold text-[#E91E8C] mb-2">Notes</p>
            <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{invoice.notes}</p>
          </div>
        )}

        {/* Thanks line */}
        <p className="text-center text-sm text-gray-500 italic pt-2">Thank you for your business.</p>

        {/* Footer */}
        <footer className="pt-8 border-t border-gray-200 flex items-center justify-between text-[11px] text-gray-400">
          <span>Powered by Tempo</span>
          <span>{invoice.invoiceNumber}</span>
        </footer>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.15em] uppercase font-bold text-gray-400 mb-1">{label}</p>
      <p className="text-base font-bold text-[#1A1B3A]">{value}</p>
    </div>
  );
}

function PartyBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-200 border-l-4 border-l-[#FF4D8D] p-5">
      <p className="text-[10px] tracking-[0.15em] uppercase font-bold text-gray-500 mb-2">{label}</p>
      {children}
    </div>
  );
}
