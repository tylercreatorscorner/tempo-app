import {redirect} from 'next/navigation';
import {getWorkspaceScope} from '@/lib/auth/workspace-scope';
import {canOpenBrandSetup} from '@/lib/brands/setup-access';
import {BrandSetupClient} from '../settings/brands/setup-client';
export const dynamic='force-dynamic';
export const metadata={title:'Brand setup'};
export default async function BrandSetupPage(){
 if(!canOpenBrandSetup(await getWorkspaceScope()))redirect('/dashboard');
 return <BrandSetupClient/>;
}
