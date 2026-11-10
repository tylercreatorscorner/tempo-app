import type { BrandClientReportData } from '@/lib/data/brand-client-report';
import type { ClientReportSnapshot } from '@/lib/data/client-reports';
import type { ReportType } from './report-view';
import { ReconciliationView } from './reconciliation-view';
import { StudioReport } from './studio-report';
import type { PublicStudioReport } from './studio-report-model';
import { publicStudioReport, publicStudioSnapshot } from './studio-report-public';

export interface ReportHistoryItem { token: string; label: string; reportType: string; periodStart: string; periodEnd: string }
export interface StudioReportProps {
  token: string; preview?: boolean; report: BrandClientReportData; snapshot: ClientReportSnapshot;
  notes: string | null; plan: string | null; brandName: string; periodLabel: string;
  reportType?: ReportType; logoUrl?: string | null; history?: ReportHistoryItem[];
  historyUnavailable?: boolean;
}
export type StudioReportClientProps = Omit<StudioReportProps, 'snapshot' | 'report'> & {
  report: PublicStudioReport;
  snapshot: Pick<ClientReportSnapshot, 'generatedAt' | 'weekly' | 'movers'>;
};
export function StudioReportView(props: StudioReportProps) {
  if (props.snapshot.reconciliation) return <ReconciliationView revision={props.snapshot.reconciliation} report={props.report} token={props.token} brandName={props.brandName} periodLabel={props.periodLabel} />;
  // The complete publication packet can contain thousands of records. Its
  // paginated token-scoped library owns that data; the report only needs the
  // three frozen context fields below, not a second copy of report or evidence.
  return <StudioReport key={props.token} token={props.token} preview={props.preview}
    report={publicStudioReport(props.report)} snapshot={publicStudioSnapshot(props.snapshot)}
    notes={props.notes} plan={props.plan} brandName={props.brandName} periodLabel={props.periodLabel}
    reportType={props.reportType} logoUrl={props.logoUrl} history={props.history} historyUnavailable={props.historyUnavailable} />;
}
