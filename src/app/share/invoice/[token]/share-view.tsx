/**
 * Public-facing invoice page — the link IS the invoice, the PDF is the export.
 *
 * Rendered to the approved invoice-revamp mockup (Surface 1): gradient
 * masthead with the invoice number + status chip + Download PDF, From /
 * Billed-to party cards, line items with the GMV sub-caption, total row with
 * net terms, the optional personal note, payment instructions beside the
 * (dark, Phase B) pay-online preview, and the private-link footer.
 *
 * Deliberately LIGHT regardless of viewer theme: this is the artifact brands
 * receive — print-adjacent, paper white, the same family as their /r
 * performance reports so the two feel like one firm.
 *
 * Line items and money come from the shared finance modules
 * (buildDisplayLineItems / format utils) — never re-derived here.
 */
import { Download } from 'lucide-react';
import { buildDisplayLineItems } from '@/lib/finance/invoice-math';
import { daysOverdue } from '@/lib/finance/overdue';
import { formatCurrency, formatCurrencyExact, formatDate, formatPeriod } from '@/lib/utils/format';

const AGENCY = 'Creators Corner';

/** Rendered only when an invoice predates the bill_from snapshot columns. */
const FALLBACK_BILL_FROM_NAME = AGENCY;

export interface ShareInvoice {
  id: string;
  invoiceNumber: string;
  brand: string;
  brandName: string;
  periodMonth: string;
  generatedAt: string;
  dueDate: string | null;
  paidAt: string | null;
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
  /** The optional personal line shown as "A note from {first name}". */
  shareNote: string | null;
  paymentInstructions: string | null;
  billTo: {
    name: string | null;
    email: string | null;
    address: string | null;
  };
  /** Who issued the invoice — snapshotted at creation from team_members. */
  billFrom: {
    name: string | null;
    email: string | null;
    address: string | null;
  };
  creators: Array<{ name?: string; gmv?: number; rate?: number; commission?: number }>;
}

interface Props {
  token: string;
  invoice: ShareInvoice;
  /** yyyy-mm-dd (UTC), computed once server-side so render and hydration agree. */
  todayIso: string;
}

function StatusChip({ invoice, todayIso }: { invoice: ShareInvoice; todayIso: string }) {
  const base = 'rounded-md px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em]';
  if (invoice.status === 'paid') {
    return (
      <span className={base} style={{ background: 'rgba(34,197,139,.25)', color: '#a7f0d3' }}>
        Paid{invoice.paidAt ? ` ${formatDate(invoice.paidAt)}` : ''}
      </span>
    );
  }
  if (invoice.status === 'void') {
    return (
      <span className={base} style={{ background: 'rgba(255,255,255,.16)', color: 'rgba(255,255,255,.75)' }}>
        Void
      </span>
    );
  }
  // Open invoice: overdue (shared rule) beats the due chip.
  const late = daysOverdue({ status: invoice.status, dueDate: invoice.dueDate }, todayIso);
  if (late > 0) {
    return (
      <span className={base} style={{ background: 'rgba(244,87,124,.28)', color: '#ffc0d0' }}>
        Overdue {late}d
      </span>
    );
  }
  if (invoice.dueDate) {
    return (
      <span className={base} style={{ background: 'rgba(240,178,50,.25)', color: '#ffd982' }}>
        Due {formatDate(invoice.dueDate)}
      </span>
    );
  }
  return null;
}

function PartyCard({ label, name, lines }: { label: string; name: string; lines: (string | null)[] }) {
  return (
    <div className="rounded-xl border border-[#e7e7f2] bg-white px-4 py-3.5">
      <div className="mb-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-[#8a8fb0]">{label}</div>
      <div className="text-[13.5px] font-extrabold text-[#171a33]">{name}</div>
      {lines.filter((l): l is string => !!l).map((l, i) => (
        <div key={i} className="whitespace-pre-line text-xs leading-relaxed text-[#6b7093]">{l}</div>
      ))}
    </div>
  );
}

