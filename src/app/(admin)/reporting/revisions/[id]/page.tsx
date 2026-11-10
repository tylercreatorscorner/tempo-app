import { notFound } from 'next/navigation';
import { StudioReportView } from '@/app/r/[token]/studio-report-view';
import { reviveReportDates } from '@/lib/data/client-reports';
import { loadClientReportRevisionDraft, PrivateReportDraftError, privateReportDraftRoutes, privateReportDraftLogoUrl } from '@/lib/data/client-report-revision-drafts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Private report revision | Tempo', robots: { index: false, follow: false } };

export default async function PrivateReportRevisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await loadClientReportRevisionDraft(id).catch(error => {
    if (error instanceof PrivateReportDraftError && error.status < 500) notFound();
    throw error;
  });
  const logoUrl = await privateReportDraftLogoUrl(draft);
  return <StudioReportView token={draft.id} preview privateRevision
    routes={privateReportDraftRoutes(draft.id)} history={[]} logoUrl={logoUrl}
    report={reviveReportDates(draft.snapshot.report)} snapshot={draft.snapshot}
    notes={draft.notes} plan={draft.plan} brandName={draft.brand_name}
    periodLabel={draft.period_label} reportType={draft.report_type} />;
}
