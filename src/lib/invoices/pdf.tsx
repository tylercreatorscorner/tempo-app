/**
 * Invoice PDF rendering.
 *
 * Rebuilt 2026-08-10. Two things drove the rebuild:
 *
 *   1. The old document was on the PRE-PULSE palette (#1A1B3A navy, #FF4D8D
 *      pink), a brand generation behind the app and the logo.
 *   2. It was enormous. The creator breakdown rendered every creator as a table
 *      row, and with an average of 104 creators per invoice — 24 of 30 carry
 *      more than 50 — a one-line bill routinely ran to a dozen pages. LeeFar's
 *      July invoice was 12 pages to charge $3,532.47.
 *
 * It is now ONE page. Top contributors are named, the remainder is aggregated
 * into a single honest line that foots exactly to the total, and the full
 * creator-by-creator detail lives on the share link (invoices.public_token),
 * which can also serve CSV. Nobody reconciles from 104 printed rows.
 *
 * ⚠️ TWO LAYOUT RULES, both learned from a production outage. Do not undo them:
 *
 *   · NO element may be `fixed` AND `position: 'absolute'` at once. That pair
 *     crashed every multi-page invoice with
 *     "unsupported number: -8.264141345021879e+21" out of clipBorderTop.
 *     Bisected: 196 creator rows rendered, 197 did not.
 *   · NO borders on rows that repeat. A bordered row landing on a page break
 *     produces the same garbage geometry, with borderTop and borderBottom
 *     alike, and wrap={false} does not save it. Use a 1pt View as a rule.
 */
import { Document, Page, Text, View, StyleSheet, Font, Svg, Circle, Rect, LinearGradient, Stop, Defs, renderToBuffer } from '@react-pdf/renderer';
import path from 'node:path';
import React from 'react';
import { buildDisplayLineItems } from '@/lib/finance/invoice-math';

// ── Font registration (Inter, matching the dashboard) ────────────────
// Resolved against node_modules. next.config.ts force-traces these into the
// PDF lambdas via outputFileTracingIncludes — this path is built at runtime so
// Next's tracer cannot see it statically.
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

const FALLBACK_BILL_FROM = {
  business: 'Creators Corner',
  address: '',
};

/**
 * How many creators are named before the rest are aggregated.
 *
 * ⚠️ FIVE, and it is a page-fit constraint, not a taste one. At six the
 * document tipped onto a second page that carried nothing but the footer.
 * The whole point of the rebuild is that an invoice is one page, so if you
 * raise this, re-render a long invoice and check /Count is still 1. The same
 * budget is why the basis note below has to stay a single rendered line.
 */
const NAMED_CONTRIBUTORS = 5;

// ── Pulse palette (matches globals.css and public/logo/tempo-icon.svg) ──
const COLORS = {
  ink:      '#16142E',
  body:     '#3C3A5C',
  muted:    '#75729A',
  hair:     '#E6E3F2',
  wash:     '#F8F7FD',
  primary:  '#4B45FF',
  accent:   '#9A37EF',
  white:    '#FFFFFF',
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
  /** brands_v2.color. Used for the brand chip. Falls back to the Pulse primary. */
  brandColor?: string | null;
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
  /** Public share URL for the full creator breakdown, when the invoice has a token. */
  shareUrl?: string | null;
  billTo: { name: string | null; email: string | null; address: string | null };
  billFrom?: { name: string | null; email: string | null; address: string | null };
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
  public_token?: string | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  bill_from_name: string | null;
  bill_from_email: string | null;
  bill_from_address: string | null;
  creator_breakdown: unknown;
}

/** Optional brand presentation, from brands_v2. */
export interface InvoiceBrandMeta {
  name: string;
  color?: string | null;
}

/**
 * Map a DB invoices row to the PDF's data shape. The ONE mapper shared by the
 * admin download, the public share download, AND the email attachment — the
 * email route used to hand-roll this and dropped billFrom, so emailed PDFs
 * fell back to the hardcoded business name while downloads showed the payee.
 *
 * `brand` accepts either a plain display name (legacy callers) or the richer
 * brands_v2 shape, so adding colour did not have to touch every call site at
 * once.
 */