export function ShareView({ token, invoice, todayIso }: Props) {
  // Which lines render (and their order) comes from the shared invoice math —
  // the PDF builds from the same function, so web and PDF can never disagree
  // about which rows an invoice has.
  const creatorCount = invoice.creators.filter((c) => c && c.name).length;
  type DisplayRow = { key: string; title: string; sub?: string | undefined; amount: number; tooltip?: string };
  const lineItems: DisplayRow[] = buildDisplayLineItems(invoice).map((item) => {
    let sub: string | undefined;
    if (item.key === 'commission') {
      // GMV sub-caption from the STORED totals (frozen at generation).
      const gmvParts: string[] = [];
      if (item.affiliateGmv && item.marketingGmv) {
        gmvParts.push(`On ${formatCurrency(item.affiliateGmv)} affiliate + ${formatCurrency(item.marketingGmv)} marketing GMV`);
      } else if (item.affiliateGmv || item.marketingGmv) {
        gmvParts.push(`On ${formatCurrency((item.affiliateGmv ?? 0) + (item.marketingGmv ?? 0))} managed GMV`);
      }
      if (creatorCount > 0) gmvParts.push(`${creatorCount} creator${creatorCount === 1 ? '' : 's'}`);
      sub = gmvParts.length ? gmvParts.join(' · ') : undefined;
    }
    return { key: item.key, title: item.title, sub, amount: item.amount };
  });

  // Coherence check: the document must always sum. A hand-edited stored total
  // can drift from its line items (prod: lines $14,650.57 under a $34,650.57
  // total) — surface the signed difference as an explicit Adjustment line
  // rather than shipping a client-facing document that doesn't add up.
  const lineSum = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const totalDelta = invoice.totalAmount - lineSum;
  if (Math.abs(totalDelta) > 1) {
    lineItems.push({
      key: 'adjustment',
      title: 'Adjustment',
      amount: totalDelta,
      tooltip: 'Manually adjusted total - the stored total differs from the line items',
    });
  }

  const isVoid = invoice.status === 'void';
  // Payment guidance (bank instructions + the pay-online preview) belongs on
  // OPEN invoices only — a paid or voided document must not ask for money.
  const isOpenForPayment = invoice.status === 'pending' || invoice.status === 'sent';

  // Net terms for the total row, derived from the stored issue + due dates.
  const netDays = invoice.dueDate
    ? Math.round((Date.parse(invoice.dueDate) - Date.parse(invoice.generatedAt.slice(0, 10))) / 86_400_000)
    : null;
  const totalLabel = invoice.status === 'paid'
    ? 'Total paid'
    : isVoid
      ? 'Voided - no payment due'
      : `Total due${netDays && netDays > 0 ? ` · net ${netDays}` : ''}`;

  const fromName = invoice.billFrom.name || FALLBACK_BILL_FROM_NAME;
  const noteAuthor = invoice.billFrom.name?.trim().split(/\s+/)[0] || 'your account lead';

  return (
    <div className="min-h-screen bg-[#fbfbfd] pb-8 text-[#171a33]">
      {/* Masthead — same gradient family as the /r client reports */}
      <div
        className="px-5 pb-6 pt-7 text-white sm:px-10"
        style={{ background: 'linear-gradient(135deg,#141633 0%,#3b2f7d 55%,#8a2f80 100%)' }}
      >
        <div className="mx-auto flex max-w-[860px] flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.2em] text-white/65">
              {AGENCY} &middot; Invoice
            </div>
            <h1 className="mb-0.5 mt-2 text-2xl font-extrabold tracking-tight">{invoice.invoiceNumber}</h1>
            <div className="text-[13px] text-white/80">
              {invoice.brandName} &middot; {formatPeriod(invoice.periodMonth)} &middot; issued {formatDate(invoice.generatedAt)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusChip invoice={invoice} todayIso={todayIso} />
            <a
              href={`/api/invoices/share/${token}/pdf`}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-white/25 bg-white/15 px-3.5 py-1.5 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[860px] px-5 pt-6 sm:px-10">
        {/* Parties */}
        <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <PartyCard
            label="From"
            name={fromName}
            lines={[invoice.billFrom.name ? AGENCY : null, invoice.billFrom.email, invoice.billFrom.address]}
          />
          <PartyCard
            label="Billed to"
            name={invoice.brandName}
            lines={[invoice.billTo.name, invoice.billTo.email, invoice.billTo.address]}
          />
        </div>

        {/* Line items */}
        <div className="overflow-hidden rounded-[14px] border border-[#e7e7f2] bg-white">
          {lineItems.map((item) => (
            <div
              key={item.key}
              title={item.tooltip}
              className="flex items-baseline justify-between gap-3.5 border-b border-[#f2f1f8] px-[18px] py-3"
            >
              <div>
                <div className="text-[13px] font-semibold">{item.title}</div>
                {item.sub && <div className="mt-px text-[11px] text-[#8a8fb0]">{item.sub}</div>}
              </div>
              <div className="text-[13.5px] font-bold tabular-nums">{formatCurrencyExact(item.amount)}</div>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3.5 bg-[#f7f7fc] px-[18px] py-3.5">
            <div className="text-sm font-extrabold">{totalLabel}</div>
            <div
              className={
                isVoid
                  ? 'text-xl font-extrabold tabular-nums text-[#8a8fb0] line-through'
                  : 'text-xl font-extrabold tabular-nums text-[#5b5ee8]'
              }
            >
              {formatCurrencyExact(invoice.totalAmount)}
            </div>
          </div>
        </div>

        {/* A note from the account lead */}
        {invoice.shareNote && (
          <div className="my-4 rounded-xl border border-[#e3e0f5] border-l-[3px] border-l-[#5b5ee8] bg-white px-4 py-3.5 text-[13px] leading-[1.6] text-[#33375c]">
            <b className="text-[12.5px]">A note from {noteAuthor}</b>
            <p className="mt-0.5 whitespace-pre-line">{invoice.shareNote}</p>
          </div>
        )}

        {/* Payment row: instructions beside the Phase B pay-online preview.
            Open invoices only — a paid or voided document must not solicit
            payment. */}
        {isOpenForPayment && (
          <div className={`mt-4 grid grid-cols-1 gap-3.5 ${invoice.paymentInstructions ? 'md:grid-cols-[1.2fr_1fr]' : ''}`}>
            {invoice.paymentInstructions && (
              <div className="rounded-[14px] border border-[#e7e7f2] bg-white px-[18px] py-4">
                <div className="mb-2 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-[#8a8fb0]">
                  Pay by bank transfer
                </div>
                <pre className="whitespace-pre-wrap font-mono text-xs leading-[1.6] text-[#33375c]">{invoice.paymentInstructions}</pre>
              </div>
            )}
            {/* Pay online ships dark until Stripe ACH (Phase B) is armed — this is
                a non-interactive preview, exactly as mocked. */}
            <div className="relative rounded-[14px] border border-dashed border-[#c9c6ea] bg-[#fbfaff] px-[18px] py-4">
              <span className="absolute right-3 top-2.5 rounded-full border border-[#e3e0f5] bg-white px-2 py-0.5 text-[9px] font-extrabold tracking-[0.1em] text-[#8a8fb0]">
                Coming soon
              </span>
              <div className="mb-2 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-[#8a8fb0]">
                Or pay online
              </div>
              <span
                className="mb-2 block cursor-default rounded-[11px] py-3 text-center text-sm font-extrabold text-white"
                style={{ background: 'linear-gradient(135deg,#5b5ee8,#a855f7)' }}
                aria-disabled="true"
              >
                Pay {formatCurrencyExact(invoice.totalAmount)} &middot; bank debit (ACH)
              </span>
              <div className="text-center text-[10.5px] text-[#8a8fb0]">
                Secure ACH via Stripe &middot; fees capped at $5 &middot; marks the invoice paid automatically
              </div>
            </div>
          </div>
        )}

        {/* Operator notes (net terms, PO numbers) — also on the PDF, kept here
            so the web view and the export never disagree on client-visible
            content. Quiet by design; the mockup's personal note is shareNote. */}
        {invoice.notes && (
          <div className="mt-3.5 rounded-xl border border-[#e7e7f2] bg-white px-4 py-3">
            <div className="mb-1 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-[#8a8fb0]">Notes</div>
            <p className="whitespace-pre-line text-xs leading-relaxed text-[#33375c]">{invoice.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex flex-wrap justify-between gap-3.5 border-t border-[#e7e7f2] pt-4 text-[11.5px] text-[#8a8fb0]">
          <span>Questions: reply to the email this link arrived in</span>
          <span>Private link &middot; {invoice.invoiceNumber} &middot; {AGENCY}</span>
        </div>
      </div>
    </div>
  );
}
