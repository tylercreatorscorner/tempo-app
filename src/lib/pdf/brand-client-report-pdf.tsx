/**
 * Brand Client Report — full PDF document.
 *
 * Multi-page polished report designed to match (and exceed) the old Netlify
 * dashboard's brand client report. Section-by-section:
 *
 *   1. Cover                          — branded black card + brand name + period
 *   2. Executive Summary              — narrative paragraph with highlighted numbers
 *   3. Highlight cards                — Top Creator · Top Video · Best Day
 *   4. Total GMV hero                 — single massive number on pink card
 *   5. Key Metrics                    — Orders / Creators / Videos with WoW deltas + secondary KPIs
 *   6. Managed vs Organic             — donut + split breakdown
 *   7. New vs Returning Creators      — split bars
 *   8. Day of Week + Daily Perf       — bar chart + table with peak highlight
 *   9. Top Creators                   — top-10 leaderboard with medals + progress bars
 *  10. Top Videos                     — top-10 with titles + creator + GMV/orders
 *  11. Top Products                   — top-10 with order count + % of total
 *  12. Product↔Creator Breakdown      — top 5 products → top 3 creators each
 *  13. Footer                         — Tempo branding
 *
 * Uses Tempo's brand colors (pink #E91E8C primary, dark #1A1B3A ink) instead
 * of the old dash's green palette. Green is reserved for positive deltas.
 */
import { Document, Page, Text, View, StyleSheet, Font, Svg, Circle, Path } from '@react-pdf/renderer';
import path from 'node:path';
import type { BrandClientReportData } from '@/lib/data/brand-client-report';

// ── Font registration (Inter, matching the invoices PDF + dashboard) ──
// Built-in Helvetica has no glyphs for emoji/symbols and looks off next to
// the rest of the product. Resolved against node_modules so it works in
// dev + serverless production.
function fontPath(weight: '400Regular' | '600SemiBold' | '700Bold' | '800ExtraBold') {
  return path.join(process.cwd(), 'node_modules', '@expo-google-fonts', 'inter', weight, `Inter_${weight}.ttf`);
}

