'use client';

import { useState, useTransition } from 'react';
import { UserPlus } from 'lucide-react';
import { submitManagerInvitation } from '@/app/actions/users';
import { ChoiceMenu } from '@/components/ui/choice-menu';

type Brand = { id: string; display_name: string | null; name: string; slug: string };

const ROLES = [
  { value: 'manager', label: 'Manager', description: 'Manage creators for the selected brands' },
  { value: 'coach', label: 'Coach', description: 'Work with creators for the selected brands' },
  { value: 'brand', label: 'Brand contact', description: 'Client portal access for the selected brands' },
];

export function ManagerInvitations({ brands }: { brands: Brand[] }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('manager');
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await submitManagerInvitation(email, role, brandIds);
      if (!result.ok) {
        setMessage({ type: 'error', text: result.error });
        return;
      }
      setMessage({ type: 'success', text: `Access saved and sign-in email sent to ${email.trim()}.` });
      setEmail('');
      setRole('manager');
      setBrandIds([]);
    });
  }

  return <div className="max-w-3xl space-y-4">
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><UserPlus size={18}/></span>
        <div><h2 className="text-base font-semibold text-foreground">Invite someone to your brands</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose their role and the brands they should access. You can invite only to brands assigned to you.</p></div>
      </div>
      <form onSubmit={submit} className="space-y-5">
        {message && <p role={message.type === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${message.type === 'error' ? 'border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-300' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'}`}>{message.text}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium text-foreground">Email address
            <input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} disabled={pending} placeholder="name@company.com" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"/>
          </label>
          <div className="space-y-1.5"><span className="text-sm font-medium text-foreground">Role</span>
            <ChoiceMenu label="Invitation role" value={role} options={ROLES} onChange={setRole} disabled={pending}/>
          </div>
        </div>
        <fieldset className="space-y-2"><legend className="text-sm font-medium text-foreground">Brand access</legend>
          <p className="text-xs text-muted-foreground">Select at least one. Access to other brands cannot be granted here.</p>
          <div className="grid gap-2 sm:grid-cols-2">{brands.map(brand => <label key={brand.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:border-primary/40">
            <input type="checkbox" checked={brandIds.includes(brand.id)} disabled={pending} onChange={() => setBrandIds(current => current.includes(brand.id) ? current.filter(id => id !== brand.id) : [...current,brand.id])} className="h-4 w-4 accent-primary"/>
            <span>{brand.display_name || brand.name}</span>
          </label>)}</div>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Managers cannot grant Admin access or agency Finance access.</p>
          <button type="submit" disabled={pending || !email.trim() || brandIds.length === 0} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Sending invitation…' : 'Send invitation'}</button>
        </div>
      </form>
    </div>
  </div>;
}
