'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Eye } from 'lucide-react';
import { switchTenant } from '@/app/actions/switch-tenant';
import { switchManager } from '@/app/actions/switch-manager';
import { ChoiceMenu, type ChoiceOption } from '@/components/ui/choice-menu';
interface Tenant { id:string; name:string; plan:string; }
interface Manager { id:string; name:string; role:string; }
interface Props { tenants:Tenant[]; activeTenantId:string|null; managers:Manager[]; activeManagerId:string|null; }
export function TenantSwitcher({tenants,activeTenantId,managers,activeManagerId}:Props) {
  const [pending,setPending]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const router=useRouter();
  const options:ChoiceOption[]=[{value:'tenant:all',label:'All workspaces',description:'Platform administrator',icon:<Building2 size={18}/>,group:'Workspaces'},...tenants.map(tenant=>({value:`tenant:${tenant.id}`,label:tenant.name,description:tenant.plan,icon:<Building2 size={18}/>,group:'Workspaces'}))];
  if(activeTenantId) options.push({value:'manager:self',label:'Your own access',description:'Leave read-only view',group:'View as · read-only'},...managers.map(manager=>({value:`manager:${manager.id}`,label:`View as ${manager.name}`,description:manager.role,icon:<Eye size={18}/>,group:'View as · read-only'})));
  async function pick(value:string) {
    setPending(true);setError(null);
    try {
      const [kind,id]=value.split(':');
      if(kind==='tenant') await switchTenant(id==='all'?null:id);
      else await switchManager(id==='self'?null:id);
      window.dispatchEvent(new Event('workspace-context-changed'));
      router.refresh();
    } catch {setError('Could not change workspace. Please try again.');}
    finally {setPending(false);}
  }
  return <div><ChoiceMenu label="Workspace" value={activeManagerId?`manager:${activeManagerId}`:`tenant:${activeTenantId??'all'}`} options={options} onChange={pick} disabled={pending}/>{error&&<p role="alert" className="absolute right-4 mt-2 rounded-xl border border-border bg-card p-3 text-xs text-red-500 shadow-lg">{error}</p>}</div>;
}
