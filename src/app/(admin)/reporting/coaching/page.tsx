import { redirect } from 'next/navigation';
import { requireScreen } from '@/lib/auth/require-screen';
import { CoachingRecords } from './records';
export const metadata = { title: 'Coaching' };
export default async function CoachingPage() {
 const scope = await requireScreen('reporting');
 if (scope.impersonating || !['owner','admin','manager','coach'].includes(scope.role)) redirect('/reporting');
 return <CoachingRecords />;
}
