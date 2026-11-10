import { AgencyWorkspace } from '../workspace';
export default async function AgencyClientsPage({ searchParams }: { searchParams: Promise<{ month?: string; setup?: string }> }) {
  const { month, setup } = await searchParams;
  return <AgencyWorkspace key={`${month ?? 'default'}:${setup ?? ''}`} initialClientFilter={setup === '1' ? 'setup' : 'configured'} view="clients" initialMonth={month} />;
}
