/**
 * Permission guard for the earnings section.
 *
 * ⚠️ A LAYOUT, not a change to the page, for two reasons: several of these
 * pages are client components and cannot run a server guard inline, and a
 * layout also covers every nested route under this one for free.
 *
 * ⚠️ ADDITIVE. The pages and API routes underneath keep whatever checks they
 * already had; this only ever denies further. The seeded roles reproduce
 * today's access exactly, so this changes nothing until a role is edited.
 *
 * ⚠️ Capability only. Anything here that reads one brand's data still needs
 * its own brand-scope check: this answers "may they open it", not "whose data".
 */
import { requireScreen } from '@/lib/auth/require-screen';

export default async function EarningsLayout({ children }: { children: React.ReactNode }) {
  await requireScreen('earnings');
  return <>{children}</>;
}
