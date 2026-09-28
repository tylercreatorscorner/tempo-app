'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ChoiceMenu } from '@/components/ui/choice-menu';

type Option = { id: string; name: string };
type Channel = Option & { type: number };
type Saved = { guild_id: string; start_here_channel_id: string; creator_role_id: string;
  coaching_category_id: string; staff_role_ids: string[]; enabled: boolean } | null;
type Setup = { guilds: Option[]; roles: Option[]; channels: Channel[]; saved: Saved; error: string | null };

export function DiscordHubSetup({ brandId, brandSlug }: { brandId: string; brandSlug: string }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [guildId, setGuildId] = useState('');
  const [startHere, setStartHere] = useState('');
  const [creatorRole, setCreatorRole] = useState('');
  const [category, setCategory] = useState('');
  const [staffRoles, setStaffRoles] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [validated, setValidated] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch(`/api/creator-hub/discord-setup?brandId=${encodeURIComponent(brandId)}`)
      .then(async response => {
        const data: unknown = await response.json();
        if (!response.ok || !data || typeof data !== 'object' ||
            !('guilds' in data) || !Array.isArray(data.guilds) ||
            !('roles' in data) || !Array.isArray(data.roles) ||
            !('channels' in data) || !Array.isArray(data.channels)) {
          throw new Error('Could not load Discord setup. Try again later.');
        }
        return data as Setup;
      }).then(data => {
        if (!active) return;
        setSetup(data); setGuildId(data.saved?.guild_id ?? data.guilds[0]?.id ?? '');
        setStartHere(data.saved?.start_here_channel_id ?? '');
        setCreatorRole(data.saved?.creator_role_id ?? '');
        setCategory(data.saved?.coaching_category_id ?? '');
        setStaffRoles(data.saved?.staff_role_ids ?? []);
      }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load Discord setup.'); });
    return () => { active = false; };
  }, [brandId]);
  async function save(enabled: boolean, validateOnly = false) {
    setBusy(true); setError(''); setSaved(false); setValidated(false);
    try {
      const response = await fetch('/api/creator-hub/discord-setup', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId,
          guildId, startHereChannelId: startHere, creatorRoleId: creatorRole,
          coachingCategoryId: category, staffRoleIds: staffRoles, enabled, validateOnly }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save Discord setup.');
      if (validateOnly) setValidated(true);
      else {
        setSaved(true); setSetup(current => current ? { ...current,
          saved: { guild_id: guildId, start_here_channel_id: startHere, creator_role_id: creatorRole,
            coaching_category_id: category, staff_role_ids: staffRoles, enabled } } : current);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save Discord setup.'); }
    finally { setBusy(false); }
  }
  return <details className="rounded-xl border border-border bg-card p-4">
    <summary className="cursor-pointer text-sm font-semibold">Discord onboarding setup <span className="ml-2 text-xs font-normal text-muted-foreground">{setup?.saved?.enabled ? 'Enabled' : 'Not enabled'}</span></summary>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">Choose this brand’s real server, #start-here, Creator role, coaching category, and staff roles. The first live pilot is JiYu. Enabling checks the bot’s permissions and confirms a new member can see only #start-here. Existing Ticket Tool chats are unaffected.</p>
    {!setup ? <p className="mt-3 text-xs text-muted-foreground">{error || 'Loading Discord options…'}</p> : <>
      {setup.error && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{setup.error}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><span className="text-xs font-medium">Brand server</span><ChoiceMenu compact label="Brand Discord server" value={guildId} options={setup.guilds.map(item => ({ value: item.id, label: item.name }))} onChange={setGuildId} disabled={setup.guilds.length !== 1} placeholder="Choose server" /></div>
        <div><span className="text-xs font-medium">#start-here channel</span><ChoiceMenu compact label="Start-here channel" value={startHere} options={setup.channels.filter(item => item.type !== 4).map(item => ({ value: item.id, label: `#${item.name}` }))} onChange={setStartHere} placeholder="Choose channel" /></div>
        <div><span className="text-xs font-medium">Creator role</span><ChoiceMenu compact label="Creator role" value={creatorRole} options={setup.roles.map(item => ({ value: item.id, label: item.name }))} onChange={setCreatorRole} placeholder="Choose role" /></div>
        <div><span className="text-xs font-medium">Coaching category</span><ChoiceMenu compact label="Coaching category" value={category} options={setup.channels.filter(item => item.type === 4).map(item => ({ value: item.id, label: item.name }))} onChange={setCategory} placeholder="Choose category" /></div>
      </div>
      <div className="mt-3"><label className="text-xs font-medium">Staff roles with access to each coaching chat<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a role" className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label><div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-border p-2">{setup.roles.filter(role => role.name.toLowerCase().includes(search.toLowerCase())).map(role => <label key={role.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/30"><input type="checkbox" checked={staffRoles.includes(role.id)} onChange={event => setStaffRoles(current => event.target.checked ? [...current, role.id] : current.filter(id => id !== role.id))} />{role.name}</label>)}</div></div>
      <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" disabled={busy || brandSlug !== 'jiyu'} onClick={() => save(false)} className="rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">{setup.saved?.enabled ? 'Pause onboarding' : 'Save disabled setup'}</button><button type="button" disabled={busy || brandSlug !== 'jiyu'} onClick={() => save(true, true)} className="rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">Check readiness</button><button type="button" disabled={busy || brandSlug !== 'jiyu'} onClick={() => save(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />}Verify and enable</button>{brandSlug !== 'jiyu' && <span className="text-xs text-muted-foreground">JiYu pilot only</span>}{validated && <span className="text-xs text-emerald-700">Ready to enable. No changes saved.</span>}{saved && <span className="text-xs text-emerald-700">Saved</span>}</div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}
    </>}
  </details>;
}
