/**
 * Brand Client Report — full PDF document.
 *
 * Downloadable companion to the web report at /r/[token]. The two MUST tell
 * the same story: same order, same claims, same callouts. They diverged once
 * (the web report was rebuilt agency-forward on 2026-08-05 while this file
 * still opened store-first), which meant the Download PDF button handed a
 * client a different narrative from the page they were reading.
 *
 * The agency leads. Store totals are CONTEXT and follow:
 *
 *   1. Cover                          — branded card + brand name + period
 *   2. WHAT WE DELIVERED              — roster GMV, posts, honesty callouts,
 *                                       activation, efficiency, roster leaders
 *   3. Store context                  — exec summary, highlights, GMV hero
 *   4. Store context                  — key metrics, managed split, new vs returning
 *   5. Store context                  — day of week + daily performance
 *   6. Top Creators                   — store-wide leaderboard
 *   7. Top Videos                     — store-wide
 *   8. Top Products                   — store-wide
 *   9. Product↔Creator Breakdown      — top 5 products → top 3 creators each
 *  10. Footer                         — Tempo branding
 *
 * Uses Tempo's brand colors (pink #E91E8C primary, dark #1A1B3A ink) instead
 * of the old dash's green palette. Green is reserved for positive deltas.
 */
import { Document, Page, Text, View, StyleSheet, Font, Svg, Circle, Path } from '@react-pdf/renderer';
import path from 'node:path';
import type { BrandClientReportData } from '@/lib/data/brand-client-report';
import { estimateDeliveredSpend, spendCaveats } from '@/lib/data/delivered-spend';

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
  // Field absent from an older frozen snapshot: no comparison exists to show.
  kpiDeltaNone:  { fontSize: 8, color: COLORS.faint, fontFamily: 'Inter', fontWeight: 700, marginTop: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },

  // ── Honesty callouts, mirroring the web report's amber notes
  calloutWarn:     { marginTop: 10, backgroundColor: '#FBF1DC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  spendBox:        { marginTop: 10, backgroundColor: '#F6F6FB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  spendLead:       { fontSize: 10, lineHeight: 1.5, color: COLORS.ink, fontFamily: 'Inter', fontWeight: 600 },
  spendMeta:       { fontSize: 8, lineHeight: 1.5, color: COLORS.muted, marginTop: 5 },
  calloutWarnText: { fontSize: 9, lineHeight: 1.55, color: '#8A5A08', fontFamily: 'Inter', fontWeight: 600 },

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
  // Granular block (mig 152). Row style deliberately COPIES lbRow rather than
  // inventing one: a repeating row with a border is the shape that produced
  // "unsupported number" garbage geometry in the invoice PDF, and lbRow is the
  // variant already proven to paginate cleanly in this document.
  gRow:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: COLORS.ruleSoft },
  gHead:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLORS.rule, backgroundColor: '#FFFFFF' },
  gHeadCell:      { fontSize: 6.5, fontFamily: 'Inter', fontWeight: 700, color: COLORS.muted, letterSpacing: 0.6 },
  gCell:          { fontSize: 8, fontFamily: 'Inter', color: COLORS.ink, lineHeight: 1.4 },
  gCellMuted:     { fontSize: 8, fontFamily: 'Inter', color: COLORS.muted, lineHeight: 1.4 },
  gTag:           { fontSize: 6.5, fontFamily: 'Inter', fontWeight: 700, color: '#5B4BB8', lineHeight: 1.4 },
  gStatRow:       { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  gStat:          { width: '33%', marginBottom: 8 },
  gStatLabel:     { fontSize: 6.5, fontFamily: 'Inter', fontWeight: 700, color: COLORS.muted, letterSpacing: 0.6 },
  gStatValue:     { fontSize: 13, fontFamily: 'Inter', fontWeight: 700, color: COLORS.ink, marginTop: 2 },
  gStatNote:      { fontSize: 6.5, fontFamily: 'Inter', color: COLORS.muted, marginTop: 1, lineHeight: 1.35 },
  gBarRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  gBarLabel:      { width: 52, fontSize: 8, fontFamily: 'Inter', fontWeight: 700, color: COLORS.ink },
  gBarTrack:      { flex: 1, height: 12, borderRadius: 3, backgroundColor: COLORS.bg },
  gBarFill:       { height: 12, borderRadius: 3 },
  // Widened after adding the share to gBarMeta: at 62/56 the value and the
  // percentage collided ("$5,9795.1%") and "941 videos" wrapped onto a second
  // line. paddingLeft guarantees a gap even when both run to full width.
  gBarVal:        { width: 66, textAlign: 'right', fontSize: 8, fontFamily: 'Inter', fontWeight: 700, color: COLORS.ink },
  gBarMeta:       { width: 92, paddingLeft: 6, textAlign: 'right', fontSize: 7, fontFamily: 'Inter', color: COLORS.muted },
  lbRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.ruleSoft },
  lbRowTop:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, marginBottom: 4, borderRadius: 8, paddingHorizontal: 12, backgroundColor: COLORS.pinkSoft, borderWidth: 1, borderColor: '#F8C0DD' },
  lbRank:         { width: 22, fontSize: 10, color: COLORS.faint, fontFamily: 'Inter', fontWeight: 700 },
  lbBody:         { flex: 1 },
  lbName:         { fontSize: 11, color: COLORS.ink, fontFamily: 'Inter', fontWeight: 700 },
  lbMeta:         { fontSize: 8, color: COLORS.muted, marginTop: 2 },
  lbGmv:          { fontSize: 12, color: COLORS.pink, fontFamily: 'Inter', fontWeight: 700, textAlign: 'right' },
  lbGmvBox:       { width: 100, alignItems: 'flex-end' },
  lbPct:          { fontSize: 7, color: COLORS.muted, marginTop: 2, textAlign: 'right' },
  vsRow:    { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
  vsLabel:  { flex: 1, fontSize: 9, fontFamily: 'Inter', fontWeight: 700, color: COLORS.ink },
  vsPct:    { width: 52, textAlign: 'right', fontSize: 12, fontFamily: 'Inter', fontWeight: 800, color: COLORS.pinkDeep },
  vsOurs:   { width: 74, textAlign: 'right', fontSize: 9, fontFamily: 'Inter', fontWeight: 700, color: COLORS.ink },
  vsTheirs: { width: 82, textAlign: 'right', fontSize: 8, fontFamily: 'Inter', fontWeight: 400, color: COLORS.muted },
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

/**
 * Snapshots are FROZEN, so a report created before a field existed will never
 * gain it, and `undefined` flows through arithmetic into NaN on a document a
 * client opens. This shipped for real on the web report (fixed in 68eee75);
 * the PDF renders from the SAME snapshots and would fail identically.
 * Not-a-finite-number means ABSENT.
 */
function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** null when there is no prior baseline to divide by. */
function pctChangeSafe(curr: number, prior: number): number | null {
  if (!Number.isFinite(curr) || !Number.isFinite(prior) || prior === 0) return null;
  return ((curr - prior) / prior) * 100;
}

/** `undefined` (field absent from an old snapshot) renders as nothing, which
 *  is distinct from `null` ("from zero") rendering as NEW. */
function DeltaPill({ pct }: { pct?: number | null }) {
  const p = finite(pct);
  if (p === null) {
    return pct === null ? <Text style={styles.kpiDeltaNew}>NEW</Text> : <Text style={styles.kpiDeltaNone}>—</Text>;
  }
  const rounded = Math.round(Math.abs(p));
  if (p >= 0) return <Text style={styles.kpiDeltaPos}>+{rounded}%</Text>;
  return <Text style={styles.kpiDeltaNeg}>-{rounded}%</Text>;
}

// ── Main Document ──────────────────────────────────────────────────

export function BrandClientReportPDF({
  data,
  reportType = 'performance',
  movers = null,
}: {
  data: BrandClientReportData;
  /** Which template. The PDF must carry the same sections as the web view for
   *  the same link, or a client reading the attachment sees a different report
   *  from the one they were sent. */
  reportType?: 'performance' | 'weekly' | 'monthly';
  /** Period comparison, not period content, so it arrives beside `data`
   *  rather than inside it. Null on every template except weekly. */
  movers?: {
    gained: number; lost: number; netChange: number;
    started: number; stopped: number;
    list: { handle: string; name: string | null; cur: number; prior: number; change: number; movement: string }[];
  } | null;
}) {
  const isMonthly = reportType === 'monthly';
  const isWeekly = reportType === 'weekly';
  const goalPctOfTotal = (n: number) => data.totalGmv > 0 ? (n / data.totalGmv) * 100 : 0;
  const peakDow = data.dayOfWeek.reduce((m, d) => Math.max(m, d.gmv), 0);

  // Granular block (mig 152). Absent on every snapshot frozen before it, so
  // its presence gates the sections exactly as it does on the web report.
  const gran = data.granular;
  const vintageRows = gran
    ? [
        ...gran.vintage.map((v) => ({ label: v.label, videos: v.videos, gmv: v.gmv, isOlder: false })),
        ...(gran.vintageOlder.videos > 0 || gran.vintageOlder.gmv > 0
          ? [{ label: 'Earlier', videos: gran.vintageOlder.videos, gmv: gran.vintageOlder.gmv, isOlder: true }]
          : []),
      ]
    : [];
  const vintageMax = Math.max(...vintageRows.map((v) => v.gmv), 1);
  // Denominator for the share printed on each row: the roster's video GMV,
  // which is what these buckets partition.
  const vintageTotal = gran ? (Number(gran.newVideo.totalGmv) || 0) : 0;
  // Creators who posted or sold. The PDF is linear and cannot collapse a tail,
  // so it carries the active set and says how many it left out.
  const activeCreators = gran ? gran.creators.filter((c) => c.gmv > 0 || c.postsPublished > 0) : [];

  // ── Agency-page derivations, mirroring the web report exactly so the two
  // artifacts cannot disagree. Every one is guarded: these fields postdate
  // most of the frozen snapshots this document renders from.
  const cc = data.creatorsCorner;
  const priorVideos = finite(cc.priorVideos);
  const rosterVideoPct =
    finite(cc.videoChangePct) ?? (priorVideos !== null ? pctChangeSafe(cc.videos, priorVideos) : undefined);

  const ccGmvPct = finite(cc.gmvChangePct);
  const storeGmvPct = finite(data.gmvChangePct);
  const divergence = ccGmvPct !== null && storeGmvPct !== null && ccGmvPct < -2 && storeGmvPct > 2;

  const topManaged = cc.topCreators[0] ?? null;
  const topShare = topManaged && cc.gmv > 0 ? (topManaged.gmv / cc.gmv) * 100 : 0;
  const concentrated = topShare >= 40;

  /**
   * ⚠️ ONE SOURCE for every roster-creator count, identical to report-view.
   *
   * cc.activeCreatorCount collapses POSTED and SOLD into one word, and the
   * creator list below is counted on a different roster rule (on the roster
   * DURING the window, versus on it today) — which had the PDF printing two
   * different totals for "signed creators" pages apart. When the creator list
   * is present every count is derived from it.
   */
  const act = data.activity;
  const rosterAct = gran
    ? {
        signed: gran.creators.length,
        posted: gran.creators.filter((c) => c.postsPublished > 0).length,
        sold: gran.creators.filter((c) => c.gmv > 0).length,
        soldNotPosted: gran.creators.filter((c) => c.gmv > 0 && c.postsPublished === 0).length,
        departed: gran.creators.filter((c) => c.departed === true).length,
      }
    : act
      ? {
          signed: cc.signedCreatorCount,
          posted: act.rosterPosted,
          sold: act.rosterSold,
          soldNotPosted: act.rosterSoldNotPosted,
          departed: act.rosterDeparted,
        }
      : null;

  /**
   * ⚠️ data.activeCreators and data.managed/organic.creatorCount are
   * count(distinct handle) over the TikTok export with NO gmv filter, so they
   * count every creator who APPEARS in the file. On jiyu 2026-08 that read
   * 40,954 store creators and 247 roster creators, against 4,216 who posted
   * and 930 who sold — and it also poisoned every ratio built on it (GMV per
   * creator read $10.43; new-vs-returning divided by it).
   *
   * storeSold is the honest denominator: creators who actually earned. Where
   * it is unavailable (a snapshot frozen before migration 165) the figure is
   * OMITTED rather than printed wrong.
   */
  /**
   * Month in review: contracted posts against delivered.
   *
   * ⚠️ RETAINED CREATORS ONLY. Affiliate-only creators carry no post
   * commitment (~63% of the roster) and counting them would invent a shortfall
   * against a target nobody agreed to.
   *
   * ⚠️ The quota is MONTHLY, so a PART month reads short against it no matter
   * what — jiyu 01-26 August showed 830 of 1,731 (48%) largely because four
   * days had not happened. The window is NOT pro-rated (that would be the same
   * apportionment this report refuses everywhere else); an incomplete month
   * says so instead.
   */
  const contracted = gran
    ? gran.creators.filter((c) => !c.isAffiliate && !c.departed && (c.quota ?? 0) > 0)
    : [];
  const postsOwed = contracted.reduce((s, c) => s + (c.quota ?? 0), 0);
  const postsDelivered = contracted.reduce((s, c) => s + c.postsPublished, 0);
  const metQuota = contracted.filter((c) => c.postsPublished >= (c.quota ?? 0)).length;
  const lastOfMonth = new Date(
    Date.UTC(data.endDate.getUTCFullYear(), data.endDate.getUTCMonth() + 1, 0),
  );
  const wholeMonth =
    data.startDate.getUTCDate() === 1 &&
    data.endDate.getUTCDate() === lastOfMonth.getUTCDate() &&
    data.startDate.getUTCMonth() === data.endDate.getUTCMonth();
  const daysCovered =
    Math.round((data.endDate.getTime() - data.startDate.getTime()) / 86_400_000) + 1;
  // Null on any window that is not a whole calendar month, by design.
  const spend = gran ? estimateDeliveredSpend(gran.creators, wholeMonth) : null;
  const spendNotes =
    spend && gran
      ? spendCaveats(spend.defaultQuotaShare, gran.roster.retainerHistoryExact !== false)
      : [];

  const storeSold = data.activity ? data.activity.storeCreatorsSold : null;
  const storePosted = data.activity ? data.activity.storeCreatorsPosted : null;

  const ch = data.channels;
  const chTotal = ch ? ch.rosterVideoGmv + ch.rosterLiveGmv + ch.rosterCardGmv : 0;
  const agree = data.agreementSplit;
  const agreeTotal = agree ? agree.retainerGmv + agree.affiliateGmv : 0;

  const vsShopRaw = {
    gmvPct: act && rosterAct ? cc.pctOfStoreGmv : null,
    creatorPct:
      act && rosterAct && act.storeCreatorsPosted > 0
        ? (rosterAct.posted / act.storeCreatorsPosted) * 100
        : null,
  };

  /**
   * How much more of the sales we produce than our share of creators would
   * imply. Only meaningful when the input share is genuinely small and the
   * output share genuinely larger — below 1.5x it is not a story, and a
   * near-zero denominator makes the multiple explode.
   */
  const leverage = (() => {
    const g = vsShopRaw.gmvPct;
    const c = vsShopRaw.creatorPct;
    return c !== null && g !== null && c >= 0.05 && g / c >= 1.5 ? g / c : null;
  })();

  /** Our share of the whole shop, on definitions that are stated. */
  const vsShop =
    act && rosterAct
      ? [
          { label: 'GMV', ours: fmtCurrency(cc.gmv), theirs: fmtCurrency(data.totalGmv), pct: cc.pctOfStoreGmv },
          {
            label: 'Creators posting',
            ours: fmtNumber(rosterAct.posted),
            theirs: fmtNumber(act.storeCreatorsPosted),
            pct: act.storeCreatorsPosted > 0 ? (rosterAct.posted / act.storeCreatorsPosted) * 100 : 0,
          },
          {
            label: 'Posts published',
            ours: fmtNumber(cc.videos),
            theirs: fmtNumber(data.totalVideos),
            pct: data.totalVideos > 0 ? (cc.videos / data.totalVideos) * 100 : 0,
          },
          ...(ch && ch.storeLiveGmv > 0
            ? [
                {
                  label: 'Live GMV',
                  ours: fmtCurrency(ch.rosterLiveGmv),
                  theirs: fmtCurrency(ch.storeLiveGmv),
                  pct: (ch.rosterLiveGmv / ch.storeLiveGmv) * 100,
                },
              ]
            : []),
        ]
      : [];

  return (
    <Document
      title={`${data.brandName} — Weekly Report (${data.periodLabel})`}
      author="Tempo"
      subject="Weekly performance report"
    >
      {/* ───────────── PAGE 1: Cover ───────────── */}
      <Page size="LETTER" style={styles.coverPage}>
        <View style={styles.coverCard} wrap={false}>
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
      </Page>

      {/* ───────── PAGE 2: What we delivered. The agency leads. ───────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHead brandName={data.brandName} periodLabel={data.periodLabel} />

        {/* Contribution headline + trend. Mirrors the web report's opening
            claim so the two artifacts cannot tell different stories. */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>WHAT WE DELIVERED</Text>
          <Text style={styles.sectionTitle}>
            Your signed roster produced {fmtCurrency(data.creatorsCorner.gmv)} this period
          </Text>
          <View style={styles.splitRow} wrap={false}>
            <View style={styles.splitLeftCard}>
              <Text style={[styles.splitLabel, { color: COLORS.pinkDeep }]}>ROSTER GMV</Text>
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
              <Text style={[styles.splitLabel, { color: COLORS.muted }]}>POSTS PUBLISHED</Text>
              <Text style={[styles.splitGmv, { color: COLORS.ink }]}>{fmtNumber(data.creatorsCorner.videos)}</Text>
              <Text style={styles.splitMeta}>
                by {fmtNumber(rosterAct ? rosterAct.posted : cc.activeCreatorCount)} signed creators who posted
              </Text>
              <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.splitMeta, { marginRight: 6 }]}>vs prior period</Text>
                <DeltaPill pct={rosterVideoPct} />
              </View>
            </View>
          </View>
        </View>

        {/* The two honesty callouts the web report carries. A PDF that only
            ever reads well is a PDF nobody trusts. */}
        {divergence && (
          <View style={styles.calloutWarn}>
            <Text style={styles.calloutWarnText}>
              We were down this period while the store was up. Roster GMV fell{' '}
              {fmtPct(Math.abs(data.creatorsCorner.gmvChangePct!), 1)} against a store that grew{' '}
              {fmtPct(data.gmvChangePct!, 1)}.
              {rosterAct
                ? ` ${fmtNumber(rosterAct.posted)} creators posted and ${fmtNumber(rosterAct.sold)} made sales, so this is output per creator rather than roster size.`
                : data.creatorsCorner.priorCreatorCount === data.creatorsCorner.activeCreatorCount
                  ? ` The same ${fmtNumber(data.creatorsCorner.activeCreatorCount)} creators were active in both periods, so this is output per creator, not roster size.`
                  : ` Active creators went from ${fmtNumber(data.creatorsCorner.priorCreatorCount)} to ${fmtNumber(data.creatorsCorner.activeCreatorCount)}.`}
            </Text>
          </View>
        )}
        {concentrated && topManaged && (
          <View style={styles.calloutWarn}>
            <Text style={styles.calloutWarnText}>
              @{topManaged.name.replace('@', '')} produced {fmtPct(topShare, 1)} of roster GMV this period.
              Concentration at that level is the main risk to period-to-period stability, and broadening
              it is an active priority for this account.
            </Text>
          </View>
        )}

        {/* Roster activation */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>ROSTER ACTIVATION</Text>
          <Text style={styles.sectionTitle}>Signed Creators At Work</Text>
          {rosterAct ? (
            <>
              <Text style={styles.splitMeta}>
                {fmtNumber(rosterAct.posted)} of {fmtNumber(rosterAct.signed)} signed creators posted this
                period
                {rosterAct.signed > 0
                  ? ` · ${fmtPct((rosterAct.posted / rosterAct.signed) * 100, 1)} activation`
                  : ''}
                {' · '}
                {fmtNumber(rosterAct.sold)} made sales
                {cc.newlyActivatedCount > 0 ? ` · ${fmtNumber(cc.newlyActivatedCount)} newly activated` : ''}
                {rosterAct.departed > 0 ? ` · ${fmtNumber(rosterAct.departed)} left the roster` : ''}
              </Text>
              {/* Activation is measured on POSTING. Creators still earning from
                  older content are revenue, not work done this period. */}
              <Text style={[styles.splitMeta, { marginTop: 3 }]}>
                {rosterAct.soldNotPosted > 0
                  ? `${fmtNumber(rosterAct.soldNotPosted)} of those sales came from creators who did not post this period, earning from content published earlier.`
                  : 'Every creator who made sales this period also posted.'}
              </Text>
            </>
          ) : (
            <Text style={styles.splitMeta}>
              {fmtNumber(data.creatorsCorner.activeCreatorCount)} of {fmtNumber(data.creatorsCorner.signedCreatorCount)} signed creators were active this period
              {data.creatorsCorner.signedCreatorCount > 0
                ? ` · ${fmtPct((data.creatorsCorner.activeCreatorCount / data.creatorsCorner.signedCreatorCount) * 100, 1)} activation`
                : ''}
              {data.creatorsCorner.newlyActivatedCount > 0
                ? ` · ${fmtNumber(data.creatorsCorner.newlyActivatedCount)} newly activated`
                : ''}
            </Text>
          )}
        </View>

        {/* ── Week over week: what moved ───────────────────────────────── */}
        {/* ⚠️ GROSS UP AND GROSS DOWN, never "N creators explain X%". A net
            figure is the residue of two opposing forces and one percentage
            against it hides their size — jiyu's week was $6,169 gained against
            $9,098 lost for a net -$2,930. And a creator who went from nothing
            to something is NEW, not "up ∞%". */}
        {isWeekly && movers && movers.list.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>WHAT MOVED</Text>
            <Text style={styles.sectionTitle}>
              {fmtCurrency(Math.abs(movers.gained))} added, {fmtCurrency(Math.abs(movers.lost))} given
              back
            </Text>
            <Text style={styles.splitMeta}>
              A net {movers.netChange >= 0 ? 'gain' : 'fall'} of{' '}
              {fmtCurrency(Math.abs(movers.netChange))} on the period before
              {movers.started > 0 ? ` · ${fmtNumber(movers.started)} sold for the first time` : ''}
              {movers.stopped > 0 ? ` · ${fmtNumber(movers.stopped)} who sold before did not` : ''}
            </Text>
            {movers.list.map((c) => (
              <View key={c.handle} style={styles.vsRow} wrap={false}>
                <Text style={styles.vsLabel}>
                  {c.name && c.name.trim() ? c.name : `@${c.handle.replace('@', '')}`}
                </Text>
                <Text style={styles.vsPct}>
                  {c.movement === 'new'
                    ? 'NEW'
                    : c.movement === 'stopped'
                      ? 'STOPPED'
                      : `${c.change >= 0 ? '+' : '-'}${fmtCurrency(Math.abs(c.change))}`}
                </Text>
                <Text style={styles.vsOurs}>{c.prior > 0 ? fmtCurrency(c.prior) : '—'}</Text>
                <Text style={styles.vsTheirs}>to {c.cur > 0 ? fmtCurrency(c.cur) : '—'}</Text>
              </View>
            ))}
            <Text style={[styles.splitMeta, { marginTop: 4 }]}>
              The {fmtNumber(movers.list.length)} largest movements by dollar change. Every signed
              creator who sold in either period is counted in the totals above.
            </Text>
          </View>
        )}

        {/* ── Month in review: what was committed against what landed ──── */}
        {isMonthly && contracted.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>WHAT YOU COMMITTED, WHAT WE DELIVERED</Text>
            <Text style={styles.sectionTitle}>
              {fmtNumber(postsDelivered)} of {fmtNumber(postsOwed)} contracted posts
              {postsOwed > 0 ? ` · ${fmtPct((postsDelivered / postsOwed) * 100, 0)}` : ''}
            </Text>
            <Text style={styles.splitMeta}>
              {fmtNumber(metQuota)} of {fmtNumber(contracted.length)} creators met their commitment
              {contracted.length - metQuota > 0
                ? ` · ${fmtNumber(contracted.length - metQuota)} fell short`
                : ''}
              {gran && gran.roster.monthlyRetainerBudget > 0
                ? ` · ${fmtCurrency(gran.roster.monthlyRetainerBudget)}/mo committed`
                : ''}
              {' · committed before delivery'}
            </Text>
            {spend && (
              <View style={styles.spendBox}>
                <Text style={styles.spendLead}>
                  Estimated creator spend {fmtCurrency(spend.estimated)} of the{' '}
                  {fmtCurrency(spend.budget)} committed
                  {spend.pctOfBudget !== null ? `, or ${fmtPct(spend.pctOfBudget, 0)}` : ''}, once
                  each creator&rsquo;s retainer is scaled by what they actually published.
                </Text>
                <Text style={styles.spendMeta}>
                  {fmtNumber(spend.fullyDelivered)} of {fmtNumber(spend.creators)} retained creators
                  delivered their full agreed count and are counted at 100%; nobody is counted above
                  it, so overdelivery does not raise the figure.
                </Text>
                {spendNotes.length > 0 && (
                  <Text style={styles.spendMeta}>
                    An estimate, not a payment record: {spendNotes.join('; ')}. Treat the gap as an
                    indication of delivery, not as money unspent.
                  </Text>
                )}
              </View>
            )}
            {!wholeMonth && (
              <View style={styles.calloutWarn}>
                <Text style={styles.calloutWarnText}>
                  This period covers {fmtNumber(daysCovered)} of {fmtNumber(lastOfMonth.getUTCDate())}{' '}
                  days. The post targets above are monthly, so a part-month will always read short
                  against them. Delivery is only comparable to the commitment over a complete month.
                </Text>
              </View>
            )}
            <Text style={[styles.splitMeta, { marginTop: 4 }]}>
              Counts only creators on a retainer with an agreed monthly post target. Affiliate-only
              creators take commission and carry no post commitment.
            </Text>
          </View>
        )}

        {/* ── Month in review: content we started vs content that predates us ─ */}
        {isMonthly && gran?.netNew && gran.netNew.totalGmv > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>CONTENT WE STARTED</Text>
            <Text style={styles.sectionTitle}>
              {fmtCurrency(gran.netNew.netNewGmv)} from videos posted since we began
            </Text>
            <Text style={styles.splitMeta}>
              {fmtPct((gran.netNew.netNewGmv / gran.netNew.totalGmv) * 100, 1)} of your roster&apos;s
              revenue this period · {fmtCurrency(gran.netNew.preCcGmv)} came from content posted before
              we started with each creator, still selling.
            </Text>
          </View>
        )}

        {/* ⚠️ REPLACES "Managed vs Organic, Per Creator". That block compared
            AOV and GMV-per-creator against everyone else; across seven brands
            the AOV gap was $1-6 and on catakor the roster read WORSE ($43.44
            against $44.09). Share-of-shop makes the same argument honestly. */}
        {vsShop.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>EFFICIENCY</Text>
            <Text style={styles.sectionTitle}>Creators Corner vs your whole shop</Text>
            {/* ⚠️ NOT a bar per metric. Four bars at wildly different scales
                made the strongest fact — a 2-3% sliver of creators producing
                most of the sales — render as the SHORTEST bar on the page,
                which argues against us. The gap between a small input and a
                large output is the point, and a bar shows each metric alone,
                never the gap. */}
            {leverage !== null && vsShopRaw.creatorPct !== null && vsShopRaw.gmvPct !== null && (
              <Text style={[styles.summaryBody, { marginTop: 2, marginBottom: 6 }]}>
                We are <Text style={styles.highlightPink}>{fmtPct(vsShopRaw.creatorPct, 1)}</Text> of the
                creators posting on your shop, and we produced{' '}
                <Text style={styles.highlightPink}>{fmtPct(vsShopRaw.gmvPct, 1)}</Text> of its sales —{' '}
                <Text style={styles.highlightInk}>{leverage.toFixed(1)}x</Text> the sales share you would
                expect from our share of creators.
              </Text>
            )}
            {vsShop.map((row) => (
              <View key={row.label} style={styles.vsRow} wrap={false}>
                <Text style={styles.vsLabel}>{row.label}</Text>
                <Text style={styles.vsPct}>{fmtPct(row.pct, 1)}</Text>
                <Text style={styles.vsOurs}>{row.ours}</Text>
                <Text style={styles.vsTheirs}>of {row.theirs}</Text>
              </View>
            ))}
            <Text style={[styles.splitMeta, { marginTop: 4 }]}>
              Each figure is ours against your whole TikTok Shop, including creators we do not manage.
            </Text>
          </View>
        )}

        {/* Where the roster's GMV came from. The channel split is computed on
            the same membership rule as the roster GMV above, so the three add
            to that total exactly. */}
        {(agreeTotal > 0 || chTotal > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>WHERE OUR GMV CAME FROM</Text>
            <View style={styles.splitRow} wrap={false}>
              {agree && agreeTotal > 0 && (
                <View style={styles.splitLeftCard}>
                  <Text style={[styles.splitLabel, { color: COLORS.pinkDeep }]}>RETAINER VS AFFILIATE-ONLY</Text>
                  <Text style={[styles.splitGmv, { color: COLORS.pinkDeep, fontSize: 14 }]}>
                    {fmtCurrency(agree.retainerGmv)} retainer
                  </Text>
                  <Text style={styles.splitMeta}>
                    {fmtCurrency(agree.affiliateGmv)} from affiliate-only creators, who carry no retainer and
                    no post requirement
                  </Text>
                </View>
              )}
              {ch && chTotal > 0 && (
                <View style={styles.splitRightCard}>
                  <Text style={[styles.splitLabel, { color: COLORS.muted }]}>VIDEO / LIVE / CARD</Text>
                  <Text style={[styles.splitGmv, { color: COLORS.ink, fontSize: 14 }]}>
                    {fmtCurrency(ch.rosterVideoGmv)} video
                  </Text>
                  <Text style={styles.splitMeta}>
                    {fmtCurrency(ch.rosterLiveGmv)} live across {fmtNumber(ch.rosterLiveStreams)} stream
                    {ch.rosterLiveStreams === 1 ? '' : 's'} · {fmtCurrency(ch.rosterCardGmv)} product card
                  </Text>
                </View>
              )}
            </View>
            {ch && chTotal > 0 && (
              <Text style={[styles.splitMeta, { marginTop: 4 }]}>
                The three add to {fmtCurrency(chTotal)}
                {Math.abs(chTotal - cc.gmv) < 1 ? ', exactly the roster total above' : ''}.
                {data.topLive && data.topLive.length > 0
                  ? ` Live selling is led by @${data.topLive[0].handle} with ${fmtCurrency(data.topLive[0].liveGmv)} across ${fmtNumber(data.topLive[0].lives)} stream${data.topLive[0].lives === 1 ? '' : 's'}.`
                  : ''}
              </Text>
            )}
          </View>
        )}

        {/* ⚠️ CUT: "Top Creators Corner Creators". It was the first rows of
            "Every creator we run for you", rendered a second time with
            different columns — the same duplication removed from the web
            report. The full table carries it. */}

        {/* Top managed videos */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>CONTENT</Text>
          <Text style={styles.sectionTitle}>Top Videos From Your Signed Creators</Text>
          {data.creatorsCorner.topVideos.length === 0 ? (
            <Text style={[styles.lbMeta, { marginTop: 10 }]}>No signed-creator videos with sales in this period.</Text>
          ) : data.creatorsCorner.topVideos.slice(0, 5).map((v, i) => {
            const isTop3 = i < 3;
            const titleClipped = v.title.length > 56 ? v.title.slice(0, 56) + '...' : v.title;
            return (
              <View key={v.title + i} style={isTop3 ? styles.lbRowTop : styles.lbRow} wrap={false}>
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

      {/* ── PAGE 2a: The roster we run + where the sales came from ────
          Its OWN page, not appended to the agency page. Measured on the first
          render: the six-stat grid split across a page break and page 4 opened
          with "$48,450 monthly commitment 193 1,117" — values orphaned from
          the labels left behind on page 3. A block whose labels and numbers
          can separate is worse than no block. */}
      {gran && (
        <Page size="LETTER" style={styles.page}>
          <PageHead brandName={data.brandName} periodLabel={data.periodLabel} />
          {/* Roster composition + investment. Mirrors the web report's
              InvestmentStrip. "Affiliate-only" is stated because 142 signed
              creators overstates the commitment on both sides — only some carry
              a retainer, and the rest have no post obligation at all. */}
          {gran && (
            <View style={styles.section}>
              <Text style={styles.sectionEyebrow}>THE ROSTER WE RUN</Text>
              <View style={styles.gStatRow}>
                <View style={styles.gStat}>
                  <Text style={styles.gStatLabel}>ON RETAINER</Text>
                  <Text style={styles.gStatValue}>{fmtNumber(gran.roster.onRetainer)}</Text>
                </View>
                <View style={styles.gStat}>
                  <Text style={styles.gStatLabel}>AFFILIATE-ONLY</Text>
                  <Text style={styles.gStatValue}>{fmtNumber(gran.roster.affiliateOnly)}</Text>
                  <Text style={styles.gStatNote}>commission, no post requirement</Text>
                </View>
                {gran.roster.monthlyRetainerBudget > 0 && (
                  <View style={styles.gStat}>
                    <Text style={styles.gStatLabel}>RETAINER BUDGET</Text>
                    <Text style={styles.gStatValue}>{fmtCurrency(gran.roster.monthlyRetainerBudget)}</Text>
                    <Text style={styles.gStatNote}>monthly commitment</Text>
                  </View>
                )}
                <View style={styles.gStat}>
                  <Text style={styles.gStatLabel}>VIDEOS EARNING</Text>
                  <Text style={styles.gStatValue}>{fmtNumber(gran.videoCounts.videosEarning)}</Text>
                  <Text style={styles.gStatNote}>including earlier posts</Text>
                </View>
              </View>
            </View>
          )}

          {/* Video vintage. Grouped by the month each video was POSTED, counting
              only sales made in this period — the same cut as the web report. */}
          {gran && vintageRows.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionEyebrow}>WHERE OUR SALES CAME FROM</Text>
              <Text style={styles.sectionTitle}>
                {fmtCurrency(gran.newVideo.gmv30d)} came from videos posted in the last 30 days
              </Text>
              {vintageRows.map((v) => (
                <View key={v.label} style={styles.gBarRow} wrap={false}>
                  <Text style={styles.gBarLabel}>{v.label}</Text>
                  <View style={styles.gBarTrack}>
                    <View
                      style={[
                        styles.gBarFill,
                        {
                          width: `${Math.max(2, (v.gmv / vintageMax) * 100)}%`,
                          backgroundColor: v.isOlder ? COLORS.rule : COLORS.pinkDeep,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.gBarVal}>{fmtCurrency(v.gmv)}</Text>
                  <Text style={styles.gBarMeta}>
                    {vintageTotal > 0 ? `${fmtPct((v.gmv / vintageTotal) * 100, 1)} · ` : ''}
                    {fmtNumber(v.videos)} videos
                  </Text>
                </View>
              ))}
              <Text style={[styles.gStatNote, { marginTop: 6 }]}>
                Content earns for roughly 90 days, so the previous month is usually the peak.
                {gran.newVideo.unknownPostDateGmv > 0
                  ? ` ${fmtCurrency(gran.newVideo.unknownPostDateGmv)} came from videos with no recorded post date and sits in neither group.`
                  : ''}
              </Text>
            </View>
          )}
        </Page>
      )}

      {/* ── PAGE 2b: Every creator, in full ───────────────────────────── */}
      {gran && activeCreators.length > 0 && (
        <Page size="LETTER" style={styles.page}>
          <PageHead brandName={data.brandName} periodLabel={data.periodLabel} />
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>THE CREATORS WHO DELIVERED</Text>
            <Text style={styles.sectionTitle}>
              All {fmtNumber(gran.creators.length)} signed creators
            </Text>
            <Text style={[styles.gStatNote, { marginBottom: 6 }]}>
              {fmtNumber(gran.roster.affiliateOnly)} are affiliate-only: they take commission and carry
              no post requirement, so no target is shown for them.
            </Text>
            {/* The PDF lists only creators who posted or sold. On Lemme that is
                48 of 142 and turns six pages of mostly-blank rows into two.
                The count dropped is STATED — a silent truncation reads as
                "this is everyone", and the web report carries the full list. */}
            {activeCreators.length < gran.creators.length && (
              <Text style={[styles.gStatNote, { marginBottom: 6 }]}>
                Showing the {fmtNumber(activeCreators.length)} who posted or sold this period.
                The remaining {fmtNumber(gran.creators.length - activeCreators.length)} had no
                activity and are listed in full on the web version of this report.
              </Text>
            )}
            {/* Flex values sum to 8.8 and mirror the row below EXACTLY. A header
                whose flex differs from its rows misaligns silently in @react-pdf
                — there is no layout error, the columns just drift. */}
            <View style={styles.gHead} wrap={false} fixed>
              <Text style={[styles.gHeadCell, { flex: 1.7 }]}>CREATOR</Text>
              <Text style={[styles.gHeadCell, { flex: 1.7 }]}>TIKTOK</Text>
              <Text style={[styles.gHeadCell, { flex: 1.3 }]}>AGREEMENT</Text>
              <Text style={[styles.gHeadCell, { flex: 1.1, textAlign: 'right' }]}>AGREED</Text>
              <Text style={[styles.gHeadCell, { flex: 0.9, textAlign: 'right' }]}>POSTS</Text>
              <Text style={[styles.gHeadCell, { flex: 0.9, textAlign: 'right' }]}>ORDERS</Text>
              <Text style={[styles.gHeadCell, { flex: 1.2, textAlign: 'right' }]}>GMV</Text>
            </View>
            {activeCreators.map((c, i) => (
              <View key={(c.handle ?? c.name) + i} style={styles.gRow} wrap={false}>
                <Text style={[styles.gCell, { flex: 1.7 }]}>
                  {c.realName?.trim() ? c.realName : `@${(c.handle ?? c.name).replace(/^@+/, '')}`}
                </Text>
                {/* Em dash, not @Name: a creator with no handle in any source
                    would otherwise render a TikTok handle that does not exist. */}
                <Text style={[styles.gCellMuted, { flex: 1.7 }]}>
                  {c.handle
                    ? `@${c.handle.replace(/^@+/, '')}${(c.handleCount ?? 0) > 1 ? ` +${(c.handleCount ?? 1) - 1}` : ''}`
                    : '\u2014'}
                </Text>
                <Text style={[c.isAffiliate ? styles.gTag : styles.gCellMuted, { flex: 1.3 }]}>
                  {c.departed ? 'Left' : c.isAffiliate ? 'Affiliate' : 'Retainer'}
                </Text>
                {/* Em dash, not $0: there is no agreed amount for affiliate-only,
                    and a zero would read as a negotiated figure. */}
                <Text style={[styles.gCellMuted, { flex: 1.1, textAlign: 'right' }]}>
                  {!c.departed && !c.isAffiliate && c.retainer > 0 ? `${fmtCurrency(c.retainer)}/mo` : '\u2014'}
                </Text>
                <Text style={[styles.gCellMuted, { flex: 0.9, textAlign: 'right' }]}>
                  {c.quota != null
                    ? `${fmtNumber(c.postsPublished)} / ${fmtNumber(c.quota)}`
                    : fmtNumber(c.postsPublished)}
                </Text>
                <Text style={[styles.gCellMuted, { flex: 0.9, textAlign: 'right' }]}>{fmtNumber(c.orders)}</Text>
                <Text style={[styles.gCell, { flex: 1.2, textAlign: 'right', fontWeight: 700 }]}>{fmtCurrency(c.gmv)}</Text>
              </View>
            ))}
          </View>
        </Page>
      )}

      {/* ── PAGE 3: Store context — exec summary, highlights, GMV hero ── */}
      <Page size="LETTER" style={styles.page}>
        <PageHead brandName={data.brandName} periodLabel={data.periodLabel} />

        {/* Executive Summary */}
        <View style={styles.summaryCard} wrap={false}>
          <Text style={styles.summaryEyebrow}>OVERVIEW</Text>
          <Text style={styles.summaryTitle}>Executive Summary</Text>
          <Text style={styles.summaryBody}>
            This period, <Text style={styles.highlightPink}>{data.brandName}</Text> generated{' '}
            <Text style={styles.highlightPos}>{fmtCurrency(data.totalGmv)}</Text> in GMV from{' '}
            <Text style={styles.highlightInk}>{fmtNumber(data.totalOrders)}</Text> orders
            {storeSold !== null ? (
              <Text>
                {' '}across <Text style={styles.highlightInk}>{fmtNumber(storeSold)}</Text> creators who made
                sales.
              </Text>
            ) : (
              <Text>.</Text>
            )}
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
        <View style={styles.highlightRow} wrap={false}>
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
        <View style={styles.heroCard} wrap={false}>
          <Text style={styles.heroLabel}>TOTAL GMV GENERATED</Text>
          <Text style={styles.heroValue}>{fmtCurrency(data.totalGmv)}</Text>
        </View>
      </Page>

      {/* ── PAGE 4: Store context — key metrics, managed split, new vs returning ── */}
      <Page size="LETTER" style={styles.page}>
        <PageHead brandName={data.brandName} periodLabel={data.periodLabel} />

        {/* Primary KPIs row */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>KEY METRICS</Text>
          <Text style={styles.sectionTitle}>Performance Overview</Text>
          <View style={[styles.kpiRow, { marginTop: 10 }]} wrap={false}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>ORDERS</Text>
              <Text style={styles.kpiValue}>{fmtNumber(data.totalOrders)}</Text>
              <DeltaPill pct={data.orderChangePct} />
            </View>
            {storePosted !== null && (
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>CREATORS POSTING</Text>
                <Text style={styles.kpiValue}>{fmtNumber(storePosted)}</Text>
                <Text style={styles.splitMeta}>{fmtNumber(storeSold ?? 0)} made sales</Text>
              </View>
            )}
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>VIDEOS POSTED</Text>
              <Text style={styles.kpiValue}>{fmtNumber(data.totalVideos)}</Text>
              <DeltaPill pct={data.videoChangePct} />
            </View>
          </View>

          {/* Secondary KPIs row */}
          <View style={styles.kpiRow} wrap={false}>
            <View style={[styles.kpiCard, { backgroundColor: COLORS.bgCard }]}>
              <Text style={styles.kpiLabel}>AVG ORDER VALUE</Text>
              <Text style={[styles.kpiValue, { fontSize: 16 }]}>{fmtCurrency(data.avgOrderValue, 2)}</Text>
            </View>
            {/* ⚠️ NOT data.avgGmvPerCreator: it divides by activeCreators,
                the export-row count, and printed $5 on jiyu against a true
                $258. Recomputed on creators who actually sold, and omitted
                entirely when that denominator is unavailable. */}
            {storeSold !== null && storeSold > 0 && (
              <View style={[styles.kpiCard, { backgroundColor: COLORS.bgCard }]}>
                <Text style={styles.kpiLabel}>AVG GMV / SELLING CREATOR</Text>
                <Text style={[styles.kpiValue, { fontSize: 16 }]}>
                  {fmtCurrency(data.totalGmv / storeSold)}
                </Text>
              </View>
            )}
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
          <View style={styles.splitRow} wrap={false}>
            <View style={styles.splitLeftCard}>
              <Text style={[styles.splitLabel, { color: COLORS.pinkDeep }]}>MANAGED CREATORS</Text>
              <Text style={[styles.splitGmv, { color: COLORS.pinkDeep }]}>{fmtCurrency(data.managed.gmv)}</Text>
              <Text style={styles.splitMeta}>{fmtNumber(data.managed.orders)} orders</Text>
            </View>
            <Donut pct={data.managedPct} />
            <View style={styles.splitRightCard}>
              <Text style={[styles.splitLabel, { color: COLORS.muted }]}>ORGANIC / AFFILIATE</Text>
              <Text style={[styles.splitGmv, { color: COLORS.ink }]}>{fmtCurrency(data.organic.gmv)}</Text>
              <Text style={styles.splitMeta}>{fmtNumber(data.organic.orders)} orders</Text>
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
          <View style={styles.nvrRow} wrap={false}>
            <View style={styles.nvrCardNew}>
              <Text style={[styles.nvrLabel, { color: COLORS.positive }]}>NEW THIS PERIOD</Text>
              <Text style={[styles.nvrCount, { color: COLORS.positive }]}>{fmtNumber(data.newCreators.count)}</Text>
              <Text style={styles.nvrPctRow}>
                creators
                {storeSold !== null && storeSold > 0
                  ? ` (${Math.round((data.newCreators.count / storeSold) * 100)}% of those who sold)`
                  : ''}
              </Text>
              <Text style={[styles.nvrGmv, { color: COLORS.positive }]}>{fmtCurrency(data.newCreators.gmv)}</Text>
              <Text style={styles.nvrSub}>GMV from new creators</Text>
            </View>
            <View style={styles.nvrCardRet}>
              <Text style={[styles.nvrLabel, { color: COLORS.blue }]}>RETURNING</Text>
              <Text style={[styles.nvrCount, { color: COLORS.blue }]}>{fmtNumber(data.returningCreators.count)}</Text>
              <Text style={styles.nvrPctRow}>
                creators
                {storeSold !== null && storeSold > 0
                  ? ` (${Math.round((data.returningCreators.count / storeSold) * 100)}% of those who sold)`
                  : ''}
              </Text>
              <Text style={[styles.nvrGmv, { color: COLORS.blue }]}>{fmtCurrency(data.returningCreators.gmv)}</Text>
              <Text style={styles.nvrSub}>GMV from returning creators</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* ── PAGE 5: Store context — day-of-week + daily performance ── */}
      <Page size="LETTER" style={styles.page}>
        <PageHead brandName={data.brandName} periodLabel={data.periodLabel} />

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>WEEKLY RHYTHM</Text>
          <Text style={styles.sectionTitle}>Performance by Day of Week</Text>
          <View style={styles.dowRow} wrap={false}>
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
              <View key={c.name + i} style={isTop3 ? styles.lbRowTop : styles.lbRow} wrap={false}>
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
              <View key={v.title + i} style={isTop3 ? styles.lbRowTop : styles.lbRow} wrap={false}>
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
              <View key={p.name + i} style={isTop3 ? styles.lbRowTop : styles.lbRow} wrap={false}>
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

        </Page>
      )}

      {/* ───────────── Closing page (always rendered) ───────────── */}
      <Page size="LETTER" style={styles.page}>
        <View style={{ flexGrow: 1, justifyContent: 'center' }}>
          <View style={styles.footerCard} wrap={false}>
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
        </View>
      </Page>
    </Document>
  );
}
