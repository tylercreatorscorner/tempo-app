import { AgencyWorkspace } from '../workspace';
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string; q?: string }> }) {
  const { month, q } = await searchParams;
  const initialMonth = month && /^20\d{2}-(0[1-9]|1[0-2])$/.test(month) ? month : undefined;
  return <AgencyWorkspace view="clients" initialMonth={initialMonth} initialSearch={typeof q === "string" ? q.slice(0,100) : ""} />;
}
