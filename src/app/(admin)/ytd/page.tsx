import { permanentRedirect } from 'next/navigation';

/**
 * /ytd is retired — the Year-to-Date lens now lives inside the Earnings
 * cockpit as its Year view. Permanent (308) redirect, year param preserved.
 */
export default async function YtdPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  permanentRedirect(
    year && /^\d{4}$/.test(year) ? `/earnings?view=year&year=${year}` : '/earnings?view=year',
  );
}
