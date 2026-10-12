import {redirect} from 'next/navigation';
import {getWorkspaceScope} from '@/lib/auth/workspace-scope';
import {canReadCohorts} from '@/lib/roster/discord-cohort-access';
import {DiscordCohortWorkspace} from './workspace';
export const metadata={title:'Discord creator groups'};
export default async function Page(){if(!canReadCohorts(await getWorkspaceScope()))redirect('/roster');return <DiscordCohortWorkspace/>;}
