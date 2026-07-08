'use client';

import { useState, useTransition } from 'react';
import {
  UserPlus, Shield, Mail, Trash2, Check, ChevronDown, Loader2, X,
  Building2, DollarSign, Users, Search,
} from 'lucide-react';
import {
  inviteUser,
  updateUserRole,
  updateFinanceAccess,
  removeUser,
  updateBrandAccess,
  resendMagicLink,
} from '@/app/actions/users';
import { cn } from '@/lib/utils';

// 'brand_contact' is the legacy value for 'brand' (the brand-portal client role);
// the dropdown only offers the canonical values so new invites land in one place.
const ROLE_OPTIONS = [
  { value: 'admin',   label: 'Admin',         desc: 'Full access, all brands' },
  { value: 'manager', label: 'Manager',       desc: 'Manage creators, scoped to brands' },
  { value: 'analyst', label: 'Analyst',       desc: 'Read-only, scoped to brands' },
  { value: 'brand',   label: 'Brand Contact', desc: 'External client — brand portal only' },
];

const ROLE_STYLE: Record<string, string> = {
  owner:         'bg-purple-50 text-purple-700 border-purple-200',
  admin:         'bg-blue-50 text-blue-700 border-blue-200',
  manager:       'bg-emerald-50 text-emerald-700 border-emerald-200',
  analyst:       'bg-amber-50 text-amber-700 border-amber-200',
  viewer:        'bg-slate-50 text-slate-600 border-slate-200',
  brand:         'bg-pink-50 text-[#E91E8C] border-pink-200',
  brand_contact: 'bg-pink-50 text-[#E91E8C] border-pink-200',
};

const FULL_TENANT = new Set(['owner', 'admin', 'viewer']);
const isInternalScoped = (r: string) => r === 'manager' || r === 'analyst';
const isClientRole = (r: string) => r === 'brand' || r === 'brand_contact';
const needsBrandScope = (r: string) => ['manager', 'analyst', 'brand', 'brand_contact'].includes(r);

interface TeamUser {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  brand_access?: string[];
  can_view_finance?: boolean;
}
interface Brand {
  id: string;
  name: string;
  slug: string;
  display_name: string | null;
}
interface Props {
  users: TeamUser[];
  brands: Brand[];
  tenantId: string;
  currentUserId: string;
}

