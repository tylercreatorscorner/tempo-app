import { redirect } from 'next/navigation';
import { requireScreen } from '@/lib/auth/require-screen';
import { EliteView } from './view';
export const metadata = { title: 'Elite creator brief' };
export default async function Page() {
 const scope = await requireScreen('reporting');
 if(scope.impersonating || !['owner','admin','manager','coach'].includes(scope.role)) redirect('/reporting');
 return <EliteView />;
}
