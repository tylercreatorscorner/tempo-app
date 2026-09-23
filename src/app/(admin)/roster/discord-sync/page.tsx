import Link from 'next/link';
import {getWorkspaceScope} from '@/lib/auth/workspace-scope';
import {canReviewDiscordRoles} from '@/lib/roster/discord-reconciliation-access';
import {DiscordRoleReview} from '@/components/roster/discord-role-review';
export default async function Page(){
 const scope=await getWorkspaceScope();
 if(!canReviewDiscordRoles(scope,'jiyu'))return <main className="p-6"><h1 className="text-xl font-semibold">Discord role review</h1><p className="mt-2 text-sm text-muted-foreground">This pilot is available to the configured JiYu operator.</p><Link href="/roster" className="mt-4 inline-block text-primary">Back to creators</Link></main>;
 return <DiscordRoleReview/>;
}