export function TeamManagement({ users, brands, tenantId, currentUserId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('manager');
  const [inviteBrandIds, setInviteBrandIds] = useState<string[]>([]);
  const [inviteFinance, setInviteFinance] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function flash(msg: string, type: 'success' | 'error') {
    if (type === 'success') { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }
    else { setError(msg); setTimeout(() => setError(null), 4500); }
  }

  const brandName = (id: string) => {
    const b = brands.find((x) => x.id === id);
    return b ? (b.display_name || b.name) : '—';
  };

  function resetInvite() {
    setInviteEmail(''); setInviteRole('manager'); setInviteBrandIds([]); setInviteFinance(false);
  }

  function handleInvite() {
    if (!inviteEmail.trim()) return;
    if (isClientRole(inviteRole) && inviteBrandIds.length === 0) {
      flash('Select at least one brand for this client.', 'error');
      return;
    }
    startTransition(async () => {
      try {
        const canFin = isInternalScoped(inviteRole) ? inviteFinance : true;
        const result = await inviteUser(inviteEmail.trim(), inviteRole, canFin);
        if (needsBrandScope(inviteRole) && inviteBrandIds.length > 0 && result?.userId) {
          await updateBrandAccess(result.userId, inviteBrandIds, tenantId);
        }
        resetInvite();
        setShowInvite(false);
        flash('Invite sent!', 'success');
      } catch (e) {
        flash((e as Error).message, 'error');
      }
    });
  }

  function handleRoleChange(userId: string, role: string) {
    startTransition(async () => {
      try { await updateUserRole(userId, role); flash('Role updated', 'success'); }
      catch (e) { flash((e as Error).message, 'error'); }
    });
  }

  function handleFinanceToggle(userId: string, next: boolean) {
    startTransition(async () => {
      try {
        await updateFinanceAccess(userId, next);
        flash(next ? 'Finance access granted' : 'Finance access removed', 'success');
      } catch (e) { flash((e as Error).message, 'error'); }
    });
  }

  function handleRemove(userId: string, label: string) {
    if (!confirm(`Remove ${label} from the team? They'll lose access immediately.`)) return;
    startTransition(async () => {
      try { await removeUser(userId); flash('Member removed', 'success'); }
      catch (e) { flash((e as Error).message, 'error'); }
    });
  }

  function handleResend(userId: string, email: string) {
    setResendingId(userId);
    startTransition(async () => {
      try { await resendMagicLink(userId); flash(`Sign-in link sent to ${email}`, 'success'); }
      catch (e) { flash((e as Error).message, 'error'); }
      finally { setResendingId(null); }
    });
  }

  function handleBrandAccess(userId: string, brandId: string, current: string[]) {
    const next = current.includes(brandId) ? current.filter((id) => id !== brandId) : [...current, brandId];
    startTransition(async () => {
      try { await updateBrandAccess(userId, next, tenantId); }
      catch (e) { flash((e as Error).message, 'error'); }
    });
  }

  const toggleInviteBrand = (id: string) =>
    setInviteBrandIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const q = search.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) => (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    : users;

  return (
    <>
      {/* Toast */}
      {(success || error) && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg',
          success ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white',
        )}>
          {success || error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="px-5 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-8 rounded-lg bg-[#FF4D8D]/10 text-[#FF4D8D] flex items-center justify-center">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold tracking-tight text-[#1A1B3A]">Members</h2>
              <p className="text-xs text-gray-400 tabular-nums">{users.length} {users.length === 1 ? 'person' : 'people'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-300" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members…"
                className="w-48 pl-8 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
              />
            </div>
            <button
              onClick={() => setShowInvite(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FF4D8D] text-white text-sm font-semibold hover:bg-[#e63d7d] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D8D]/40 focus-visible:ring-offset-1 shrink-0"
            >
              <UserPlus className="h-4 w-4" /> Invite member
            </button>
          </div>
        </div>

        {/* Member list */}
        <div className="divide-y divide-gray-100">
          {filtered.length === 0 && (
            <div className="py-14 text-center">
              <Users className="h-8 w-8 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">{q ? 'No members match your search.' : 'No team members yet.'}</p>
            </div>
          )}

          {filtered.map((u) => {
            const isSelf = u.user_id === currentUserId;
            const isOwner = u.role === 'owner';
            const financeOn = u.can_view_finance !== false;
            const access = u.brand_access ?? [];
            const expanded = expandedUser === u.user_id;
            return (
              <div key={u.user_id}>
                <div className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/60 transition-colors">
                  {/* Identity */}
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {(u.name || u.email)[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#1A1B3A] truncate">
                      {u.name || u.email.split('@')[0]}
                      {isSelf && <span className="ml-1.5 text-[10px] font-medium text-gray-400">(you)</span>}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                  </div>

                  {/* Role */}
                  {isOwner ? (
                    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border', ROLE_STYLE.owner)}>
                      <Shield className="h-3 w-3" /> Owner
                    </span>
                  ) : (
                    <div className="relative">
                      <select
                        defaultValue={u.role}
                        disabled={isPending || isSelf}
                        onChange={(e) => handleRoleChange(u.user_id, e.target.value)}
                        className={cn(
                          'appearance-none text-xs font-semibold pl-2.5 pr-6 py-1 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 disabled:opacity-60 disabled:cursor-default',
                          ROLE_STYLE[u.role] ?? 'bg-gray-50 text-gray-600 border-gray-200',
                        )}
                      >
                        {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none opacity-50" />
                    </div>
                  )}

                  {/* Brand access */}
                  <div className="hidden md:block w-32 text-right">
                    {FULL_TENANT.has(u.role) ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <Building2 className="h-3 w-3" /> All brands
                      </span>
                    ) : needsBrandScope(u.role) ? (
                      <button
                        onClick={() => setExpandedUser(expanded ? null : u.user_id)}
                        className={cn(
                          'inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border transition-colors',
                          expanded ? 'border-[#FF4D8D]/40 bg-[#FF4D8D]/5 text-[#E91E8C]' : 'border-gray-200 text-gray-500 hover:bg-gray-50',
                        )}
                      >
                        <Building2 className="h-3 w-3" />
                        {access.length === 0 ? 'No brands' : `${access.length} brand${access.length === 1 ? '' : 's'}`}
                      </button>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </div>

                  {/* Finance */}
                  <div className="hidden lg:block w-24 text-right">
                    {FULL_TENANT.has(u.role) ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400"><DollarSign className="h-3 w-3" /> Full</span>
                    ) : isInternalScoped(u.role) ? (
                      <button
                        onClick={() => handleFinanceToggle(u.user_id, !financeOn)}
                        disabled={isPending}
                        title={financeOn ? 'Remove Finance access' : 'Grant Finance access'}
                        className={cn(
                          'inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border transition-colors',
                          financeOn ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    : 'border-gray-200 text-gray-400 hover:bg-gray-50',
                        )}
                      >
                        <DollarSign className="h-3 w-3" /> {financeOn ? 'Finance' : 'No finance'}
                      </button>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {!isOwner && !isSelf && (
                      <button
                        onClick={() => handleResend(u.user_id, u.email)}
                        disabled={isPending || resendingId === u.user_id}
                        title="Resend sign-in link"
                        className="p-1.5 rounded-lg text-gray-300 hover:text-[#1A1B3A] hover:bg-gray-100 transition-colors disabled:opacity-50"
                      >
                        {resendingId === u.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {!isOwner && !isSelf && (
                      <button
                        onClick={() => handleRemove(u.user_id, u.name || u.email)}
                        disabled={isPending}
                        title="Remove member"
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Brand-access editor */}
                {expanded && (
                  <div className="px-5 pb-4 pt-1 bg-gray-50/60 border-t border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-12">Brand access</p>
                    <div className="flex flex-wrap gap-2 ml-12">
                      {brands.length === 0 ? (
                        <p className="text-xs text-gray-400">No brands set up yet.</p>
                      ) : brands.map((b) => {
                        const on = access.includes(b.id);
                        return (
                          <button
                            key={b.id}
                            onClick={() => handleBrandAccess(u.user_id, b.id, access)}
                            disabled={isPending}
                            className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                              on ? 'bg-[#FF4D8D]/10 border-[#FF4D8D]/30 text-[#E91E8C]' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300',
                            )}
                          >
                            {on && <Check className="h-3 w-3" />}
                            {b.display_name || b.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setShowInvite(false)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-lg bg-[#FF4D8D]/10 text-[#FF4D8D] flex items-center justify-center"><UserPlus className="h-4 w-4" /></span>
                <h2 className="text-sm font-extrabold tracking-tight text-[#1A1B3A]">
                  {isClientRole(inviteRole) ? 'Invite a client' : 'Invite a team member'}
                </h2>
              </div>
              <button onClick={() => setShowInvite(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
                <input
                  type="email"
                  autoFocus
                  placeholder="name@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setInviteRole(r.value)}
                      className={cn(
                        'text-left px-3 py-2 rounded-xl border transition-colors',
                        inviteRole === r.value ? 'border-[#FF4D8D] bg-[#FF4D8D]/5' : 'border-gray-200 hover:border-gray-300',
                      )}
                    >
                      <p className="text-xs font-semibold text-[#1A1B3A]">{r.label}</p>
                      <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{r.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Brand access for scoped roles */}
              {needsBrandScope(inviteRole) && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Brand access {isClientRole(inviteRole) && inviteBrandIds.length === 0 && <span className="text-red-500 normal-case font-normal">(required)</span>}
                  </label>
                  {brands.length === 0 ? (
                    <p className="text-xs text-gray-400">No brands set up yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {brands.map((b) => {
                        const on = inviteBrandIds.includes(b.id);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => toggleInviteBrand(b.id)}
                            className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                              on ? 'bg-[#FF4D8D]/10 border-[#FF4D8D]/30 text-[#E91E8C]' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300',
                            )}
                          >
                            {on && <Check className="h-3 w-3" />}
                            {b.display_name || b.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Finance access for internal scoped members */}
              {isInternalScoped(inviteRole) && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-gray-200 cursor-pointer select-none hover:border-gray-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={inviteFinance}
                    onChange={(e) => setInviteFinance(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#FF4D8D] focus:ring-[#FF4D8D]/40"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-[#1A1B3A]">Can see Finance</span>
                    <span className="block text-[10px] text-gray-400">Earnings, Invoicing, Payments. Off by default.</span>
                  </span>
                </label>
              )}

              <p className="text-[11px] text-gray-400">
                {isClientRole(inviteRole)
                  ? "They'll get an email magic link to their brand portal."
                  : "They'll get an email to set up their account."}
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
              <button onClick={() => setShowInvite(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={isPending || !inviteEmail.trim() || (isClientRole(inviteRole) && inviteBrandIds.length === 0)}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#FF4D8D] text-white text-sm font-semibold hover:bg-[#e63d7d] disabled:opacity-50 transition-colors"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Send invite
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
