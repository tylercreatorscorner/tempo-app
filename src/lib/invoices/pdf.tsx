/**
 * Invoice PDF rendering.
 *
 * BILL FROM info — update the BILL_FROM constant below to your business
 * details. Move to a tenant_settings table when going multi-tenant SaaS.
 */
import { Document, Page, Text, View, StyleSheet, Font, Svg, Circle, Polygon, LinearGradient, Stop, Defs, renderToBuffer } from '@react-pdf/renderer';
import path from 'node:path';
import React from 'react';
import { buildDisplayLineItems } from '@/lib/finance/invoice-math';

// ── Font registration (Inter, matching the dashboard) ────────────────
// Resolved against node_modules so it works in dev + serverless production.
function fontPath(weight: '400Regular' | '600SemiBold' | '700Bold' | '800ExtraBold') {
  return path.join(process.cwd(), 'node_modules', '@expo-google-fonts', 'inter', weight, `Inter_${weight}.ttf`);
}

Font.register({
  family: 'Inter',
  fonts: [
    { src: fontPath('400Regular'),    fontWeight: 400 },
    { src: fontPath('600SemiBold'),   fontWeight: 600 },
    { src: fontPath('700Bold'),       fontWeight: 700 },
    { src: fontPath('800ExtraBold'),  fontWeight: 800 },
  ],
});

// Disable hyphenation for English text — invoice copy looks weird with hyphens.
Font.registerHyphenationCallback((word) => [word]);

// ── Bill-from fallback (used only when an invoice was created before the
// team_members migration and has no bill_from snapshot). New invoices snapshot
// bill-from at creation from team_members.
const FALLBACK_BILL_FROM = {
  business: 'Creators Corner',
  address: '',
};

// ── Brand palette ────────────────────────────────────────────────────
const COLORS = {
  ink: '#1A1B3A',
  inkSoft: '#2D2E5C',
  pink: '#FF4D8D',
  pinkSoft: '#FFE6F0',
  pinkDeep: '#E91E8C',
  purple: '#7C5CFC',
  muted: '#6B7280',
  mutedSoft: '#9CA3AF',
  border: '#E5E7EB',
  borderSoft: '#F3F4F6',
  faintBg: '#F8F9FC',
  white: '#FFFFFF',
  emerald: '#10B981',
};

// ── Types ────────────────────────────────────────────────────────────
export interface InvoicePdfCreator {
  name: string;
  gmv: number;
  rate: number;
  commission: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  brandSlug: string;
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
  /** Who's issuing the invoice — Tyler, Vic, etc. Snapshotted at invoice
   *  creation time from team_members so the PDF matches what was sent. */
  billFrom?: {
    name: string | null;
    email: string | null;
    address: string | null;
  };
  creators: InvoicePdfCreator[];
}

/** The invoices-table columns the PDF consumes. Routes select('*'), so the
 *  raw row satisfies this structurally. */
export interface InvoiceDbRow {
  invoice_number: string;
  brand: string;
  period_month: string;
  generated_at: string;
  due_date: string | null;
  status: string;
  affiliate_gmv: number | string | null;
  marketing_gmv: number | string | null;
  total_gmv: number | string | null;
  commission: number | string | null;
  retainer: number | string | null;
  product_retainer: number | string | null;
  launch_fee: number | string | null;
  total_amount: number | string | null;
  notes: string | null;
  payment_instructions: string | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  bill_from_name: string | null;
  bill_from_email: string | null;
  bill_from_address: string | null;
  creator_breakdown: unknown;
}

/**
 * Map a DB invoices row to the PDF's data shape. The ONE mapper shared by the
 * admin download, the public share download, AND the email attachment — the
 * email route used to hand-roll this and dropped billFrom, so emailed PDFs
 * fell back to the hardcoded business name while downloads showed the payee.
 */
