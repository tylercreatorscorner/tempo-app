import { OperationsWorkspace } from '@/components/community-operations/operations-workspace';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { canUseOperations } from '@/lib/community-ops/access';
import LegacyHub from './legacy-hub';
import Link from 'next/link';
export default async function MessagesPage({searchParams}:{searchParams:Promise<{tab?:string;view?:string;brand?:string}>}) {
 const [params,scope]=await Promise.all([searchParams,getWorkspaceScope()]);
 if(!canUseOperations(scope))return <LegacyHub/>;
 if(['broadcasts','inbox','templates'].includes(params.tab??''))return <><Link href={params.brand?`/messages?brand=${encodeURIComponent(params.brand)}`:'/messages'} className="text-sm text-primary">Back to Messages</Link><LegacyHub/></>;
 return <OperationsWorkspace key={params.brand??'all'} initialView={params.view==='community'?'Community':params.view==='history'?'All conversations':'Today'} initialBrand={params.brand}/>;
}