Font.register({
  family: 'Inter',
  fonts: [
    { src: fontPath('400Regular'),   fontWeight: 400 },
    { src: fontPath('600SemiBold'),  fontWeight: 600 },
    { src: fontPath('700Bold'),      fontWeight: 700 },
    { src: fontPath('800ExtraBold'), fontWeight: 800 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const COLORS = {
  pink:        '#E91E8C',
  pinkSoft:    '#FCE7F3',
  pinkDeep:    '#9D0E5F',
  ink:         '#1A1B3A',
  body:        '#374151',
  muted:       '#6B7280',
  faint:       '#9CA3AF',
  rule:        '#E5E7EB',
  ruleSoft:    '#F3F4F6',
  bg:          '#FFFFFF',
  bgCard:      '#FAFAFA',
  bgCardSoft:  '#FBFBFC',
  positive:    '#059669',
  positiveBg:  '#ECFDF5',
  negative:    '#DC2626',
  negativeBg:  '#FEF2F2',
  gold:        '#F59E0B',
  goldSoft:    '#FEF3C7',
  blue:        '#3B82F6',
  blueSoft:    '#DBEAFE',
  purple:      '#8B5CF6',
  purpleSoft:  '#EDE9FE',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10,
    color: COLORS.body,
    fontFamily: 'Inter',
    backgroundColor: COLORS.bg,
  },
  // ── Cover page
  coverPage: {
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10,
    color: COLORS.body,
    fontFamily: 'Inter',
    backgroundColor: COLORS.bg,
  },
  coverCard: {
    backgroundColor: COLORS.ink,
    borderRadius: 14,
    padding: 36,
    paddingTop: 32,
    minHeight: 280,
    position: 'relative',
  },
  coverEyebrow:    { fontSize: 8, color: COLORS.faint, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.6, marginBottom: 6 },
  coverWordmark:   { fontSize: 14, color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.4, marginBottom: 38 },
  coverDivider:    { height: 0.5, backgroundColor: '#3a3b5a', marginVertical: 14 },
  coverClientLabel:{ fontSize: 8, color: COLORS.faint, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.6, marginBottom: 8 },
  coverClientRow:  { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 },
  coverClientName: { fontSize: 28, color: '#FFFFFF', fontFamily: 'Inter', fontWeight: 700, flexShrink: 1 },
  coverPeriodCol:  { alignItems: 'flex-end' },
  coverPeriodLabel:{ fontSize: 8, color: COLORS.faint, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.6, marginBottom: 6 },
  coverPeriod:     { fontSize: 13, color: COLORS.pink, fontFamily: 'Inter', fontWeight: 700 },
  coverAccentBar:  { position: 'absolute', top: 0, left: 24, height: 4, width: 60, backgroundColor: COLORS.pink, borderRadius: 2 },

  // ── Section
  section:        { marginBottom: 22 },
  sectionTitle:   { fontSize: 11, fontFamily: 'Inter', fontWeight: 700, color: COLORS.ink, marginBottom: 4 },
  sectionEyebrow: { fontSize: 7, color: COLORS.muted, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.4, marginBottom: 4 },

  // Reusable card
  card: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.rule, borderRadius: 10, padding: 16 },
  cardSoft: { backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.rule, borderRadius: 10, padding: 14 },

  // ── Executive Summary
  summaryCard: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.pink,
    borderRadius: 10,
    padding: 18,
  },
  summaryEyebrow: { fontSize: 7, color: COLORS.muted, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.4, marginBottom: 4 },
  summaryTitle:   { fontSize: 14, fontFamily: 'Inter', fontWeight: 700, color: COLORS.ink, marginBottom: 10 },
  summaryBody:    { fontSize: 11, color: COLORS.body, lineHeight: 1.6 },
  highlightPos:   { color: COLORS.positive, fontFamily: 'Inter', fontWeight: 700 },
  highlightNeg:   { color: COLORS.negative, fontFamily: 'Inter', fontWeight: 700 },
  highlightPink:  { color: COLORS.pink, fontFamily: 'Inter', fontWeight: 700 },
  highlightInk:   { color: COLORS.ink, fontFamily: 'Inter', fontWeight: 700 },

  // ── Highlight 3-card row
  highlightRow:  { flexDirection: 'row', gap: 10, marginTop: 14 },
  highlightCard: { flex: 1, borderWidth: 1, borderColor: COLORS.rule, borderRadius: 10, padding: 14, backgroundColor: COLORS.bg },
  highlightTopBar:{ height: 3, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginHorizontal: -14, marginTop: -14, marginBottom: 12 },
  highlightLabel:{ fontSize: 8, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.2, marginBottom: 8 },
  highlightTitle:{ fontSize: 12, color: COLORS.ink, fontFamily: 'Inter', fontWeight: 700, marginBottom: 4 },
  highlightValue:{ fontSize: 18, color: COLORS.pink, fontFamily: 'Inter', fontWeight: 700, marginTop: 2 },
  highlightSub:  { fontSize: 8, color: COLORS.muted, marginTop: 4 },

  // ── Hero GMV
  heroCard: {
    backgroundColor: COLORS.pink,
    borderRadius: 12,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginVertical: 14,
  },
  heroLabel: { fontSize: 9, color: '#fff', fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.4, opacity: 0.85, marginBottom: 10 },
  heroValue: { fontSize: 36, color: '#fff', fontFamily: 'Inter', fontWeight: 700 },

  // ── KPI cards
  kpiRow:        { flexDirection: 'row', gap: 10, marginBottom: 10 },
  kpiCard:       { flex: 1, padding: 14, borderRadius: 10, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.rule },
  kpiLabel:      { fontSize: 7, color: COLORS.muted, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.2, marginBottom: 8 },
  kpiValue:      { fontSize: 20, fontFamily: 'Inter', fontWeight: 700, color: COLORS.ink },
  kpiDeltaPos:   { fontSize: 8, color: COLORS.positive, fontFamily: 'Inter', fontWeight: 700, marginTop: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: COLORS.positiveBg, borderRadius: 999, alignSelf: 'flex-start' },
  kpiDeltaNeg:   { fontSize: 8, color: COLORS.negative, fontFamily: 'Inter', fontWeight: 700, marginTop: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: COLORS.negativeBg, borderRadius: 999, alignSelf: 'flex-start' },
  kpiDeltaNew:   { fontSize: 8, color: COLORS.muted, fontFamily: 'Inter', fontWeight: 700, marginTop: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: COLORS.ruleSoft, borderRadius: 999, alignSelf: 'flex-start' },

  // ── Managed vs Organic
  splitRow:      { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 10 },
  splitLeftCard: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: COLORS.pinkSoft, borderWidth: 1, borderColor: '#F8C0DD' },
  splitRightCard:{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.rule },
  splitLabel:    { fontSize: 8, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.2, marginBottom: 6 },
  splitGmv:      { fontSize: 18, fontFamily: 'Inter', fontWeight: 700 },
  splitMeta:     { fontSize: 8, color: COLORS.muted, marginTop: 6 },
  donutWrap:     { width: 90, alignItems: 'center', justifyContent: 'center' },
  donutLabel:    { fontSize: 14, fontFamily: 'Inter', fontWeight: 700, color: COLORS.ink },
  donutSubLabel: { fontSize: 7, color: COLORS.muted, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.2 },
  splitBar:      { height: 4, borderRadius: 2, backgroundColor: COLORS.rule, marginTop: 12, overflow: 'hidden' },
  splitBarFill:  { height: 4, backgroundColor: COLORS.pink, borderRadius: 2 },
  splitBarLabels:{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  splitBarText:  { fontSize: 7, color: COLORS.muted, fontFamily: 'Inter', fontWeight: 700 },
  splitBarTextR: { fontSize: 7, color: COLORS.muted, fontFamily: 'Inter', fontWeight: 700, textAlign: 'right' },

  // ── New vs Returning
  nvrRow:        { flexDirection: 'row', gap: 10, marginTop: 10 },
  nvrCardNew:    { flex: 1, padding: 14, borderRadius: 10, backgroundColor: COLORS.positiveBg, borderWidth: 1, borderColor: '#A7F3D0' },
  nvrCardRet:    { flex: 1, padding: 14, borderRadius: 10, backgroundColor: COLORS.blueSoft, borderWidth: 1, borderColor: '#BFDBFE' },
  nvrLabel:      { fontSize: 8, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.2 },
  nvrCount:      { fontSize: 22, fontFamily: 'Inter', fontWeight: 700, marginTop: 6 },
  nvrPctRow:     { fontSize: 8, color: COLORS.muted, marginTop: 2 },
  nvrGmv:        { fontSize: 12, fontFamily: 'Inter', fontWeight: 700, marginTop: 8 },
  nvrSub:        { fontSize: 7, color: COLORS.muted },

  // ── Day-of-week bars
  dowRow:        { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 100, paddingHorizontal: 4, marginTop: 10 },
  dowItem:       { flex: 1, alignItems: 'center', marginHorizontal: 2 },
  dowBar:        { width: '70%', backgroundColor: COLORS.blue, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  dowBarPeak:    { width: '70%', backgroundColor: COLORS.pink, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  dowDay:        { fontSize: 8, color: COLORS.muted, marginTop: 4, fontFamily: 'Inter', fontWeight: 700 },
  dowDayPeak:    { fontSize: 8, color: COLORS.pink, marginTop: 4, fontFamily: 'Inter', fontWeight: 700 },
  dowGmv:        { fontSize: 7, color: COLORS.muted, marginBottom: 3 },
  dowGmvPeak:    { fontSize: 7, color: COLORS.pink, marginBottom: 3, fontFamily: 'Inter', fontWeight: 700 },

  // ── Daily perf table
  table:           { borderWidth: 1, borderColor: COLORS.rule, borderRadius: 8, marginTop: 12, overflow: 'hidden' },
  tableHeader:     { flexDirection: 'row', backgroundColor: COLORS.bgCard, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: COLORS.rule },
  tableHeaderCell: { fontSize: 7, color: COLORS.muted, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.2 },
  tableRow:        { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.ruleSoft },
  tableRowPeak:    { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.ruleSoft, backgroundColor: COLORS.pinkSoft },
  tableRowLast:    { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10 },
  tableCell:       { fontSize: 9, color: COLORS.ink },
  tableCellRight:  { fontSize: 9, color: COLORS.ink, textAlign: 'right' },
  tableCellMoney:  { fontSize: 9, color: COLORS.pink, fontFamily: 'Inter', fontWeight: 700, textAlign: 'right' },
  peakBadge:       { fontSize: 7, color: '#fff', fontFamily: 'Inter', fontWeight: 700, backgroundColor: COLORS.pink, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, marginLeft: 6 },

  // ── Leaderboard rows
  lbRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.ruleSoft },
  lbRowTop:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, marginBottom: 4, borderRadius: 8, paddingHorizontal: 12, backgroundColor: COLORS.pinkSoft, borderWidth: 1, borderColor: '#F8C0DD' },
  lbRank:         { width: 22, fontSize: 10, color: COLORS.faint, fontFamily: 'Inter', fontWeight: 700 },
  lbBody:         { flex: 1 },
  lbName:         { fontSize: 11, color: COLORS.ink, fontFamily: 'Inter', fontWeight: 700 },
  lbMeta:         { fontSize: 8, color: COLORS.muted, marginTop: 2 },
  lbGmv:          { fontSize: 12, color: COLORS.pink, fontFamily: 'Inter', fontWeight: 700, textAlign: 'right' },
  lbGmvBox:       { width: 100, alignItems: 'flex-end' },
  lbPct:          { fontSize: 7, color: COLORS.muted, marginTop: 2, textAlign: 'right' },
  lbBarTrack:     { height: 3, backgroundColor: COLORS.rule, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  lbBarFill:      { height: 3, backgroundColor: COLORS.pink, borderRadius: 2 },

  // ── Per-product creator breakdown
  pcCard:        { borderLeftWidth: 3, borderLeftColor: COLORS.pink, backgroundColor: COLORS.bg, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: COLORS.rule, borderRadius: 6, padding: 14, marginBottom: 10 },
  pcRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pcName:        { fontSize: 11, color: COLORS.ink, fontFamily: 'Inter', fontWeight: 700, flex: 1, paddingRight: 12 },
  pcPrice:       { fontSize: 16, color: COLORS.pink, fontFamily: 'Inter', fontWeight: 700, textAlign: 'right' },
  pcMeta:        { fontSize: 8, color: COLORS.muted, marginTop: 4 },
  pcChipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: COLORS.ruleSoft },
  pcChipLabel:   { fontSize: 7, color: COLORS.muted, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.2, width: '100%', marginBottom: 4 },
  pcChip:        { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.rule },
  pcChipText:    { fontSize: 9, color: COLORS.ink, fontFamily: 'Inter', fontWeight: 700 },

  // ── Footer
  footerCard:    { backgroundColor: COLORS.ink, borderRadius: 12, padding: 28, alignItems: 'center', marginTop: 24 },
  footerEyebrow: { fontSize: 8, color: COLORS.faint, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.6, marginBottom: 6 },
  footerWordmark:{ fontSize: 16, color: '#fff', fontFamily: 'Inter', fontWeight: 700, letterSpacing: 1.4 },
  footerDivider: { height: 0.5, backgroundColor: '#3a3b5a', marginTop: 14, marginBottom: 14, alignSelf: 'stretch' },
  footerTagsRow: { flexDirection: 'row', gap: 18, marginBottom: 10 },
  footerTag:     { fontSize: 8, color: COLORS.faint, fontFamily: 'Inter', fontWeight: 700 },
  footerStamp:   { fontSize: 7, color: COLORS.faint, marginTop: 8 },

  // Page header on continuation pages
  pageHead:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COLORS.rule },
  pageHeadBrand:   { fontSize: 9, color: COLORS.pink, fontFamily: 'Inter', fontWeight: 700 },
  pageHeadPeriod:  { fontSize: 8, color: COLORS.muted },
});