export function invoiceRowToPdfData(invoice: InvoiceDbRow, brandName: string): InvoicePdfData {
  return {
    invoiceNumber: invoice.invoice_number,
    brandSlug: invoice.brand,
    brandName,
    periodMonth: invoice.period_month,
    generatedAt: invoice.generated_at,
    dueDate: invoice.due_date,
    status: invoice.status,
    affiliateGmv: Number(invoice.affiliate_gmv ?? 0),
    marketingGmv: Number(invoice.marketing_gmv ?? 0),
    totalGmv: Number(invoice.total_gmv ?? 0),
    commission: Number(invoice.commission ?? 0),
    retainer: Number(invoice.retainer ?? 0),
    productRetainer: Number(invoice.product_retainer ?? 0),
    launchFee: Number(invoice.launch_fee ?? 0),
    totalAmount: Number(invoice.total_amount ?? 0),
    notes: invoice.notes,
    paymentInstructions: invoice.payment_instructions,
    billTo: {
      name: invoice.bill_to_name,
      email: invoice.bill_to_email,
      address: invoice.bill_to_address,
    },
    billFrom: {
      name: invoice.bill_from_name,
      email: invoice.bill_from_email,
      address: invoice.bill_from_address,
    },
    creators: Array.isArray(invoice.creator_breakdown)
      ? invoice.creator_breakdown.map((c: { name?: string; gmv?: number; rate?: number; commission?: number }) => ({
          name: String(c.name ?? ''),
          gmv: Number(c.gmv ?? 0),
          rate: Number(c.rate ?? 0),
          commission: Number(c.commission ?? 0),
        }))
      : [],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────
function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}
function fmtCurrencyCompact(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function fmtPeriod(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ── Styles ───────────────────────────────────────────────────────────
const PAGE_PADDING_X = 56;
const PAGE_PADDING_Y = 56;

const s = StyleSheet.create({
  // Uniform page padding so wrapped content (creator table → page 2)
  // never butts against the top edge. Band sits inside this padding.
  page: {
    paddingTop: PAGE_PADDING_Y,
    paddingBottom: PAGE_PADDING_Y,
    paddingHorizontal: PAGE_PADDING_X,
    fontSize: 10,
    color: COLORS.ink,
    fontFamily: 'Inter',
    backgroundColor: COLORS.white,
    lineHeight: 1.4,
  },

  // Header band (page 1 only) — full-width via negative margins to
  // bleed past the page padding.
  band: {
    backgroundColor: COLORS.ink,
    marginTop: -PAGE_PADDING_Y,
    marginHorizontal: -PAGE_PADDING_X,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: PAGE_PADDING_X,
    color: COLORS.white,
    marginBottom: 32,
  },
  bandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Logo: "Temp" word + circle with play triangle (gradient fill)
  logoWrap: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  logoText: { fontSize: 26, fontWeight: 800, color: COLORS.white, letterSpacing: -0.6, lineHeight: 1 },

  // Right side of band
  bandRight: { alignItems: 'flex-end' },
  invoiceLabel: { fontSize: 9, color: '#A0A4D8', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 },
  invoiceNumber: { fontSize: 18, fontWeight: 700, color: COLORS.white, letterSpacing: -0.3 },

  // Meta row (below band)
  metaGrid: { flexDirection: 'row', gap: 32, marginBottom: 28 },
  metaCell: { flex: 1 },
  metaLabel: { fontSize: 8, color: COLORS.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4, fontWeight: 700 },
  metaValue: { fontSize: 11, color: COLORS.ink, fontWeight: 700 },

  // Bill-to / from
  partiesRow: { flexDirection: 'row', gap: 16, marginBottom: 32 },
  partyBlock: { flex: 1, padding: 14, backgroundColor: COLORS.faintBg, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: COLORS.pink },
  partyLabel: { fontSize: 8, color: COLORS.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 },
  partyName: { fontSize: 12, fontWeight: 700, color: COLORS.ink, marginBottom: 4 },
  partyLine: { fontSize: 9, color: COLORS.inkSoft, marginBottom: 1, lineHeight: 1.45 },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: COLORS.ink, letterSpacing: 0.2 },
  sectionSubtitle: { fontSize: 9, color: COLORS.muted, fontWeight: 400 },

  // Line items table
  lineTable: { borderRadius: 8, overflow: 'hidden', marginBottom: 28, borderWidth: 1, borderColor: COLORS.borderSoft },
  lineHeader: { flexDirection: 'row', backgroundColor: COLORS.ink, paddingVertical: 10, paddingHorizontal: 14 },
  lineHeaderCell: { fontSize: 8, color: COLORS.white, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700 },
  lineRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: COLORS.borderSoft, backgroundColor: COLORS.white },
  lineRowAlt: { backgroundColor: COLORS.faintBg },
  cellGrow: { flex: 3 },
  cellAmount: { flex: 1, textAlign: 'right' },
  itemTitle: { fontSize: 10, fontWeight: 700, color: COLORS.ink, marginBottom: 2 },
  itemSub: { fontSize: 8, color: COLORS.muted, lineHeight: 1.35 },
  amountText: { fontSize: 11, fontWeight: 700, color: COLORS.ink },

  // Creator breakdown table
  creatorTable: { borderRadius: 8, overflow: 'hidden', marginBottom: 24, borderWidth: 1, borderColor: COLORS.borderSoft },
  creatorHeader: { flexDirection: 'row', backgroundColor: COLORS.faintBg, paddingVertical: 8, paddingHorizontal: 12 },
  creatorHeaderCell: { fontSize: 7.5, color: COLORS.muted, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700 },
  creatorRow: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: COLORS.borderSoft },
  creatorRowAlt: { backgroundColor: '#FAFBFD' },
  creatorName: { flex: 3, fontSize: 9, color: COLORS.ink, fontWeight: 600 },
  creatorGmv: { flex: 2, fontSize: 9, color: COLORS.inkSoft, textAlign: 'right' },
  creatorRate: { flex: 1, fontSize: 9, color: COLORS.muted, textAlign: 'right' },
  creatorComm: { flex: 2, fontSize: 9, color: COLORS.ink, textAlign: 'right', fontWeight: 700 },
  creatorFooter: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 2, borderTopColor: COLORS.ink, backgroundColor: COLORS.faintBg },
  creatorFooterLabel: { flex: 6, fontSize: 9, color: COLORS.ink, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 },
  creatorFooterValue: { flex: 2, fontSize: 10, color: COLORS.ink, textAlign: 'right', fontWeight: 700 },

  // Totals
  totalsStack: { marginLeft: 'auto', width: '55%', marginBottom: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  totalLabel: { fontSize: 10, color: COLORS.muted },
  totalValue: { fontSize: 11, color: COLORS.ink, fontWeight: 600 },
  grandWrap: {
    backgroundColor: COLORS.ink,
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  grandLabel: { fontSize: 9, color: '#A0A4D8', letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 },
  grandHint: { fontSize: 8, color: '#A0A4D8' },
  grandValue: { fontSize: 22, fontWeight: 700, color: COLORS.white, letterSpacing: -0.5 },

  // Payment instructions block — practical / informational tone
  payBlock: {
    padding: 16,
    backgroundColor: COLORS.faintBg,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.ink,
  },
  payLabel: { fontSize: 8, color: COLORS.ink, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 },
  payText: { fontSize: 10, color: COLORS.inkSoft, lineHeight: 1.55 },

  // Notes — softer/optional tone
  notesBlock: { padding: 16, backgroundColor: COLORS.pinkSoft, borderRadius: 8, marginBottom: 24, borderLeftWidth: 3, borderLeftColor: COLORS.pink },
  notesLabel: { fontSize: 8, color: COLORS.pinkDeep, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 },
  notesText: { fontSize: 10, color: COLORS.ink, lineHeight: 1.55 },

  // Thank-you line
  thanksLine: {
    fontSize: 10,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
    fontWeight: 500,
    letterSpacing: 0.2,
  },

  // Footer
  //
  // ⚠️ DO NOT restore `position: 'absolute'` here. This element is also
  // `fixed`, and the combination of fixed + absolute is what crashed every
  // multi-page invoice PDF:
  //
  //     Error: unsupported number: -8.264141345021879e+21
  //
  // thrown from clipBorderTop deep inside @react-pdf, which reads like a data
  // problem and is not one. Bisected on TEMPO-2026-07-001 (catakor, 235
  // creators): 196 creator rows rendered, 197 failed, and the same constant
  // garbage coordinate appeared every time. Removing EITHER `fixed` or
  // `position: 'absolute'` fixes it; removing this footer's border does not,
  // and neither does dropping `totalPages` from the render callback.
  //
  // `fixed` is the one worth keeping, so a five-page invoice carries its
  // number and page count on every sheet. marginTop:'auto' pins it to the
  // bottom of the page flow instead.
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
  footerLeft: { fontSize: 8, color: COLORS.muted, fontWeight: 500 },
  footerRight: { fontSize: 8, color: COLORS.mutedSoft },
});

// ── Tempo Logo Component (matches the dashboard) ──────────────────────
function TempoLogoMark() {
  return (
    <View style={s.logoWrap}>
      <Text style={s.logoText}>Temp</Text>
      <Svg width={22} height={22} viewBox="0 0 40 40">
        <Defs>
          <LinearGradient id="tempoGrad" x1="0" y1="0" x2="40" y2="40">
            <Stop offset="0%" stopColor={COLORS.pink} />
            <Stop offset="100%" stopColor={COLORS.purple} />
          </LinearGradient>
        </Defs>
        <Circle cx="20" cy="20" r="20" fill="url(#tempoGrad)" />
        <Polygon points="16,12 16,28 28,20" fill="white" fillOpacity={0.95} />
      </Svg>
    </View>
  );
}

// ── Component ────────────────────────────────────────────────────────
function InvoicePdfDoc({ data }: { data: InvoicePdfData }) {
  // Which lines render (and their order) is the shared invoice math's call —
  // the public share view builds from the same function, so PDF and web can
  // never disagree about which rows an invoice has.
  const lineItems = buildDisplayLineItems(data).map((item) => {
    const subParts: string[] = [];
    if (item.affiliateGmv) subParts.push(`Affiliate GMV ${fmtCurrencyCompact(item.affiliateGmv)}`);
    if (item.marketingGmv) subParts.push(`Marketing GMV ${fmtCurrencyCompact(item.marketingGmv)}`);
    return { title: item.title, sub: subParts.length ? subParts.join('  ·  ') : undefined, amount: item.amount };
  });

  // Coherence check (mirrors share-view): a hand-edited stored total can
  // drift from its line items — surface the signed difference as an explicit
  // Adjustment line so the document always sums.
  const lineSum = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const totalDelta = data.totalAmount - lineSum;
  if (Math.abs(totalDelta) > 1) {
    lineItems.push({
      title: 'Adjustment',
      sub: 'Manually adjusted total - the stored total differs from the line items',
      amount: totalDelta,
    });
  }

  const totalCreatorCommission = data.creators.reduce((sum, c) => sum + c.commission, 0);
  const totalCreatorGmv = data.creators.reduce((sum, c) => sum + c.gmv, 0);

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* Top color band ------------------------------------------------ */}
        <View style={s.band}>
          <View style={s.bandRow}>
            <TempoLogoMark />
            <View style={s.bandRight}>
              <Text style={s.invoiceLabel}>Invoice</Text>
              <Text style={s.invoiceNumber}>{data.invoiceNumber}</Text>
            </View>
          </View>
        </View>

        {/* Meta row */}
        <View style={s.metaGrid}>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Period</Text>
            <Text style={s.metaValue}>{fmtPeriod(data.periodMonth)}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Issued</Text>
            <Text style={s.metaValue}>{fmtDate(data.generatedAt)}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Due Date</Text>
            <Text style={s.metaValue}>{fmtDate(data.dueDate)}</Text>
          </View>
        </View>

        {/* From / Bill To */}
        <View style={s.partiesRow}>
          <View style={s.partyBlock}>
            <Text style={s.partyLabel}>From</Text>
            <Text style={s.partyName}>{data.billFrom?.name || FALLBACK_BILL_FROM.business}</Text>
            {(data.billFrom?.address || FALLBACK_BILL_FROM.address).split('\n').filter(Boolean).map((line, i) => (
              <Text key={i} style={s.partyLine}>{line}</Text>
            ))}
            {data.billFrom?.email && <Text style={s.partyLine}>{data.billFrom.email}</Text>}
          </View>
          <View style={s.partyBlock}>
            <Text style={s.partyLabel}>Billed To</Text>
            <Text style={s.partyName}>{data.brandName}</Text>
            {data.billTo.name && <Text style={s.partyLine}>{data.billTo.name}</Text>}
            {data.billTo.address && data.billTo.address.split('\n').map((line, i) => (
              <Text key={i} style={s.partyLine}>{line}</Text>
            ))}
            {data.billTo.email && <Text style={s.partyLine}>{data.billTo.email}</Text>}
          </View>
        </View>

        {/* Line items ----------------------------------------------- */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Line Items</Text>
          <Text style={s.sectionSubtitle}>{lineItems.length} item{lineItems.length === 1 ? '' : 's'}</Text>
        </View>
        <View style={s.lineTable}>
          <View style={s.lineHeader}>
            <Text style={[s.lineHeaderCell, s.cellGrow]}>Description</Text>
            <Text style={[s.lineHeaderCell, s.cellAmount]}>Amount</Text>
          </View>
          {lineItems.map((item, i) => (
            <View key={i} style={i % 2 === 1 ? [s.lineRow, s.lineRowAlt] : s.lineRow}>
              <View style={s.cellGrow}>
                <Text style={s.itemTitle}>{item.title}</Text>
                {item.sub && <Text style={s.itemSub}>{item.sub}</Text>}
              </View>
              <View style={s.cellAmount}>
                <Text style={s.amountText}>{fmtCurrency(item.amount)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Creator breakdown ---------------------------------------- */}
        {data.creators.length > 0 && (
          <View wrap={true}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Creator Breakdown</Text>
              <Text style={s.sectionSubtitle}>
                {data.creators.length} creator{data.creators.length === 1 ? '' : 's'} · {fmtCurrencyCompact(totalCreatorGmv)} affiliate GMV
              </Text>
            </View>
            <View style={s.creatorTable}>
              <View style={s.creatorHeader} fixed>
                <Text style={[s.creatorHeaderCell, { flex: 3 }]}>Creator</Text>
                <Text style={[s.creatorHeaderCell, { flex: 2, textAlign: 'right' }]}>GMV</Text>
                <Text style={[s.creatorHeaderCell, { flex: 1, textAlign: 'right' }]}>Rate</Text>
                <Text style={[s.creatorHeaderCell, { flex: 2, textAlign: 'right' }]}>Commission</Text>
              </View>
              {data.creators.map((c, i) => (
                <View key={`${c.name}-${i}`} style={i % 2 === 1 ? [s.creatorRow, s.creatorRowAlt] : s.creatorRow} wrap={false}>
                  <Text style={s.creatorName}>{c.name.startsWith('@') ? c.name : `@${c.name}`}</Text>
                  <Text style={s.creatorGmv}>{fmtCurrency(c.gmv)}</Text>
                  <Text style={s.creatorRate}>{c.rate.toFixed(2)}%</Text>
                  <Text style={s.creatorComm}>{fmtCurrency(c.commission)}</Text>
                </View>
              ))}
              <View style={s.creatorFooter} wrap={false}>
                <Text style={s.creatorFooterLabel}>Subtotal — Creator Commission</Text>
                <Text style={s.creatorFooterValue}>{fmtCurrency(totalCreatorCommission)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Totals --------------------------------------------------- */}
        <View style={s.totalsStack}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{fmtCurrency(data.totalAmount)}</Text>
          </View>
        </View>

        {/* Grand total panel — void invoices must not carry due-language
            (mirrors the share view's "Voided - no payment due"). */}
        <View style={s.grandWrap} wrap={false}>
          <View>
            <Text style={s.grandLabel}>{data.status === 'void' ? 'Voided' : 'Total Due'}</Text>
            <Text style={s.grandHint}>
              {data.status === 'void' ? 'No payment due' : `Payable on or before ${fmtDate(data.dueDate)}`}
            </Text>
          </View>
          <Text style={s.grandValue}>{fmtCurrency(data.totalAmount)}</Text>
        </View>

        {/* Payment instructions */}
        {data.paymentInstructions && (
          <View style={s.payBlock} wrap={false}>
            <Text style={s.payLabel}>Payment Instructions</Text>
            <Text style={s.payText}>{data.paymentInstructions}</Text>
          </View>
        )}

        {/* Notes */}
        {data.notes && (
          <View style={s.notesBlock} wrap={false}>
            <Text style={s.notesLabel}>Notes</Text>
            <Text style={s.notesText}>{data.notes}</Text>
          </View>
        )}

        {/* Thank-you line */}
        <Text style={s.thanksLine}>Thank you for your business.</Text>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerLeft}>{data.billFrom?.name || FALLBACK_BILL_FROM.business}</Text>
          <Text style={s.footerRight} render={({ pageNumber, totalPages }) => `${data.invoiceNumber}  ·  Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const buf = await renderToBuffer(<InvoicePdfDoc data={data} />);
  return buf;
}
