import { BillingWorkspace } from '../billing-workspace';
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const initialMonth = month && /^20\d{2}-(0[1-9]|1[0-2])$/.test(month) ? month : undefined;
  return <BillingWorkspace initialMonth={initialMonth} />;
}