export function invoiceRowToPdfData(
  invoice: InvoiceDbRow,
  brand: string | InvoiceBrandMeta,
  opts?: { appUrl?: string | null },
): InvoicePdfData {
  const meta: InvoiceBrandMeta = typeof brand === 'string' ? { name: brand } : brand;
  const base = (opts?.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  return {
    invoiceNumber: invoice.invoice_number,
    brandSlug: invoice.brand,
    brandName: meta.name,
    brandColor: meta.color ?? null,
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
    shareUrl: invoice.public_token && base ? `${base}/share/invoice/${invoice.public_token}` : null,
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
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function fmtPeriod(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function initials(name: string) {
  return (name.replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 2) || '?').toUpperCase();
}

// ── Styles ───────────────────────────────────────────────────────────
const PAD_X = 46;
const PAD_Y = 42;

const s = StyleSheet.create({
  page: {
    paddingTop: 30, paddingBottom: 14, paddingHorizontal: PAD_X,
    fontSize: 10, color: COLORS.ink, fontFamily: 'Inter',
    backgroundColor: COLORS.white, lineHeight: 1.4,
  },

  // Masthead
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logoWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  logoText: { fontSize: 20, lineHeight: 1.25, fontWeight: 800, letterSpacing: -0.9, color: COLORS.ink },
  tagline: { fontSize: 8, lineHeight: 1.25, color: COLORS.muted, marginTop: 4 },
  invNoWrap: { alignItems: 'flex-end' },
  invNoLabel: { fontSize: 8, lineHeight: 1.25, color: COLORS.muted, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 600 },
  invNo: { fontSize: 12.5, lineHeight: 1.25, fontWeight: 700, marginTop: 2 },

  // The thesis panel: what the fee bought, beside what is owed.
  //
  // Solid Pulse primary, not the brand gradient. @react-pdf's View has no
  // gradient background — that needs an Svg layer behind the content, and the
  // only way to size one to a flex panel is to hardcode its dimensions in
  // points. A hardcoded box that silently stops matching its container is a
  // worse defect than a flat fill, so this stays solid until there is a reason
  // it is not.
  // ⚠️ EXPLICIT lineHeight on every Text in here, and NO alignItems on the row.
  // The page sets lineHeight 1.4 globally; at 24pt and 30pt @react-pdf laid the
  // following sibling on top of the number, so "208 creators · July 2026"
  // printed straight through "$706,493.86". Stating the line box per size fixes
  // it. If you add a Text here, give it a lineHeight.
  thesis: {
    marginTop: 14, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: COLORS.primary,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  tLabel: { fontSize: 7.5, lineHeight: 1.2, color: COLORS.white, opacity: 0.78, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 },
  tBig: { fontSize: 23, lineHeight: 1.15, color: COLORS.white, fontWeight: 700, marginTop: 5 },
  tSub: { fontSize: 8.5, lineHeight: 1.3, color: COLORS.white, opacity: 0.85, marginTop: 4 },
  tRight: { alignItems: 'flex-end' },
  tAmt: { fontSize: 27, lineHeight: 1.15, color: COLORS.white, fontWeight: 700, marginTop: 5 },

  // Meta
  meta: { flexDirection: 'row', marginTop: 14, gap: 18 },
  metaCell: { flex: 1 },
  k: { fontSize: 7.5, lineHeight: 1.25, color: COLORS.muted, letterSpacing: 0.9, textTransform: 'uppercase', fontWeight: 700 },
  v: { fontSize: 10.5, lineHeight: 1.25, marginTop: 3 },

  rule: { height: 1, backgroundColor: COLORS.hair, marginVertical: 10 },

  // Parties
  parties: { flexDirection: 'row', gap: 18 },
  party: { flex: 1 },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  chip: { width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 8.5, lineHeight: 1.25, color: COLORS.white, fontWeight: 700 },
  partyName: { fontSize: 11.5, lineHeight: 1.25, fontWeight: 700 },
  partyLine: { fontSize: 9.5, lineHeight: 1.25, color: COLORS.body, marginTop: 1 },

  // Line items
  th: { fontSize: 7.5, lineHeight: 1.25, color: COLORS.muted, letterSpacing: 0.9, textTransform: 'uppercase', fontWeight: 700 },
  lineRow: { flexDirection: 'row', paddingVertical: 11, alignItems: 'flex-start' },
  lineRule: { height: 1, backgroundColor: COLORS.hair },
  itemTitle: { fontSize: 11, lineHeight: 1.25, fontWeight: 700 },
  itemSub: { fontSize: 9, lineHeight: 1.25, color: COLORS.muted, marginTop: 2 },
  colDesc: { flex: 3 },
  colNum: { flex: 1, textAlign: 'right' },
  amt: { fontSize: 11, lineHeight: 1.25 },

  // Contributors
  contribRow: { flexDirection: 'row', paddingVertical: 3.5 },
  contribRule: { height: 1, backgroundColor: COLORS.wash },
  restRule: { height: 1, backgroundColor: COLORS.hair, marginTop: 3 },
  contribName: { flex: 3, fontSize: 9.5, lineHeight: 1.25 },
  contribNum: { flex: 1, fontSize: 9.5, lineHeight: 1.25, textAlign: 'right' },
  restText: { flex: 3, fontSize: 9.5, lineHeight: 1.25, color: COLORS.muted },
  restNum: { flex: 1, fontSize: 9.5, lineHeight: 1.25, textAlign: 'right', color: COLORS.muted },
  // paddingBottom is SLACK, not decoration: this block measures one line
  // short, so whatever sits last in it gets overlapped by the section below.
  // The padding absorbs the error instead of the text doing it.
  contribBlock: { marginTop: 12, paddingBottom: 16 },
  verifyWrap: { marginTop: 6, marginBottom: 2 },
  verify: { fontSize: 8.5, lineHeight: 1.25, color: COLORS.muted },

  // Bottom.
  //
  // ⚠️ NOT marginTop:'auto'. That pushes this block to the bottom of the PAGE
  // rather than after the content, and @react-pdf then let it overlap the
  // preceding text — the Subtotal row printed straight through the
  // "Full creator-by-creator breakdown: …" line — while also spilling a blank
  // second page. Plain flow keeps it under the contributors where it belongs.
  // Generous top margin ON PURPOSE. The share URL above wraps to a second
  // line that @react-pdf measures as one, so this block would otherwise be
  // laid on top of it — the URL tail printed straight through the HOW TO PAY
  // box. 22pt clears a full mis-measured line at this size.
  bottom: { marginTop: 14 },
  payRow: { flexDirection: 'row', gap: 18, alignItems: 'flex-end' },
  pay: { flex: 1.35, backgroundColor: COLORS.wash, borderRadius: 8, padding: 10 },
  payText: { fontSize: 9.5, lineHeight: 1.25, color: COLORS.body, marginTop: 4 },
  totals: { flex: 1 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { fontSize: 10.5, lineHeight: 1.25, color: COLORS.body },
  totalValue: { fontSize: 10.5, lineHeight: 1.25 },
  grandRule: { height: 2, backgroundColor: COLORS.ink, marginTop: 6 },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
  grandLabel: { fontSize: 14, lineHeight: 1.25, fontWeight: 700 },
  grandValue: { fontSize: 15, lineHeight: 1.25, fontWeight: 700 },
  grandHint: { fontSize: 8.5, lineHeight: 1.25, color: COLORS.muted, marginTop: 3 },

  notes: { marginTop: 14, backgroundColor: COLORS.wash, borderRadius: 8, padding: 12 },
  notesText: { fontSize: 9.5, lineHeight: 1.25, color: COLORS.body, marginTop: 3 },

  // ⚠️ NOT position:'absolute'. See the header note — fixed + absolute is what
  // crashed every multi-page invoice.
  footerWrap: { marginTop: 10 },
  footerRule: { height: 1, backgroundColor: COLORS.hair },
  footer: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 9 },
  footerText: { fontSize: 8, lineHeight: 1.25, color: COLORS.muted },
});

// ── Logo ─────────────────────────────────────────────────────────────
function TempoLogoMark() {
  return (
    <View style={s.logoWrap}>
      <Text style={s.logoText}>Temp</Text>
      <Svg width={17} height={17} viewBox="0 0 40 40">
        <Defs>
          <LinearGradient id="tempoGrad" x1="0" y1="0" x2="40" y2="40">
            <Stop offset="0%" stopColor={COLORS.primary} />
            <Stop offset="100%" stopColor={COLORS.accent} />
          </LinearGradient>
        </Defs>
        <Circle cx="20" cy="20" r="20" fill="url(#tempoGrad)" />
        {/* The Beat mark: three ascending bars on a shared baseline. Geometry is
            identical to public/logo/tempo-icon.svg — change it in both or neither. */}
        <Rect x="9.25" y="20.5" width="5.5" height="10"   rx="2.75" fill="white" />
        <Rect x="17.25" y="15"   width="5.5" height="15.5" rx="2.75" fill="white" />
        <Rect x="25.25" y="9.5"  width="5.5" height="21"   rx="2.75" fill="white" />
      </Svg>
    </View>
  );
}

// ── Component ────────────────────────────────────────────────────────
function InvoicePdfDoc({ data }: { data: InvoicePdfData }) {
  // Which lines render (and their order) is the shared invoice math's call —
  // the public share view builds from the same function, so PDF and web can
  // never disagree about which rows an invoice has.
  const lineItems = buildDisplayLineItems(data).map((item) => ({
    title: item.title,
    sub: item.key === 'commission' && data.totalGmv > 0
      ? `Affiliate sales attributed to your managed roster in ${fmtPeriod(data.periodMonth)}`
      : undefined,
    amount: item.amount,
  }));

  // Coherence check (mirrors share-view): a hand-edited stored total can drift
  // from its line items — surface the signed difference as an explicit
  // Adjustment line so the document always sums.
  const lineSum = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const totalDelta = data.totalAmount - lineSum;
  if (Math.abs(totalDelta) > 1) {
    lineItems.push({
      title: 'Adjustment',
      sub: 'Manually adjusted total — the stored total differs from the line items',
      amount: totalDelta,
    });
  }

  // Named contributors, then everyone else as one line. The remainder is
  // computed by SUBTRACTION from the true totals, never by re-summing a slice,
  // so the section foots exactly even if the stored breakdown is partial.
  const sorted = [...data.creators].sort((a, b) => b.gmv - a.gmv);
  const named = sorted.slice(0, NAMED_CONTRIBUTORS);
  const restCount = sorted.length - named.length;
  const allGmv = sorted.reduce((n, c) => n + c.gmv, 0);
  const allComm = sorted.reduce((n, c) => n + c.commission, 0);
  const namedGmv = named.reduce((n, c) => n + c.gmv, 0);
  const namedComm = named.reduce((n, c) => n + c.commission, 0);

  const isVoid = data.status === 'void';
  const chipColor = data.brandColor || COLORS.primary;

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        <View style={s.top}>
          <View>
            <TempoLogoMark />
            <Text style={s.tagline}>Creator Management, Simplified</Text>
          </View>
          <View style={s.invNoWrap}>
            <Text style={s.invNoLabel}>Invoice</Text>
            <Text style={s.invNo}>{data.invoiceNumber}</Text>
          </View>
        </View>

        {/* What the fee bought, beside what is owed. Both at equal weight so it
            reads as a statement of fact rather than a boast. Suppressed when
            there is no GMV to talk about (retainer-only months). */}
        <View style={s.thesis}>
          <View>
            <Text style={s.tLabel}>{data.totalGmv > 0 ? 'Your creators sold' : 'Period'}</Text>
            <Text style={s.tBig}>{data.totalGmv > 0 ? fmtCurrency(data.totalGmv) : fmtPeriod(data.periodMonth)}</Text>
            <Text style={s.tSub}>
              {data.creators.length > 0
                ? `${data.creators.length} creators · ${fmtPeriod(data.periodMonth)}`
                : fmtPeriod(data.periodMonth)}
            </Text>
          </View>
          <View style={s.tRight}>
            <Text style={s.tLabel}>{isVoid ? 'Voided' : 'Amount due'}</Text>
            <Text style={s.tAmt}>{fmtCurrency(data.totalAmount)}</Text>
            <Text style={s.tSub}>{isVoid ? 'No payment due' : `Due ${fmtDate(data.dueDate)}`}</Text>
          </View>
        </View>

        <View style={s.meta}>
          <View style={s.metaCell}><Text style={s.k}>Period</Text><Text style={s.v}>{fmtPeriod(data.periodMonth)}</Text></View>
          <View style={s.metaCell}><Text style={s.k}>Issued</Text><Text style={s.v}>{fmtDate(data.generatedAt)}</Text></View>
          <View style={s.metaCell}><Text style={s.k}>Due</Text><Text style={s.v}>{isVoid ? '—' : fmtDate(data.dueDate)}</Text></View>
          <View style={s.metaCell}><Text style={s.k}>Status</Text><Text style={s.v}>{data.status.charAt(0).toUpperCase() + data.status.slice(1)}</Text></View>
        </View>

        <View style={s.rule} />

        <View style={s.parties}>
          <View style={s.party}>
            <Text style={s.k}>From</Text>
            <Text style={[s.partyName, { marginTop: 4 }]}>{data.billFrom?.name || FALLBACK_BILL_FROM.business}</Text>
            {data.billFrom?.name && <Text style={s.partyLine}>{FALLBACK_BILL_FROM.business}</Text>}
            {data.billFrom?.email && <Text style={s.partyLine}>{data.billFrom.email}</Text>}
          </View>
          <View style={s.party}>
            <Text style={s.k}>Bill to</Text>
            <View style={s.partyRow}>
              {/* Brand chip. brands_v2.logo_url is not used yet: no brand has one,
                  and @react-pdf throws on an unreachable image, which would
                  reintroduce exactly the class of render crash we just fixed.
                  Wire it once logos are stored and served from our own bucket. */}
              <View style={[s.chip, { backgroundColor: chipColor }]}>
                <Text style={s.chipText}>{initials(data.brandName)}</Text>
              </View>
              <Text style={s.partyName}>{data.brandName}</Text>
            </View>
            {/* Only when it adds something. bill_to_name is frequently just the
                brand name again, which rendered "LeeFar" directly under
                "LeeFar". */}
            {data.billTo.name && data.billTo.name.trim().toLowerCase() !== data.brandName.trim().toLowerCase() && (
              <Text style={s.partyLine}>{data.billTo.name}</Text>
            )}
            {data.billTo.email && <Text style={s.partyLine}>{data.billTo.email}</Text>}
            {data.billTo.address && data.billTo.address.split('\n').filter(Boolean).map((l, i) => (
              <Text key={i} style={s.partyLine}>{l}</Text>
            ))}
          </View>
        </View>

        <View style={s.rule} />

        <View style={{ flexDirection: 'row' }}>
          <Text style={[s.th, s.colDesc]}>Description</Text>
          <Text style={[s.th, s.colNum]}>Amount</Text>
        </View>
        {lineItems.map((item, i) => (
          <React.Fragment key={`${item.title}-${i}`}>
            <View style={s.lineRule} />
            <View style={s.lineRow}>
              <View style={s.colDesc}>
                <Text style={s.itemTitle}>{item.title}</Text>
                {item.sub && <Text style={s.itemSub}>{item.sub}</Text>}
              </View>
              <Text style={[s.amt, s.colNum]}>{fmtCurrency(item.amount)}</Text>
            </View>
          </React.Fragment>
        ))}

        {named.length > 0 && (
          <View style={s.contribBlock}>
            <View style={{ flexDirection: 'row', marginBottom: 5 }}>
              <Text style={[s.th, s.colDesc]}>Top contributors · affiliate sales</Text>
              <Text style={[s.th, s.colNum]}>Sales</Text>
              <Text style={[s.th, s.colNum]}>Commission</Text>
            </View>
            {named.map((c, i) => (
              <React.Fragment key={`${c.name}-${i}`}>
                {i > 0 && <View style={s.contribRule} />}
                <View style={s.contribRow}>
                  <Text style={s.contribName}>{c.name.startsWith('@') ? c.name : `@${c.name}`}</Text>
                  <Text style={s.contribNum}>{fmtCurrency(c.gmv)}</Text>
                  <Text style={s.contribNum}>{fmtCurrency(c.commission)}</Text>
                </View>
              </React.Fragment>
            ))}
            {restCount > 0 && (
              <>
                <View style={s.restRule} />
                <View style={s.contribRow}>
                  <Text style={s.restText}>+{restCount} more creator{restCount === 1 ? '' : 's'}</Text>
                  <Text style={s.restNum}>{fmtCurrency(allGmv - namedGmv)}</Text>
                  <Text style={s.restNum}>{fmtCurrency(allComm - namedComm)}</Text>
                </View>
              </>
            )}
            {/* Marketing GMV is brand-level and cannot be attributed to a
                creator, so these rows cover AFFILIATE only and sum to less
                than the commission charged. Stated as the delta from the
                invoice's own commission so it foots by construction. */}
            {Math.abs(data.commission - allComm) >= 0.01 && (
              <>
                <View style={s.restRule} />
                <View style={s.contribRow}>
                  <Text style={s.restText}>Marketing GMV commission</Text>
                  <Text style={s.restNum}>{fmtCurrency(data.marketingGmv)}</Text>
                  <Text style={s.restNum}>{fmtCurrency(data.commission - allComm)}</Text>
                </View>
              </>
            )}
            {/* Each payee's invoice carries the FULL brand GMV, not a slice, so
                a client holding both could add the sales columns and see twice
                the GMV that exists. Commission DOES add up across them; the
                basis does not.
                ⚠️ Keep this to ONE rendered line. Measured: at three lines this
                note alone pushed the document onto a second page. */}
            {/* Wrapped in a View ON PURPOSE. As bare Text siblings these were
                mis-measured and the HOW TO PAY box below printed straight over
                the URL. Padding the following block's margin only hid it; a
                View gets measured properly, so the fix survives spacing
                changes. */}
            <View style={s.verifyWrap}>
              <Text style={s.verify}>
                Sales are {data.brandName}&apos;s {fmtPeriod(data.periodMonth)} total — the basis for this rate, not additive across invoices.
              </Text>
              {/* ⚠️ Deliberately NOT the full share URL.
                  The token makes it ~70 characters, which wraps in this column
                  and gets mis-measured, so the HOW TO PAY box below printed
                  straight over its tail. Widening margins and wrapping it in a
                  View both failed; the only reliable fix is a line that cannot
                  wrap. The client reaches the breakdown through the same link
                  this PDF was delivered with, and that page has the full table
                  plus a CSV export. */}
              {data.shareUrl && (
                <Text style={s.verify}>
                  Creator-by-creator breakdown and CSV export: see your invoice link.
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={s.bottom}>
          <View style={s.payRow}>
            <View style={s.pay}>
              <Text style={s.k}>How to pay</Text>
              <Text style={s.payText}>
                {data.paymentInstructions?.trim()
                  || `Reference ${data.invoiceNumber} with your payment. Contact ${data.billFrom?.email || 'your account manager'} for remittance details.`}
              </Text>
            </View>
            <View style={s.totals}>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Subtotal</Text>
                <Text style={s.totalValue}>{fmtCurrency(data.totalAmount)}</Text>
              </View>
              <View style={s.grandRule} />
              <View style={s.grandRow}>
                <Text style={s.grandLabel}>{isVoid ? 'Voided' : 'Total due'}</Text>
                <Text style={s.grandValue}>{fmtCurrency(data.totalAmount)}</Text>
              </View>
              <Text style={s.grandHint}>
                {isVoid ? 'No payment due' : `Payable on or before ${fmtDate(data.dueDate)}`}
              </Text>
            </View>
          </View>

          {/* ⚠️ invoices.notes is NOT rendered, deliberately.
              The field was intended for client-facing terms (net terms, PO
              numbers) but that is not what it holds. Measured 2026-08-10: 2 of
              30 invoices have notes, BOTH are internal reconciliation trails,
              and BOTH are on sent/paid invoices. TEMPO-2026-06-002 printed
              "Pre-update snapshot: commission=8944.32 … (Google Sheet 1sCF3iW…)"
              to Cata-Kor, complete with the sheet id.
              It also caused the layout bug that surfaced this: the Notes header
              sat at the bottom of page 1 with its body orphaned onto page 2.
              If client-visible notes are wanted, add a separate field for them
              rather than re-enabling this one. */}

          <View style={s.footerWrap}>
            <View style={s.footerRule} />
            <View style={s.footer} fixed>
              <Text style={s.footerText}>{data.billFrom?.name || FALLBACK_BILL_FROM.business} · Thank you for your business.</Text>
              <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${data.invoiceNumber} · Page ${pageNumber} of ${totalPages}`} />
            </View>
          </View>
        </View>

      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoicePdfDoc data={data} />);
}
