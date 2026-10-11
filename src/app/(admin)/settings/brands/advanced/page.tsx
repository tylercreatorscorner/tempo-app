import {redirect} from 'next/navigation';
import {getWorkspaceScope} from '@/lib/auth/workspace-scope';
import {canManageBrandSetup} from '@/lib/brands/setup-access';
import {BrandsSettingsClient} from '../brands-client';
export const dynamic='force-dynamic';
export default async function AdvancedBrandSettings(){
 if(!canManageBrandSetup(await getWorkspaceScope()))redirect('/brand-setup');
 return <BrandsSettingsClient/>;
}
