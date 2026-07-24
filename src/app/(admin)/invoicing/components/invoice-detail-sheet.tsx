'use client';

import { useEffect, useState } from 'react';
import { X, Save, Download, Trash2, Loader2, Send, CheckCircle2, RotateCcw, RefreshCw, Users, Ban, Link2, Mail, Copy, Check, ExternalLink, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { downloadCsv } from '@/lib/utils/csv';
import { downloadXlsx } from '@/lib/utils/xlsx';
import { MarkPaidModal } from './mark-paid-modal';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';

export interface InvoiceCreator {
  name: string;
  gmv: number;
  rate: number;
  commission: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  brand: string;
  period_month: string;
  affiliate_gmv: number | string;
  marketing_gmv: number | string;
  total_gmv: number | string;
  commission: number | string;
  retainer: number | string;
  product_retainer: number | string;
  launch_fee: number | string;
  total_amount: number | string;
  status: 'pending' | 'sent' | 'paid' | 'void';
  generated_at: string;
  sent_at: string | null;
  paid_at: string | null;
  due_date: string | null;
  notes: string | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  payment_instructions: string | null;
  /** Issuer (Tyler / Vic / etc.) — used to filter and label invoices. */
  team_member_id?: string | null;
  bill_from_name?: string | null;
  bill_from_email?: string | null;
  bill_from_address?: string | null;
  public_token?: string | null;
  /** First real client open (bot-safe beacon) — null until the link is opened. */
  viewed_at?: string | null;
  /** Payment-reminder log (POST /api/invoices/[id]/nudge). */
  last_nudged_at?: string | null;
  nudge_count?: number | null;
  /** Optional personal line on the public invoice page ("A note from …"). */
  share_note?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  amount_received?: number | string | null;
  payment_received_notes?: string | null;
  creator_breakdown?: InvoiceCreator[] | null;
}

interface Props {
  invoice: Invoice;
  onClose: () => void;
  onUpdated: (inv: Invoice) => void;
  onDeleted: (id: string) => void;
}

export function InvoiceDetailSheet({ invoice, onClose, onUpdated, onDeleted }: Props) {
  const [draft, setDraft] = useState({
    commission: Number(invoice.commission),
    retainer: Number(invoice.retainer),
    product_retainer: Number(invoice.product_retainer),
    launch_fee: Number(invoice.launch_fee),
    due_date: invoice.due_date ?? '',
    notes: invoice.notes ?? '',
    bill_to_name: invoice.bill_to_name ?? '',
    bill_to_email: invoice.bill_to_email ?? '',
    bill_to_address: invoice.bill_to_address ?? '',
    payment_instructions: invoice.payment_instructions ?? '',
    share_note: invoice.share_note ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailNotice, setEmailNotice] = useState<{ kind: 'success' | 'error'; message: string; hint?: string } | null>(null);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({
      commission: Number(invoice.commission),
      retainer: Number(invoice.retainer),
      product_retainer: Number(invoice.product_retainer),
      launch_fee: Number(invoice.launch_fee),
      due_date: invoice.due_date ?? '',
      notes: invoice.notes ?? '',
      bill_to_name: invoice.bill_to_name ?? '',
      bill_to_email: invoice.bill_to_email ?? '',
      bill_to_address: invoice.bill_to_address ?? '',
      payment_instructions: invoice.payment_instructions ?? '',
      share_note: invoice.share_note ?? '',
    });
    // Hydrate share URL from existing token (if invoice was previously shared)
    if (invoice.public_token && typeof window !== 'undefined') {
      setShareUrl(`${window.location.origin}/share/invoice/${invoice.public_token}`);
    } else {
      setShareUrl(null);
    }
  }, [invoice]);

  // Transient notices reset only when a DIFFERENT invoice opens. Keyed on the
  // id, not the object: handleSend/handleEmail set these and then hand a fresh
  // invoice object back via onUpdated — an [invoice]-keyed reset would wipe
  // them one frame after they appear.
  useEffect(() => {
    setCopied(false);
    setEmailNotice(null);
    setSendNotice(null);
  }, [invoice.id]);

  const computedTotal =
    draft.commission + draft.retainer + draft.product_retainer + draft.launch_fee;

  // True once any line item differs from the persisted invoice, i.e. the user is
  // actively editing. Only then does the additive preview above need the caveat:
  // the server re-applies the brand's compensation model (revshare_max /
  // commission_only / retainer_only zero one side) when it persists the total,
  // so the saved figure can differ from this plain sum.
  const lineItemsEdited =
    draft.commission !== Number(invoice.commission) ||
    draft.retainer !== Number(invoice.retainer) ||
    draft.product_retainer !== Number(invoice.product_retainer) ||
    draft.launch_fee !== Number(invoice.launch_fee);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commission: draft.commission,
          retainer: draft.retainer,
          product_retainer: draft.product_retainer,
          launch_fee: draft.launch_fee,
          due_date: draft.due_date || null,
          notes: draft.notes || null,
          bill_to_name: draft.bill_to_name || null,
          bill_to_email: draft.bill_to_email || null,
          bill_to_address: draft.bill_to_address || null,
          payment_instructions: draft.payment_instructions || null,
          share_note: draft.share_note || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onUpdated(j.invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(newStatus: 'pending' | 'sent' | 'paid' | 'void') {
    setStatusUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onUpdated(j.invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status update failed');
    } finally {
      setStatusUpdating(false);
    }
  }

  /**
   * Send = the link IS the invoice: mint/reuse the share link, copy it, and
   * stamp status sent (server no-ops the status when it's already sent).
   */
  async function handleSend() {
    setSending(true);
    setSendNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setShareUrl(j.url);
      let copiedOk = true;
      try {
        await navigator.clipboard.writeText(j.url);
      } catch {
        copiedOk = false; // clipboard permissions — the link is still below
      }
      setSendNotice(
        j.statusChanged
          ? (copiedOk ? 'Link copied - marked sent' : 'Marked sent - copy the link below')
          : (copiedOk ? 'Link copied' : 'Link ready below'),
      );
      if (j.invoice) onUpdated(j.invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  async function handleShare() {
    setSharing(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/share`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setShareUrl(j.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create share link');
    } finally {
      setSharing(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard failures (browser permissions, etc.)
    }
  }

  async function handleEmail() {
    if (!invoice.bill_to_email) {
      setEmailNotice({ kind: 'error', message: 'No recipient email — set Bill-To Email above before sending.' });
      return;
    }
    if (!confirm(`Email ${invoice.invoice_number} to ${invoice.bill_to_email}?\nThis will mark the invoice as Sent.`)) return;
    setEmailing(true);
    setEmailNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (res.status === 501) {
        setEmailNotice({ kind: 'error', message: j.error || 'Email not configured', hint: j.hint });
        return;
      }
      if (!res.ok) throw new Error(j.error || j.details?.message || `HTTP ${res.status}`);
      setEmailNotice({ kind: 'success', message: `Sent to ${invoice.bill_to_email}` });
      if (j.invoice) onUpdated(j.invoice);
      if (j.shareUrl) setShareUrl(j.shareUrl);
    } catch (e) {
      setEmailNotice({ kind: 'error', message: e instanceof Error ? e.message : 'Send failed' });
    } finally {
      setEmailing(false);
    }
  }

  async function handleMarkPaid(payload: {
    payment_method: string;
    payment_reference: string | null;
    amount_received: number;
    payment_received_notes: string | null;
  }) {
    setMarkingPaid(true);
    setError(null);
    try {
      // Two PATCHes: one for payment detail, then status='paid' (auto-stamps paid_at).
      // Could be combined server-side later, but two roundtrips is fine here.
      const detailRes = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const detailJson = await detailRes.json();
      if (!detailRes.ok) throw new Error(detailJson.error || `HTTP ${detailRes.status}`);

      const statusRes = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      });
      const statusJson = await statusRes.json();
      if (!statusRes.ok) throw new Error(statusJson.error || `HTTP ${statusRes.status}`);

      onUpdated(statusJson.invoice);
      setMarkPaidOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mark-paid failed');
    } finally {
      setMarkingPaid(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/refresh`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onUpdated(j.invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  function handleExportCsv() {
    const creators = invoiceCreatorRows(invoice);
    if (creators.length > 0) {
      // One row per creator, with the invoice identity repeated so the file
      // stands on its own when pulled into a spreadsheet.
      const rows = creators.map((r) => ({
        invoice_number: invoice.invoice_number,
        brand: invoice.brand,
        period_month: invoice.period_month,
        ...r,
      }));
      downloadCsv(`${invoice.invoice_number}_creators.csv`, rows);
    } else {
      downloadCsv(`${invoice.invoice_number}.csv`, invoiceSummaryRows(invoice));
    }
  }

  async function handleExportXlsx() {
    await downloadXlsx(`${invoice.invoice_number}.xlsx`, [
      { name: 'Summary', rows: invoiceSummaryRows(invoice), columns: ['field', 'value'] },
      { name: 'Creators', rows: invoiceCreatorRows(invoice), columns: ['creator', 'gmv', 'rate_pct', 'commission'] },
    ]);
  }

  async function handleDelete() {
    if (!confirm(`Delete invoice ${invoice.invoice_number}? This can't be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onDeleted(invoice.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setSaving(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose} closeOnBackdropClick={false}>
    <div className="absolute inset-0 flex">
      <button aria-label="Close" className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="w-full max-w-lg bg-card shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Invoice</p>
            <h2 className="text-lg font-extrabold text-[var(--foreground)] font-mono truncate">{invoice.invoice_number}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{invoice.brand} · {fmtPeriod(invoice.period_month)}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Status bar with actions */}
        <div className="px-6 py-4 border-b border-border bg-muted/40 flex items-center gap-2 flex-wrap">
          <StatusPill status={invoice.status} />
          <div className="text-[11px] text-muted-foreground ml-auto">
            {invoice.status === 'pending' && <>Generated {formatDate(invoice.generated_at)}</>}
            {invoice.status === 'sent' && invoice.sent_at && <>Sent {formatDate(invoice.sent_at)}</>}
            {invoice.status === 'paid' && invoice.paid_at && <>Paid {formatDate(invoice.paid_at)}</>}
            {invoice.status === 'void' && <>Voided</>}
          </div>
          <div className="basis-full" />
          {(invoice.status === 'pending' || invoice.status === 'sent') && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSend}
              disabled={sending}
              title="Copy the invoice link and mark the invoice sent"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {sending ? 'Sending…' : 'Send'}
            </Button>
          )}
          {invoice.status === 'sent' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setMarkPaidOpen(true)}
              disabled={statusUpdating}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark as Paid
            </Button>
          )}
          {(invoice.status === 'sent' || invoice.status === 'paid' || invoice.status === 'void') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatus('pending')}
              disabled={statusUpdating}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {invoice.status === 'void' ? 'Reopen' : 'Revert'}
            </Button>
          )}
          {(invoice.status === 'pending' || invoice.status === 'sent') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(`Void invoice ${invoice.invoice_number}? It stays on file but won't count toward outstanding.`)) {
                  handleStatus('void');
                }
              }}
              disabled={statusUpdating}
              className="text-[var(--pulse-neg)] border-[var(--pulse-neg)]/25 hover:bg-[var(--pulse-neg-bg)]"
            >
              <Ban className="h-3.5 w-3.5" />
              Void
            </Button>
          )}
          {invoice.status === 'pending' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Re-pull line items and creator breakdown from current earnings"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              {refreshing ? 'Refreshing…' : 'Refresh from Earnings'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleEmail}
            disabled={emailing || invoice.status === 'void'}
            title={invoice.bill_to_email ? `Email this invoice to ${invoice.bill_to_email}` : 'Set Bill-To Email to enable'}
          >
            {emailing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            {emailing ? 'Sending…' : 'Email it'}
          </Button>
          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            title="Export this invoice (creator breakdown) as CSV"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportXlsx}
            title="Export this invoice (summary + creator breakdown) as Excel"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </Button>
        </div>

        {/* Form body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
          {/* Lifecycle timeline — created → sent → viewed → nudged → paid */}
          <Section title="Timeline">
            <InvoiceTimeline invoice={invoice} />
          </Section>

          {/* GMV summary (read-only) */}
          <Section title="GMV Snapshot">
            <div className="grid grid-cols-3 gap-2">
              <ReadOnlyStat label="Affiliate" value={formatCurrency(Number(invoice.affiliate_gmv))} />
              <ReadOnlyStat label="Marketing" value={formatCurrency(Number(invoice.marketing_gmv))} />
              <ReadOnlyStat label="Total GMV" value={formatCurrency(Number(invoice.total_gmv))} highlight />
            </div>
            {Array.isArray(invoice.creator_breakdown) && (
              <div className={cn(
                'mt-2 rounded-xl px-3 py-2 flex items-center gap-2 text-xs',
                invoice.creator_breakdown.length > 0
                  ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-500'
                  : 'bg-amber-500/10 border border-amber-500/25 text-amber-500',
              )}>
                <Users className="h-3.5 w-3.5 flex-shrink-0" />
                {invoice.creator_breakdown.length > 0 ? (
                  <span><span className="font-bold">{invoice.creator_breakdown.length}</span> creator{invoice.creator_breakdown.length === 1 ? '' : 's'} included in PDF breakdown</span>
                ) : (
                  <span>Creator breakdown is empty. Click <span className="font-bold">Refresh from Earnings</span> above to populate it.</span>
                )}
              </div>
            )}
          </Section>

          {/* Send confirmation (link copied + status stamped) */}
          {sendNotice && (
            <div className="rounded-xl px-3 py-2.5 text-xs flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="font-bold flex-1 min-w-0">{sendNotice}</p>
            </div>
          )}

          {/* Email status notice (success or config-not-set) */}
          {emailNotice && (
            <div className={cn(
              'rounded-xl px-3 py-2.5 text-xs flex items-start gap-2',
              emailNotice.kind === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500'
                : 'bg-amber-500/10 border border-amber-500/20 text-foreground',
            )}>
              {emailNotice.kind === 'success'
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                : <Mail className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <p className="font-bold">{emailNotice.message}</p>
                {emailNotice.hint && <p className="mt-0.5 opacity-80">{emailNotice.hint}</p>}
              </div>
            </div>
          )}

          {/* Share link */}
          <Section title="Share Link">
            {shareUrl ? (
              <div className="space-y-2">
                <div className="flex items-stretch gap-2 rounded-xl border border-border bg-muted/50 overflow-hidden">
                  <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-3 self-center" />
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 min-w-0 bg-transparent text-xs text-[var(--foreground)] font-mono py-2 px-1 focus:outline-none"
                  />
                  <button
                    onClick={handleCopy}
                    className={cn(
                      'inline-flex items-center gap-1 px-3 text-xs font-semibold transition-colors flex-shrink-0',
                      copied ? 'bg-emerald-500 text-white' : 'bg-card text-foreground hover:bg-muted border-l border-border',
                    )}
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  {/* ?preview=1 keeps the operator's own opens from stamping
                      viewed_at — the copied link (no param) is what the
                      client gets. */}
                  <a
                    href={`${shareUrl}?preview=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-3 bg-card hover:bg-muted border-l border-border text-muted-foreground transition-colors flex-shrink-0"
                    title="Open share view (preview - doesn't count as viewed)"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Anyone with this link can view (read-only) and download the PDF without logging in.
                </p>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                disabled={sharing}
                className="w-full"
              >
                {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                {sharing ? 'Generating link…' : 'Generate share link'}
              </Button>
            )}
          </Section>

          {/* Personal note on the public invoice page */}
          <Section title="Note on the invoice">
            <Field
              label="Note"
              hint={`Shows as "A note from ${invoice.bill_from_name?.trim().split(/\s+/)[0] || 'your account lead'}" on the invoice page`}
            >
              <textarea
                value={draft.share_note}
                maxLength={500}
                onChange={(e) => setDraft({ ...draft, share_note: e.target.value })}
                placeholder="One human line about the month, e.g. what drove the commission."
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-border text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-colors resize-y"
              />
            </Field>
            <p className="text-[11px] text-muted-foreground text-right">{draft.share_note.length}/500</p>
          </Section>

          {/* Line items (editable) */}
          <Section title="Line Items">
            <Field label="Commission" prefix="$">
              <NumberInput value={draft.commission} step={10} onChange={(v) => setDraft({ ...draft, commission: v })} />
            </Field>
            <Field label="Retainer" prefix="$">
              <NumberInput value={draft.retainer} step={100} onChange={(v) => setDraft({ ...draft, retainer: v })} />
            </Field>
            <Field label="Product Retainer" prefix="$">
              <NumberInput value={draft.product_retainer} step={100} onChange={(v) => setDraft({ ...draft, product_retainer: v })} />
            </Field>
            <Field label="Launch Fee" prefix="$">
              <NumberInput value={draft.launch_fee} step={100} onChange={(v) => setDraft({ ...draft, launch_fee: v })} />
            </Field>
            <div className="rounded-xl bg-primary/5 border border-primary/15 px-4 py-3 flex items-center justify-between mt-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total</span>
              <span className="text-xl font-extrabold text-[var(--primary)] tabular-nums">{formatCurrency(computedTotal)}</span>
            </div>
            {lineItemsEdited && (
              <p className="text-[11px] text-muted-foreground">
                Final total is recomputed for the brand&apos;s compensation model on save.
              </p>
            )}
          </Section>

          {/* Payment received detail (only after paid) */}
          {invoice.status === 'paid' && (
            <Section title="Payment Received">
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Method</span>
                  <span className="text-sm font-semibold text-[var(--foreground)]">{labelMethod(invoice.payment_method)}</span>
                </div>
                {invoice.payment_reference && (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Reference</span>
                    <span className="text-xs font-mono text-[var(--foreground)] truncate">{invoice.payment_reference}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Amount Received</span>
                  <span className="text-base font-extrabold tabular-nums text-emerald-500">
                    {formatCurrency(Number(invoice.amount_received ?? invoice.total_amount))}
                  </span>
                </div>
                {invoice.amount_received !== undefined && invoice.amount_received !== null &&
                  Math.abs(Number(invoice.amount_received) - Number(invoice.total_amount)) > 0.01 && (
                    <div className="flex items-baseline justify-between text-[11px] text-amber-500 border-t border-emerald-500/25 pt-2">
                      <span>{Number(invoice.amount_received) < Number(invoice.total_amount) ? 'Short' : 'Over'}</span>
                      <span className="tabular-nums">
                        {formatCurrency(Math.abs(Number(invoice.amount_received) - Number(invoice.total_amount)))}
                        {' vs '}{formatCurrency(Number(invoice.total_amount))} invoiced
                      </span>
                    </div>
                  )}
                {invoice.paid_at && (
                  <div className="flex items-baseline justify-between text-[11px] text-emerald-500/80">
                    <span>Recorded</span>
                    <span>{formatDate(invoice.paid_at)}</span>
                  </div>
                )}
                {invoice.payment_received_notes && (
                  <div className="border-t border-emerald-500/25 pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-1">Notes</p>
                    <p className="text-xs text-foreground whitespace-pre-line leading-relaxed">{invoice.payment_received_notes}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Bill to */}
          <Section title="Bill To">
            <Field label="Recipient Name">
              <TextInput value={draft.bill_to_name} onChange={(v) => setDraft({ ...draft, bill_to_name: v })} placeholder="e.g. Jane Smith, Accounts Payable" />
            </Field>
            <Field label="Email">
              <TextInput type="email" value={draft.bill_to_email} onChange={(v) => setDraft({ ...draft, bill_to_email: v })} placeholder="ap@brand.com" />
            </Field>
            <Field label="Address" hint="Multi-line">
              <TextArea value={draft.bill_to_address} onChange={(v) => setDraft({ ...draft, bill_to_address: v })} placeholder="123 Main St&#10;Atlanta, GA 30303" />
            </Field>
          </Section>

          {/* Payment terms */}
          <Section title="Payment Terms">
            <Field label="Due Date">
              <TextInput type="date" value={draft.due_date} onChange={(v) => setDraft({ ...draft, due_date: v })} />
            </Field>
            <Field label="Payment Instructions" hint="Appears on the PDF">
              <TextArea
                value={draft.payment_instructions}
                onChange={(v) => setDraft({ ...draft, payment_instructions: v })}
                placeholder="Wire to:&#10;  Bank: ...&#10;  Routing #: ...&#10;  Account #: ..."
              />
            </Field>
            <Field label="Notes" hint="Optional · appears on the PDF below payment instructions">
              <TextArea value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} placeholder="e.g. Net 30, internal PO #, thanks message" />
            </Field>
          </Section>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3 bg-muted/40">
          {invoice.status === 'pending' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={saving}
              className="text-[var(--pulse-neg)] hover:bg-[var(--pulse-neg-bg)] hover:text-[var(--pulse-neg)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="md" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>

      {/* Mark-paid modal */}
      <MarkPaidModal
        open={markPaidOpen}
        invoiceNumber={invoice.invoice_number}
        totalAmount={Number(invoice.total_amount)}
        defaultAmount={invoice.amount_received !== undefined && invoice.amount_received !== null ? Number(invoice.amount_received) : undefined}
        defaultMethod={invoice.payment_method ?? null}
        defaultReference={invoice.payment_reference ?? null}
        defaultNotes={invoice.payment_received_notes ?? null}
        saving={markingPaid}
        onClose={() => setMarkPaidOpen(false)}
        onConfirm={handleMarkPaid}
      />
    </div>
    </ModalOverlay>
  );
}

function labelMethod(m: string | null | undefined): string {
  switch (m) {
    case 'wire':   return 'Wire Transfer';
    case 'ach':    return 'ACH';
    case 'check':  return 'Check';
    case 'zelle':  return 'Zelle';
    case 'paypal': return 'PayPal';
    case 'stripe': return 'Stripe';
    case 'other':  return 'Other';
    default:       return m ? m.charAt(0).toUpperCase() + m.slice(1) : '—';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Key/value summary of one invoice — used for the CSV fallback and the Excel "Summary" tab. */
function invoiceSummaryRows(inv: Invoice): Array<{ field: string; value: string | number }> {
  const total =
    Number(inv.total_amount) ||
    Number(inv.commission) + Number(inv.retainer) + Number(inv.product_retainer) + Number(inv.launch_fee);
  return [
    { field: 'Invoice Number', value: inv.invoice_number },
    { field: 'Brand', value: inv.brand },
    { field: 'Period', value: fmtPeriod(inv.period_month) },
    { field: 'Status', value: inv.status },
    { field: 'Affiliate GMV', value: Number(inv.affiliate_gmv) },
    { field: 'Marketing GMV', value: Number(inv.marketing_gmv) },
    { field: 'Total GMV', value: Number(inv.total_gmv) },
    { field: 'Commission', value: Number(inv.commission) },
    { field: 'Retainer', value: Number(inv.retainer) },
    { field: 'Product Retainer', value: Number(inv.product_retainer) },
    { field: 'Launch Fee', value: Number(inv.launch_fee) },
    { field: 'Total Amount', value: total },
    { field: 'Bill To Name', value: inv.bill_to_name ?? '' },
    { field: 'Bill To Email', value: inv.bill_to_email ?? '' },
    { field: 'Due Date', value: inv.due_date ?? '' },
    { field: 'Generated', value: inv.generated_at ?? '' },
    { field: 'Sent', value: inv.sent_at ?? '' },
    { field: 'Paid', value: inv.paid_at ?? '' },
  ];
}

/** Per-creator line items for one invoice — empty array if the breakdown isn't populated. */
function invoiceCreatorRows(inv: Invoice): Array<{ creator: string; gmv: number; rate_pct: number; commission: number }> {
  return (Array.isArray(inv.creator_breakdown) ? inv.creator_breakdown : []).map((c) => ({
    creator: c.name,
    gmv: Number(c.gmv),
    rate_pct: Number(c.rate),
    commission: Number(c.commission),
  }));
}

/** "Jul 24, 9:14 AM" — timeline entries carry time-of-day, dates elsewhere don't. */
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function TimelineRow({ color, label, detail }: { color: string; label: string; detail: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[11.5px] text-muted-foreground">
      <span className="h-[7px] w-[7px] flex-shrink-0 self-center rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className="font-bold text-foreground">{label}</span>
      <span>{detail}</span>
    </div>
  );
}

/** Compact lifecycle read: created → sent → viewed → nudged xN → paid. */
function InvoiceTimeline({ invoice }: { invoice: Invoice }) {
  const nudges = Number(invoice.nudge_count ?? 0);
  const rows: { color: string; label: string; detail: string }[] = [
    { color: 'var(--primary)', label: 'Created', detail: fmtDateTime(invoice.generated_at) },
  ];
  if (invoice.sent_at) rows.push({ color: 'var(--primary)', label: 'Sent', detail: fmtDateTime(invoice.sent_at) });
  if (invoice.viewed_at) rows.push({ color: 'var(--pulse-pos)', label: 'Viewed', detail: fmtDateTime(invoice.viewed_at) });
  if (nudges > 0 && invoice.last_nudged_at) {
    rows.push({
      color: 'var(--pulse-warn)',
      label: nudges > 1 ? `Nudged x${nudges}` : 'Nudged',
      detail: `${nudges > 1 ? 'last ' : ''}${fmtDateTime(invoice.last_nudged_at)}`,
    });
  }
  if (invoice.paid_at) rows.push({ color: 'var(--pulse-pos)', label: 'Paid', detail: fmtDateTime(invoice.paid_at) });

  return (
    <div className="space-y-1.5 rounded-xl border border-border bg-muted/40 px-4 py-3">
      {rows.map((r) => (
        <TimelineRow key={`${r.label}-${r.detail}`} color={r.color} label={r.label} detail={r.detail} />
      ))}
      {rows.length === 1 && (
        <div className="flex items-baseline gap-2 text-[11.5px] text-muted-foreground/60">
          <span className="h-[7px] w-[7px] flex-shrink-0 self-center rounded-full bg-border" aria-hidden="true" />
          <span>sent · viewed · paid appear here as they happen</span>
        </div>
      )}
    </div>
  );
}

function fmtPeriod(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    pending: { variant: 'warning',  label: 'Pending' },
    sent:    { variant: 'accent',   label: 'Sent' },
    paid:    { variant: 'positive', label: 'Paid' },
    void:    { variant: 'neutral',  label: 'Void' },
  };
  const c = config[status] ?? { variant: 'neutral' as const, label: status };
  return (
    <Badge variant={c.variant} className="uppercase tracking-wider">
      {c.label}
    </Badge>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, hint, prefix, children }: {
  label: string;
  hint?: string;
  prefix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">{prefix}</span>}
        <div className={cn(prefix && '[&_input]:pl-7')}>{children}</div>
      </div>
    </label>
  );
}

function NumberInput({ value, step, onChange }: { value: number; step: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return (
    <input
      type="number"
      step={step}
      min={0}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n) && n >= 0) onChange(n);
      }}
      className="w-full px-3 py-2 rounded-xl border border-border text-sm text-[var(--foreground)] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-colors"
    />
  );
}

function TextInput({ value, placeholder, type = 'text', onChange }: {
  value: string; placeholder?: string; type?: 'text' | 'email' | 'date'; onChange: (v: string) => void;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl border border-border text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-colors"
    />
  );
}

function TextArea({ value, placeholder, onChange }: { value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full px-3 py-2 rounded-xl border border-border text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-colors resize-y"
    />
  );
}

function ReadOnlyStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      'rounded-xl border p-3',
      highlight ? 'border-[var(--primary)]/20 bg-primary/5' : 'border-border bg-muted/40',
    )}>
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums mt-0.5', highlight ? 'text-[var(--primary)]' : 'text-[var(--foreground)]')}>{value}</p>
    </div>
  );
}
