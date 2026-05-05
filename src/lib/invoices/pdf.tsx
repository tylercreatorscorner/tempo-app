/**
 * Invoice PDF rendering.
 *
 * BILL FROM info — update the BILL_FROM constant below to your business
 * details. Move to a tenant_settings table when going multi-tenant SaaS.
 */
import { Document, Page, Text, View, StyleSheet, Font, Svg, Circle, Polygon, LinearGradient, Stop, Defs, renderToBuffer } from '@react-pdf/renderer';
import path from 'node:path';
import React from 'react';

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
  footer: {
    position: 'absolute',
    bottom: 28,
    left: PAGE_PADDING_X,
    right: PAGE_PADDING_X,
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
  const lineItems: { title: string; sub?: string; amount: number }[] = [];
  if (data.commission > 0) {
    const subParts: string[] = [];
    if (data.affiliateGmv > 0) subParts.push(`Affiliate GMV ${fmtCurrencyCompact(data.affiliateGmv)}`);
    if (data.marketingGmv > 0) subParts.push(`Marketing GMV ${fmtCurrencyCompact(data.marketingGmv)}`);
    lineItems.push({
      title: 'Creator Commission',
      sub: subParts.join('  ·  '),
      amount: data.commission,
    });
  }
  if (data.retainer > 0)        lineItems.push({ title: 'Monthly Retainer', amount: data.retainer });
  if (data.productRetainer > 0) lineItems.push({ title: 'Product Retainer', amount: data.productRetainer });
  if (data.launchFee > 0)       lineItems.push({ title: 'Launch Fee', amount: data.launchFee });

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

        {/* Grand total panel */}
        <View style={s.grandWrap} wrap={false}>
          <View>
            <Text style={s.grandLabel}>Total Due</Text>
            <Text style={s.grandHint}>Payable on or before {fmtDate(data.dueDate)}</Text>
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
