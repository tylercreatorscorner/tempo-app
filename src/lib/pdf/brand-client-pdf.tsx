/**
 * Brand Client Update — PDF document.
 *
 * Server-rendered via @react-pdf/renderer. Designed to replace the manual
 * "weekly deck + write-up" process — paste-ready as a Slack/email attachment.
 *
 * Brand voice: clean, professional, brand-pink accents on a white sheet.
 * Goal: looks credible standalone, doesn't try to imitate a slide deck.
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { BrandClientUpdateData } from '@/lib/data/discord-posts';

const COLORS = {
  pink:    '#E91E8C',
  ink:     '#1A1B3A',
  body:    '#374151',
  muted:   '#6B7280',
  faint:   '#9CA3AF',
  rule:    '#E5E7EB',
  bgChip:  '#FCE7F3',
  bgCard:  '#FAFAFA',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 56,
    fontSize: 11,
    color: COLORS.body,
    fontFamily: 'Helvetica',
  },
  // Header
  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 },
  brand:        { fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLORS.pink, letterSpacing: 1.5 },
  dateLabel:    { fontSize: 9, color: COLORS.muted },
  title:        { fontSize: 22, fontFamily: 'Helvetica-Bold', color: COLORS.ink, marginTop: 8, marginBottom: 4 },
  subtitle:     { fontSize: 11, color: COLORS.muted, marginBottom: 24 },

  // KPI row
  kpiRow:       { flexDirection: 'row', gap: 12, marginBottom: 24 },
  kpiCard:      {
    flex: 1, padding: 14, borderRadius: 8,
    backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.rule,
  },
  kpiLabel:     { fontSize: 8, color: COLORS.muted, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginBottom: 6 },
  kpiValue:     { fontSize: 18, fontFamily: 'Helvetica-Bold', color: COLORS.ink },
  kpiSub:       { fontSize: 9, color: COLORS.muted, marginTop: 4 },
  kpiSubUp:     { fontSize: 9, color: '#059669', marginTop: 4, fontFamily: 'Helvetica-Bold' },
  kpiSubDown:   { fontSize: 9, color: '#DC2626', marginTop: 4, fontFamily: 'Helvetica-Bold' },

  // Section
  section:        { marginBottom: 22 },
  sectionTitle:   { fontSize: 12, fontFamily: 'Helvetica-Bold', color: COLORS.ink, marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: COLORS.rule },
  row:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: COLORS.rule },
  rowLast:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rank:           { width: 22, fontSize: 11, color: COLORS.faint, fontFamily: 'Helvetica-Bold' },
  rowText:        { flex: 1, fontSize: 11, color: COLORS.ink },
  rowMeta:        { fontSize: 9, color: COLORS.muted, marginTop: 1 },
  rowValue:       { fontSize: 11, fontFamily: 'Helvetica-Bold', color: COLORS.ink },
  rowEmpty:       { fontSize: 10, color: COLORS.faint, fontStyle: 'italic', paddingVertical: 6 },

  // Footer
  footer:         { position: 'absolute', bottom: 24, left: 56, right: 56, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.rule, flexDirection: 'row', justifyContent: 'space-between' },
  footerText:     { fontSize: 8, color: COLORS.faint },

  // Goal bar
  goalBarTrack:   { height: 6, backgroundColor: COLORS.rule, borderRadius: 3, marginTop: 8, marginBottom: 4, overflow: 'hidden' },
  goalBarFill:    { height: 6, backgroundColor: COLORS.pink, borderRadius: 3 },
  goalBarLabel:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  goalBarText:    { fontSize: 8, color: COLORS.muted },

  // Closing
  closing:        { marginTop: 8, fontSize: 10, color: COLORS.muted, lineHeight: 1.5 },
});

function fmtCurrency(n: number) {
  return '$' + Math.round(n || 0).toLocaleString();
}
function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function BrandClientUpdatePDF({
  data,
  brandName,
  generatedAt,
}: {
  data: BrandClientUpdateData;
  brandName: string;
  generatedAt: Date;
}) {
  const range = `${fmtDate(data.startDate)} – ${fmtDate(data.endDate)}, ${data.endDate.getFullYear()}`;
  const goalPct = data.monthlyGoal > 0 ? Math.min(100, (data.mtdGmv / data.monthlyGoal) * 100) : 0;

  let wowLabel = '—';
  let wowStyle = styles.kpiSub;
  if (Number.isFinite(data.wowPct) && data.lastWeekTotal > 0) {
    const sign = data.wowPct >= 0 ? '+' : '';
    wowLabel = `${sign}${Math.round(data.wowPct)}% vs last week`;
    wowStyle = data.wowPct >= 0 ? styles.kpiSubUp : styles.kpiSubDown;
  }

  return (
    <Document
      title={`${brandName} — Weekly Update (${range})`}
      author="Tempo"
      subject="Weekly performance update"
    >
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.brand}>WEEKLY UPDATE</Text>
          <Text style={styles.dateLabel}>{generatedAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
        </View>
        <Text style={styles.title}>{brandName}</Text>
        <Text style={styles.subtitle}>{range}</Text>

        {/* KPIs */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>WEEK GMV</Text>
            <Text style={styles.kpiValue}>{fmtCurrency(data.weekTotal)}</Text>
            <Text style={wowStyle}>{wowLabel}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>MONTH-TO-DATE</Text>
            <Text style={styles.kpiValue}>{fmtCurrency(data.mtdGmv)}</Text>
            <Text style={styles.kpiSub}>{Math.round(goalPct)}% of {fmtCurrency(data.monthlyGoal)} goal</Text>
            <View style={styles.goalBarTrack}>
              <View style={[styles.goalBarFill, { width: `${goalPct}%` }]} />
            </View>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>ACTIVITY</Text>
            <Text style={styles.kpiValue}>{data.creatorCount}</Text>
            <Text style={styles.kpiSub}>creators · {data.videoCount} videos</Text>
          </View>
        </View>

        {/* Top Videos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Videos This Week</Text>
          {data.topVideos.length === 0 ? (
            <Text style={styles.rowEmpty}>No videos with sales this week.</Text>
          ) : data.topVideos.map((v, i) => {
            const handle = (v.tiktok_username || '').replace('@', '');
            const isLast = i === data.topVideos.length - 1;
            return (
              <View key={v.video_id} style={isLast ? styles.rowLast : styles.row}>
                <Text style={styles.rank}>{i + 1}.</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowText}>@{handle}</Text>
                </View>
                <Text style={styles.rowValue}>{fmtCurrency(v.gmv)}</Text>
              </View>
            );
          })}
        </View>

        {/* Top Creators */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Creators This Week</Text>
          {data.topCreators.length === 0 ? (
            <Text style={styles.rowEmpty}>No creator activity this week.</Text>
          ) : data.topCreators.map((c, i) => {
            const handle = (c.name || '').replace('@', '');
            const isLast = i === data.topCreators.length - 1;
            return (
              <View key={c.name} style={isLast ? styles.rowLast : styles.row}>
                <Text style={styles.rank}>{i + 1}.</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowText}>@{handle}</Text>
                  <Text style={styles.rowMeta}>{c.videos} {c.videos === 1 ? 'video' : 'videos'} this week</Text>
                </View>
                <Text style={styles.rowValue}>{fmtCurrency(c.gmv)}</Text>
              </View>
            );
          })}
        </View>

        {/* Closing note */}
        <Text style={styles.closing}>
          Reach out anytime if you&apos;d like to dig into specific creators, videos, or product performance.
          We&apos;re here to make this campaign a success.
        </Text>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated by Tempo · Confidential</Text>
          <Text style={styles.footerText}>{brandName}</Text>
        </View>
      </Page>
    </Document>
  );
}