// ── Helpers ────────────────────────────────────────────────────────

function fmtCurrency(n: number, decimals = 0): string {
  const rounded = decimals === 0 ? Math.round(n || 0) : Number((n || 0).toFixed(decimals));
  return '$' + rounded.toLocaleString();
}
function fmtCurrencyShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'k';
  return fmtCurrency(n);
}
function fmtNumber(n: number): string { return Math.round(n || 0).toLocaleString(); }
function fmtPct(n: number, decimals = 0): string { return (n || 0).toFixed(decimals) + '%'; }
function medal(rank: number): string {
  // Ranks render as "1." "2." "3." via the `medal(i) || \`${i+1}.\`` callers.
  // Top-3 rows already get distinct styling (lbRowTop), so no icon needed,
  // and emoji have no glyph in the embedded font (caused tofu over text).
  void rank;
  return '';
}

// ── Components ─────────────────────────────────────────────────────

function PageHead({ brandName, periodLabel }: { brandName: string; periodLabel: string }) {
  return (
    <View style={styles.pageHead} fixed>
      <Text style={styles.pageHeadBrand}>{brandName.toUpperCase()} · WEEKLY REPORT</Text>
      <Text style={styles.pageHeadPeriod}>{periodLabel}</Text>
    </View>
  );
}

