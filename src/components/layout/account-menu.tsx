'use client';
import Link from 'next/link';
import { DropdownMenu } from 'radix-ui';
import { ChevronDown, LogOut, Settings, Users } from 'lucide-react';

export function AccountMenu({name,email,initials,isAdmin,onLogout}:{name?:string;email?:string;initials:string;isAdmin?:boolean;onLogout:()=>Promise<void>}) {
  const item='flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-secondary';
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger aria-label="Account menu" className="flex min-h-10 items-center gap-2 rounded-xl border border-transparent px-2 hover:border-border hover:bg-secondary focus-visible:outline-primary">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials}</span>
      {name && <span className="hidden max-w-32 truncate text-sm font-medium sm:block">{name}</span>}
      <ChevronDown size={14} className="hidden text-muted-foreground sm:block"/>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={8} collisionPadding={12} className="z-[100] w-64 max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-lg">
      <DropdownMenu.Label className="px-3 py-3"><span className="block truncate text-sm font-semibold">{name || 'Your account'}</span><span className="mt-1 block truncate text-xs font-normal text-muted-foreground">{email}</span></DropdownMenu.Label>
      <DropdownMenu.Separator className="my-1 h-px bg-border"/>
      {isAdmin && <DropdownMenu.Item asChild><Link href="/team" className={item}><Users size={16}/>User management</Link></DropdownMenu.Item>}
      <DropdownMenu.Item asChild><Link href="/settings" className={item}><Settings size={16}/>Settings</Link></DropdownMenu.Item>
      <DropdownMenu.Separator className="my-1 h-px bg-border"/>
      <DropdownMenu.Item className={`${item} text-red-600 dark:text-red-400`} onSelect={()=>{void onLogout();}}><LogOut size={16}/>Sign out</DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
