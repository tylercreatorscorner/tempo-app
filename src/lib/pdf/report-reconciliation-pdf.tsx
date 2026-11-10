import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ReportReconciliation } from '@/lib/data/report-reconciliation';
import { pdfText as text } from '@/lib/pdf/report-primitives';

const s = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 48, paddingHorizontal: 36, fontFamily: 'Inter', fontSize: 9, color: '#191a1c', backgroundColor: '#f6f5f1' },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#dddcd7', paddingBottom: 12, marginBottom: 24 },
  brand: { fontWeight: 700, fontSize: 11 },
  prepared: { fontSize: 8, color: '#66666c' },
  kicker: { color: '#6e4bcc', fontSize: 8, fontWeight: 700, letterSpacing: 1, marginBottom: 7 },
  title: { fontSize: 26, fontWeight: 700, marginBottom: 8 },
  sub: { fontSize: 9, color: '#66666c', marginBottom: 18 },
  summary: { padding: 16, backgroundColor: '#1d1c21', borderRadius: 9, marginBottom: 16 },
  summaryLabel: { color: '#e6f79a', fontSize: 8, marginBottom: 7, fontWeight: 700 },
  summaryText: { color: '#ffffff', lineHeight: 1.5, fontSize: 10 },
  row: { padding: 14, borderWidth: 1, borderColor: '#dddcd7', backgroundColor: '#ffffff', borderRadius: 8, marginBottom: 8 },
  name: { fontSize: 12, fontWeight: 700, marginBottom: 7 },
  body: { fontSize: 9, lineHeight: 1.5, marginBottom: 3 },
  note: { fontSize: 8, color: '#66666c', lineHeight: 1.5, marginTop: 5 },
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, borderTopWidth: 1, borderTopColor: '#dddcd7', paddingTop: 8, fontSize: 7, color: '#66666c' },
});

export function ReportReconciliationPDF({ revision, brandName, periodLabel }: { revision: ReportReconciliation; brandName: string; periodLabel: string }) {
  return <Document title={`${text(brandName)} - August creator reconciliation`} author="Creators Corner">
    <Page size="A4" style={s.page} wrap>
      <View style={s.header} fixed><Text style={s.brand}>{text(brandName)}</Text><Text style={s.prepared}>Prepared by Creators Corner</Text></View>
      <Text style={s.kicker}>REPORT REVISION</Text>
      <Text style={s.title}>August creator reconciliation</Text>
      <Text style={s.sub}>{text(periodLabel)}</Text>
      <View style={s.summary} wrap={false}><Text style={s.summaryLabel}>THE CORRECTION</Text><Text style={s.summaryText}>{text(revision.summary)}</Text></View>
      <Text style={[s.note, { marginBottom: 12 }]}>August posts exclude July credits. Invoice amounts do not indicate payment has been sent.</Text>
      {revision.rows.map(row => <View key={row.handle} style={s.row} wrap={false}>
        <Text style={s.name}>{text(row.name)} / @{text(row.handle)}</Text>
        <Text style={s.body}>{text(row.agreement)}</Text>
        <Text style={s.body}>August posts: {row.augustPosts} | Invoice: {row.invoice === null ? 'Unchanged' : row.invoice.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</Text>
        <Text style={s.body}>{text(row.creditedPosts)}</Text>
        <Text style={s.note}>{text(row.resolution)}</Text>
      </View>)}
      <Text style={s.note}>This revision supersedes the listed creators&apos; agreement, delivery and invoice details. Other creators and sales figures are outside this correction. Original report retained in Tempo.</Text>
      <Text fixed style={s.footer} render={({ pageNumber, totalPages }) => `${text(brandName)} / Frozen report revision / ${pageNumber} of ${totalPages}`} />
    </Page>
  </Document>;
}
