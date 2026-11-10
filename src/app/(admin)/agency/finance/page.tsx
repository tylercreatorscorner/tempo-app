import { AgencyFinanceWorkspace } from './workspace';
export default async function AgencyFinancePage({ searchParams }: { searchParams: Promise<{ client?: string; month?: string; section?: string }> }) {
  const params = await searchParams;
  return <AgencyFinanceWorkspace key={`${params.client ?? ''}:${params.month ?? ''}:${params.section ?? ''}`} />;
}