function Donut({ pct }: { pct: number }) {
  // Simple donut via SVG: full pink ring + gray ring on top with arc
  const size = 88;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const filledLen = (Math.max(0, Math.min(100, pct)) / 100) * circumference;
  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={r} stroke={COLORS.rule} strokeWidth={stroke} fill="none" />
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={COLORS.pink}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${filledLen} ${circumference - filledLen}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={styles.donutLabel}>{Math.round(pct)}%</Text>
        <Text style={styles.donutSubLabel}>MANAGED</Text>
      </View>
    </View>
  );
}

function DeltaPill({ pct }: { pct: number | null }) {
  if (pct === null) return <Text style={styles.kpiDeltaNew}>NEW</Text>;
  const rounded = Math.round(Math.abs(pct));
  if (pct >= 0) return <Text style={styles.kpiDeltaPos}>+{rounded}%</Text>;
  return <Text style={styles.kpiDeltaNeg}>-{rounded}%</Text>;
}

// ── Main Document ──────────────────────────────────────────────────

export function BrandClientReportPDF({ data }: { data: BrandClientReportData }) {
  const goalPctOfTotal = (n: number) => data.totalGmv > 0 ? (n / data.totalGmv) * 100 : 0;
  const peakDow = data.dayOfWeek.reduce((m, d) => Math.max(m, d.gmv), 0);

  return (
    <Document
      title={`${data.brandName} — Weekly Report (${data.periodLabel})`}
      author="Tempo"
      subject="Weekly performance report"
    >
      {/* ───────────── PAGE 1: Cover + Executive Summary + Highlights ───────────── */}
      <Page size="LETTER" style={styles.coverPage}>
        <View style={styles.coverCard}>
          <View style={styles.coverAccentBar} />
          <Text style={styles.coverEyebrow}>PREPARED BY</Text>
          <Text style={styles.coverWordmark}>TEMPO</Text>
          <View style={styles.coverDivider} />
          <Text style={styles.coverClientLabel}>CLIENT</Text>
          <View style={styles.coverClientRow}>
            <Text style={styles.coverClientName}>{data.brandName}</Text>
            <View style={styles.coverPeriodCol}>
              <Text style={styles.coverPeriodLabel}>REPORTING PERIOD</Text>
              <Text style={styles.coverPeriod}>{data.periodLabel}</Text>
            </View>
          </View>
        </View>

        {/* Executive Summary */}
        <View style={[styles.summaryCard, { marginTop: 22 }]}>
          <Text style={styles.summaryEyebrow}>OVERVIEW</Text>
          <Text style={styles.summaryTitle}>Executive Summary</Text>
          <Text style={styles.summaryBody}>
            This period, <Text style={styles.highlightPink}>{data.brandName}</Text> generated{' '}
            <Text style={styles.highlightPos}>{fmtCurrency(data.totalGmv)}</Text> in GMV from{' '}
            <Text style={styles.highlightInk}>{fmtNumber(data.totalOrders)}</Text> orders across{' '}
            <Text style={styles.highlightInk}>{fmtNumber(data.activeCreators)}</Text> active creators.
            {data.gmvChangePct !== null && (
              <Text>
                {' '}This represents a{' '}
                <Text style={data.gmvChangePct >= 0 ? styles.highlightPos : styles.highlightNeg}>
                  {Math.abs(Math.round(data.gmvChangePct))}% {data.gmvChangePct >= 0 ? 'increase' : 'decrease'}
                </Text>{' '}compared to the prior period.
              </Text>
            )}
            {data.topCreator && (
              <Text>
                {' '}<Text style={styles.highlightPink}>@{data.topCreator.name.replace('@','')}</Text> led
                the pack with <Text style={styles.highlightInk}>{fmtCurrency(data.topCreator.gmv)}</Text> in sales.
              </Text>
            )}
            {data.bestDay && (
              <Text>
                {' '}Peak performance occurred on{' '}
                <Text style={styles.highlightInk}>{data.bestDay.weekday}, {data.bestDay.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>{' '}
                with <Text style={styles.highlightPos}>{fmtCurrency(data.bestDay.gmv)}</Text> GMV.
              </Text>
            )}
          </Text>
        </View>

        {/* Highlight 3-card row */}
        <View style={styles.highlightRow}>
          {data.topCreator && (
            <View style={styles.highlightCard}>
              <View style={[styles.highlightTopBar, { backgroundColor: COLORS.gold }]} />
              <Text style={[styles.highlightLabel, { color: COLORS.gold }]}>TOP CREATOR</Text>
              <Text style={styles.highlightTitle}>@{data.topCreator.name.replace('@','')}</Text>
              <Text style={styles.highlightValue}>{fmtCurrency(data.topCreator.gmv)}</Text>
              <Text style={styles.highlightSub}>{fmtNumber(data.topCreator.orders)} orders · {fmtNumber(data.topCreator.videos)} videos</Text>
            </View>
          )}
          {data.topVideo && (
            <View style={styles.highlightCard}>
              <View style={[styles.highlightTopBar, { backgroundColor: COLORS.blue }]} />
              <Text style={[styles.highlightLabel, { color: COLORS.blue }]}>TOP VIDEO</Text>
              <Text style={styles.highlightTitle}>{data.topVideo.title.length > 32 ? data.topVideo.title.slice(0, 32) + '...' : data.topVideo.title}</Text>
              <Text style={styles.highlightValue}>{fmtCurrency(data.topVideo.gmv)}</Text>
              <Text style={styles.highlightSub}>by @{data.topVideo.creator.replace('@','')}</Text>
            </View>
          )}
          {data.bestDay && (
            <View style={styles.highlightCard}>
              <View style={[styles.highlightTopBar, { backgroundColor: COLORS.positive }]} />
              <Text style={[styles.highlightLabel, { color: COLORS.positive }]}>BEST DAY</Text>
              <Text style={styles.highlightTitle}>{data.bestDay.weekday.slice(0, 3)}, {data.bestDay.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
              <Text style={styles.highlightValue}>{fmtCurrency(data.bestDay.gmv)}</Text>
              <Text style={styles.highlightSub}>{fmtNumber(data.bestDay.orders)} orders</Text>
            </View>
          )}
        </View>

        {/* Total GMV Hero */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>TOTAL GMV GENERATED</Text>
          <Text style={styles.heroValue}>{fmtCurrency(data.totalGmv)}</Text>
        </View>
      </Page>

      {/* ───────────── PAGE 2: Key Metrics + Managed/Organic + New/Returning ───────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHead brandName={data.brandName} periodLabel={data.periodLabel} />

        {/* Primary KPIs row */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>KEY METRICS</Text>
          <Text style={styles.sectionTitle}>Performance Overview</Text>
          <View style={[styles.kpiRow, { marginTop: 10 }]}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>ORDERS</Text>
              <Text style={styles.kpiValue}>{fmtNumber(data.totalOrders)}</Text>
              <DeltaPill pct={data.orderChangePct} />
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>ACTIVE CREATORS</Text>
              <Text style={styles.kpiValue}>{fmtNumber(data.activeCreators)}</Text>
              <DeltaPill pct={data.creatorChangePct} />
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>VIDEOS POSTED</Text>
              <Text style={styles.kpiValue}>{fmtNumber(data.totalVideos)}</Text>
              <DeltaPill pct={data.videoChangePct} />
            </View>
          </View>

          {/* Secondary KPIs row */}
          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, { backgroundColor: COLORS.bgCard }]}>
              <Text style={styles.kpiLabel}>AVG ORDER VALUE</Text>
              <Text style={[styles.kpiValue, { fontSize: 16 }]}>{fmtCurrency(data.avgOrderValue, 2)}</Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: COLORS.bgCard }]}>
              <Text style={styles.kpiLabel}>AVG GMV / CREATOR</Text>
              <Text style={[styles.kpiValue, { fontSize: 16 }]}>{fmtCurrency(data.avgGmvPerCreator)}</Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: COLORS.bgCard }]}>
              <Text style={styles.kpiLabel}>EST. COMMISSION</Text>
              <Text style={[styles.kpiValue, { fontSize: 16 }]}>{fmtCurrency(data.estCommission)}</Text>
            </View>
          </View>
        </View>

        {/* Managed vs Organic */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>PERFORMANCE SPLIT</Text>
          <Text style={styles.sectionTitle}>Managed vs Organic</Text>
          <View style={styles.splitRow}>
            <View style={styles.splitLeftCard}>
              <Text style={[styles.splitLabel, { color: COLORS.pinkDeep }]}>MANAGED CREATORS</Text>
              <Text style={[styles.splitGmv, { color: COLORS.pinkDeep }]}>{fmtCurrency(data.managed.gmv)}</Text>
              <Text style={styles.splitMeta}>{fmtNumber(data.managed.creatorCount)} creators · {fmtNumber(data.managed.orders)} orders</Text>
            </View>
            <Donut pct={data.managedPct} />
            <View style={styles.splitRightCard}>
              <Text style={[styles.splitLabel, { color: COLORS.muted }]}>ORGANIC / AFFILIATE</Text>
              <Text style={[styles.splitGmv, { color: COLORS.ink }]}>{fmtCurrency(data.organic.gmv)}</Text>
              <Text style={styles.splitMeta}>{fmtNumber(data.organic.creatorCount)} creators · {fmtNumber(data.organic.orders)} orders</Text>
            </View>
          </View>
          <View style={styles.splitBar}>
            <View style={[styles.splitBarFill, { width: `${Math.min(100, data.managedPct)}%` }]} />
          </View>
          <View style={styles.splitBarLabels}>
            <Text style={[styles.splitBarText, { color: COLORS.pink }]}>{fmtPct(data.managedPct, 1)} from Managed Creators</Text>
            <Text style={styles.splitBarTextR}>{fmtPct(100 - data.managedPct, 1)} Organic</Text>
          </View>
        </View>

        {/* New vs Returning Creators */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>CREATOR MIX</Text>
          <Text style={styles.sectionTitle}>New vs Returning Creators</Text>
          <View style={styles.nvrRow}>
            <View style={styles.nvrCardNew}>
              <Text style={[styles.nvrLabel, { color: COLORS.positive }]}>NEW THIS PERIOD</Text>
              <Text style={[styles.nvrCount, { color: COLORS.positive }]}>{fmtNumber(data.newCreators.count)}</Text>
              <Text style={styles.nvrPctRow}>creators ({Math.round(data.activeCreators > 0 ? (data.newCreators.count / data.activeCreators) * 100 : 0)}%)</Text>
              <Text style={[styles.nvrGmv, { color: COLORS.positive }]}>{fmtCurrency(data.newCreators.gmv)}</Text>
              <Text style={styles.nvrSub}>GMV from new creators</Text>
            </View>
            <View style={styles.nvrCardRet}>
              <Text style={[styles.nvrLabel, { color: COLORS.blue }]}>RETURNING</Text>
              <Text style={[styles.nvrCount, { color: COLORS.blue }]}>{fmtNumber(data.returningCreators.count)}</Text>
              <Text style={styles.nvrPctRow}>creators ({Math.round(data.activeCreators > 0 ? (data.returningCreators.count / data.activeCreators) * 100 : 0)}%)</Text>
              <Text style={[styles.nvrGmv, { color: COLORS.blue }]}>{fmtCurrency(data.returningCreators.gmv)}</Text>
              <Text style={styles.nvrSub}>GMV from returning creators</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* ───────────── PAGE 3: Day-of-Week + Daily Performance ───────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHead brandName={data.brandName} periodLabel={data.periodLabel} />

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>WEEKLY RHYTHM</Text>
          <Text style={styles.sectionTitle}>Performance by Day of Week</Text>
          <View style={styles.dowRow}>
            {data.dayOfWeek.map(d => {
              const heightPct = peakDow > 0 ? (d.gmv / peakDow) * 100 : 0;
              const barHeight = Math.max(2, (heightPct / 100) * 70);
              return (
                <View key={d.day} style={styles.dowItem}>
                  <Text style={d.isPeak ? styles.dowGmvPeak : styles.dowGmv}>{fmtCurrencyShort(d.gmv)}</Text>
                  <View style={[d.isPeak ? styles.dowBarPeak : styles.dowBar, { height: barHeight }]} />
                  <Text style={d.isPeak ? styles.dowDayPeak : styles.dowDay}>{d.day}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>DAILY BREAKDOWN</Text>
          <Text style={styles.sectionTitle}>Daily Performance</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>DATE</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>GMV</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>ORDERS</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>CREATORS</Text>
            </View>
            {data.dailyPerformance.map((d, i) => {
              const isLast = i === data.dailyPerformance.length - 1;
              const rowStyle = d.isPeak ? styles.tableRowPeak : (isLast ? styles.tableRowLast : styles.tableRow);
              return (
                <View key={d.date.toISOString()} style={rowStyle}>
                  <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.tableCell}>{d.weekday.slice(0, 3)}, {d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                    {d.isPeak && <Text style={styles.peakBadge}>PEAK</Text>}
                  </View>
                  <Text style={[styles.tableCellMoney, { flex: 1.2 }]}>{fmtCurrency(d.gmv)}</Text>
                  <Text style={[styles.tableCellRight, { flex: 1 }]}>{fmtNumber(d.orders)}</Text>
                  <Text style={[styles.tableCellRight, { flex: 1 }]}>{fmtNumber(d.creators)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </Page>

      {/* ───────────── PAGE 4: What Creators Corner Is Delivering ───────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHead brandName={data.brandName} periodLabel={data.periodLabel} />

        {/* Contribution headline + trend */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>YOUR CREATORS CORNER TEAM</Text>
          <Text style={styles.sectionTitle}>What Creators Corner Is Delivering</Text>
          <View style={styles.splitRow}>
            <View style={styles.splitLeftCard}>
              <Text style={[styles.splitLabel, { color: COLORS.pinkDeep }]}>MANAGED GMV THIS PERIOD</Text>
              <Text style={[styles.splitGmv, { color: COLORS.pinkDeep }]}>{fmtCurrency(data.creatorsCorner.gmv)}</Text>
              <Text style={styles.splitMeta}>
                {fmtPct(data.creatorsCorner.pctOfStoreGmv, 1)} of total store GMV · {fmtNumber(data.creatorsCorner.orders)} orders
              </Text>
              <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.splitMeta, { marginRight: 6 }]}>vs prior period</Text>
                <DeltaPill pct={data.creatorsCorner.gmvChangePct} />
              </View>
            </View>
            <View style={styles.splitRightCard}>
              <Text style={[styles.splitLabel, { color: COLORS.muted }]}>EST. VALUE DELIVERED</Text>
              <Text style={[styles.splitGmv, { color: COLORS.ink }]}>{fmtCurrency(data.creatorsCorner.commission)}</Text>
              <Text style={styles.splitMeta}>
                {fmtNumber(data.creatorsCorner.videos)} videos from signed creators
              </Text>
            </View>
          </View>
        </View>

        {/* Roster activation */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>ROSTER ACTIVATION</Text>
          <Text style={styles.sectionTitle}>Signed Creators At Work</Text>
          <Text style={styles.splitMeta}>
            {fmtNumber(data.creatorsCorner.activeCreatorCount)} of {fmtNumber(data.creatorsCorner.signedCreatorCount)} signed creators were active this period
            {data.creatorsCorner.newlyActivatedCount > 0
              ? ` · ${fmtNumber(data.creatorsCorner.newlyActivatedCount)} newly activated`
              : ''}
          </Text>
        </View>

        {/* Efficiency vs organic */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>EFFICIENCY</Text>
          <Text style={styles.sectionTitle}>Managed vs Organic, Per Creator</Text>
          <View style={styles.splitRow}>
            <View style={styles.splitLeftCard}>
              <Text style={[styles.splitLabel, { color: COLORS.pinkDeep }]}>MANAGED CREATORS</Text>
              <Text style={[styles.splitGmv, { color: COLORS.pinkDeep, fontSize: 14 }]}>{fmtCurrency(data.creatorsCorner.managedGmvPerCreator)} / creator</Text>
              <Text style={styles.splitMeta}>{fmtCurrency(data.creatorsCorner.managedAov)} avg order value</Text>
            </View>
            <View style={styles.splitRightCard}>
              <Text style={[styles.splitLabel, { color: COLORS.muted }]}>ORGANIC / AFFILIATE</Text>
              <Text style={[styles.splitGmv, { color: COLORS.ink, fontSize: 14 }]}>{fmtCurrency(data.creatorsCorner.organicGmvPerCreator)} / creator</Text>
              <Text style={styles.splitMeta}>{fmtCurrency(data.creatorsCorner.organicAov)} avg order value</Text>
            </View>
          </View>
        </View>

        {/* Top managed creators */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>LEADERBOARD</Text>
          <Text style={styles.sectionTitle}>Top Creators Corner Creators</Text>
          {data.creatorsCorner.topCreators.length === 0 ? (
            <Text style={[styles.lbMeta, { marginTop: 10 }]}>No signed-creator activity in this period.</Text>
          ) : data.creatorsCorner.topCreators.map((c, i) => {
            const isTop3 = i < 3;
            return (
              <View key={c.name + i} style={isTop3 ? styles.lbRowTop : styles.lbRow}>
                <Text style={styles.lbRank}>{medal(i) || `${i + 1}.`}</Text>
                <View style={styles.lbBody}>
                  <Text style={styles.lbName}>@{c.name.replace('@','')} <Text style={[styles.lbMeta, { color: COLORS.muted, fontFamily: 'Inter' }]}>· {fmtNumber(c.videos)} videos</Text></Text>
                  <View style={styles.lbBarTrack}>
                    <View style={[styles.lbBarFill, { width: `${Math.min(100, c.pctOfManaged)}%` }]} />
                  </View>
                </View>
                <View style={styles.lbGmvBox}>
                  <Text style={styles.lbGmv}>{fmtCurrency(c.gmv)}</Text>
                  <Text style={styles.lbPct}>{fmtPct(c.pctOfManaged, 1)} of managed</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Top managed videos */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>CONTENT</Text>
          <Text style={styles.sectionTitle}>Top Videos From Your Signed Creators</Text>
          {data.creatorsCorner.topVideos.length === 0 ? (
            <Text style={[styles.lbMeta, { marginTop: 10 }]}>No signed-creator videos with sales in this period.</Text>
          ) : data.creatorsCorner.topVideos.map((v, i) => {
            const isTop3 = i < 3;
            const titleClipped = v.title.length > 56 ? v.title.slice(0, 56) + '...' : v.title;
            return (
              <View key={v.title + i} style={isTop3 ? styles.lbRowTop : styles.lbRow}>
                <Text style={styles.lbRank}>{medal(i) || `${i + 1}.`}</Text>
                <View style={styles.lbBody}>
                  <Text style={styles.lbName}>{titleClipped}</Text>
                  <Text style={styles.lbMeta}>by @{v.creator.replace('@','')} · {fmtNumber(v.orders)} orders</Text>
                </View>
                <View style={styles.lbGmvBox}>
                  <Text style={styles.lbGmv}>{fmtCurrency(v.gmv)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </Page>

      {/* ───────────── PAGE 5: Top Creators leaderboard ───────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHead brandName={data.brandName} periodLabel={data.periodLabel} />
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>LEADERBOARD</Text>
          <Text style={styles.sectionTitle}>Top Performing Creators</Text>
          {data.topCreators.length === 0 ? (
            <Text style={[styles.lbMeta, { marginTop: 10 }]}>No creator activity in this period.</Text>
          ) : data.topCreators.map((c, i) => {
            const isTop3 = i < 3;
            return (
              <View key={c.name + i} style={isTop3 ? styles.lbRowTop : styles.lbRow}>
                <Text style={styles.lbRank}>{medal(i) || `${i + 1}.`}</Text>
                <View style={styles.lbBody}>
                  <Text style={styles.lbName}>@{c.name.replace('@','')} <Text style={[styles.lbMeta, { color: COLORS.muted, fontFamily: 'Inter' }]}>· {fmtNumber(c.videos)} videos</Text></Text>
                  <View style={styles.lbBarTrack}>
                    <View style={[styles.lbBarFill, { width: `${Math.min(100, c.pctOfTotal * 4)}%` }]} />
                  </View>
                </View>
                <View style={styles.lbGmvBox}>
                  <Text style={styles.lbGmv}>{fmtCurrency(c.gmv)}</Text>
                  <Text style={styles.lbPct}>{fmtPct(c.pctOfTotal, 1)} of total</Text>
                </View>
              </View>
            );
          })}
        </View>
      </Page>

      {/* ───────────── PAGE 5: Top Videos leaderboard ───────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHead brandName={data.brandName} periodLabel={data.periodLabel} />
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>CONTENT</Text>
          <Text style={styles.sectionTitle}>Top Performing Videos</Text>
          {data.topVideos.length === 0 ? (
            <Text style={[styles.lbMeta, { marginTop: 10 }]}>No videos with sales in this period.</Text>
          ) : data.topVideos.map((v, i) => {
            const isTop3 = i < 3;
            const titleClipped = v.title.length > 56 ? v.title.slice(0, 56) + '...' : v.title;
            return (
              <View key={v.title + i} style={isTop3 ? styles.lbRowTop : styles.lbRow}>
                <Text style={styles.lbRank}>{medal(i) || `${i + 1}.`}</Text>
                <View style={styles.lbBody}>
                  <Text style={styles.lbName}>{titleClipped}</Text>
                  <Text style={styles.lbMeta}>by @{v.creator.replace('@','')} · {fmtNumber(v.orders)} orders</Text>
                </View>
                <View style={styles.lbGmvBox}>
                  <Text style={styles.lbGmv}>{fmtCurrency(v.gmv)}</Text>
                  <Text style={styles.lbPct}>{fmtPct(goalPctOfTotal(v.gmv), 1)} of total</Text>
                </View>
              </View>
            );
          })}
        </View>
      </Page>

      {/* ───────────── PAGE 6: Top Products leaderboard ───────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHead brandName={data.brandName} periodLabel={data.periodLabel} />
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>CATALOG</Text>
          <Text style={styles.sectionTitle}>Top Selling Products</Text>
          {data.topProducts.length === 0 ? (
            <Text style={[styles.lbMeta, { marginTop: 10 }]}>No product data in this period.</Text>
          ) : data.topProducts.map((p, i) => {
            const isTop3 = i < 3;
            const nameClipped = p.name.length > 70 ? p.name.slice(0, 70) + '...' : p.name;
            return (
              <View key={p.name + i} style={isTop3 ? styles.lbRowTop : styles.lbRow}>
                <Text style={styles.lbRank}>{medal(i) || `${i + 1}.`}</Text>
                <View style={styles.lbBody}>
                  <Text style={styles.lbName}>{nameClipped}</Text>
                  <Text style={styles.lbMeta}>{fmtNumber(p.orders)} orders</Text>
                </View>
                <View style={styles.lbGmvBox}>
                  <Text style={styles.lbGmv}>{fmtCurrency(p.gmv)}</Text>
                  <Text style={styles.lbPct}>{fmtPct(p.pctOfTotal, 1)} of total</Text>
                </View>
              </View>
            );
          })}
        </View>
      </Page>

      {/* ───────────── PAGE 7+: Product → Creator Breakdown ───────────── */}
      {data.productCreatorBreakdown.length > 0 && (
        <Page size="LETTER" style={styles.page}>
          <PageHead brandName={data.brandName} periodLabel={data.periodLabel} />
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>DEEP DIVE</Text>
            <Text style={styles.sectionTitle}>Product Breakdown by Creator</Text>
            <Text style={[styles.lbMeta, { marginBottom: 12 }]}>Top 5 products and the creators driving them</Text>
            {data.productCreatorBreakdown.map((p, i) => {
              const nameClipped = p.productName.length > 80 ? p.productName.slice(0, 80) + '...' : p.productName;
              return (
                <View key={p.productName + i} style={styles.pcCard} wrap={false}>
                  <View style={styles.pcRow}>
                    <Text style={styles.pcName}>{nameClipped}</Text>
                    <Text style={styles.pcPrice}>{fmtCurrency(p.productGmv)}</Text>
                  </View>
                  <Text style={styles.pcMeta}>{fmtNumber(p.productOrders)} orders · {fmtPct(p.pctOfTotal, 1)} of total GMV</Text>
                  {p.topCreators.length > 0 && (
                    <View style={styles.pcChipRow}>
                      <Text style={styles.pcChipLabel}>TOP CREATORS</Text>
                      {p.topCreators.map((c, j) => (
                        <View key={c.name + j} style={styles.pcChip}>
                          <Text style={styles.pcChipText}>{medal(j) || `${j + 1}.`} @{c.name.replace('@','')} {fmtCurrency(c.gmv)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Footer card on the last page */}
          <View style={styles.footerCard}>
            <Text style={styles.footerEyebrow}>PREPARED BY</Text>
            <Text style={styles.footerWordmark}>TEMPO</Text>
            <View style={styles.footerDivider} />
            <View style={styles.footerTagsRow}>
              <Text style={styles.footerTag}>TikTok Shop Marketing</Text>
              <Text style={styles.footerTag}>Creator Management</Text>
              <Text style={styles.footerTag}>Performance Analytics</Text>
            </View>
            <Text style={styles.footerStamp}>
              Report generated on {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        </Page>
      )}
    </Document>
  );
}
