import { AgencyWorkspace } from './workspace';
export default async function AgencyOverviewPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  return <AgencyWorkspace key={month ?? 'default'} view="overview" initialMonth={month} />;
}
