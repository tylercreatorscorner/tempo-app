'use client';

import { useState, useTransition } from 'react';
import {
  UserPlus, Shield, Mail, Trash2, Check, ChevronDown, Loader2, X,
  Building2, DollarSign, Users, Search, AlertTriangle,
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

// Assignable roles. 'analyst' is intentionally NOT here — getWorkspaceScope has no
// case for it (it resolves to null = no access), so offering it would mint dead
// accounts. Re-add once a real scoped read-only role is wired up.
const ROLE_OPTIONS = [
  { value: 'admin',   label: 'Admin',         desc: 'Full access, all brands' },
  { value: 'manager', label: 'Manager',       desc: 'Manage creators, scoped to brands' },
  { value: 'brand',   label: 'Brand Contact', desc: 'External client — brand portal only' },
];
const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', manager: 'Manager', viewer: 'Viewer',
  analyst: 'Analyst', brand: 'Brand Contact', brand_contact: 'Brand Contact',
};
const ROLE_STYLE: Record<string, string> = {
  owner:         'bg-purple-500/10 text-purple-500 border-purple-500/25',
  admin:         'bg-blue-500/10 text-blue-500 border-blue-500/25',
  manager:       'bg-emerald-500/10 text-emerald-500 border-emerald-500/25',
  viewer:        'bg-slate-50 text-slate-600 border-slate-200',
  analyst:       'bg-amber-500/10 text-amber-500 border-amber-500/25',
  brand:         'bg-primary/10 text-[var(--primary)] border-primary/15',
  brand_contact: 'bg-primary/10 text-[var(--primary)] border-primary/15',
};
// Higher = more access. A change to a lower rank asks for confirmation.
const RANK: Record<string, number> = {
  owner: 4, admin: 3, viewer: 3, manager: 2, analyst: 2, brand: 1, brand_contact: 1,
};

const FULL_TENANT = new Set(['owner', 'admin', 'viewer']);
const isManager = (r: string) => r === 'manager';
const isClientRole = (r: string) => r === 'brand' || r === 'brand_contact';
const needsBrandScope = (r: string) => ['manager', 'brand', 'brand_contact'].includes(r);

interface TeamUser {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  brand_access?: string[];
  can_view_finance?: boolean;
  pending?: boolean;
}
interface Brand {
  id: string;
  name: string;
  slug: string;
  display_name: string | null;
  color?: string | null;
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
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmRole, setConfirmRole] = useState<{ userId: string; role: string } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function flash(msg: string, type: 'success' | 'error') {
    if (type === 'success') { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }
    else { setError(msg); setTimeout(() => setError(null), 4500); }
  }

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
        const canFin = isManager(inviteRole) ? inviteFinance : true;
        const result = await inviteUser(inviteEmail.trim(), inviteRole, canFin);
        if (needsBrandScope(inviteRole) && inviteBrandIds.length > 0 && result?.userId) {
          await updateBrandAccess(result.userId, inviteBrandIds, tenantId);
        }
        resetInvite();
        setShowInvite(false);
        flash('Invite sent!', 'success');
      } catch (e) { flash((e as Error).message, 'error'); }
    });
  }

  function applyRole(u: TeamUser, role: string) {
    startTransition(async () => {
      try {
        await updateUserRole(u.user_id, role);
        flash('Role updated', 'success');
        // Moving to a scoped role with no brands = locked out — open the editor.
        if (needsBrandScope(role) && (u.brand_access ?? []).length === 0) setExpandedUser(u.user_id);
      } catch (e) { flash((e as Error).message, 'error'); }
    });
  }

  function onRoleSelect(u: TeamUser, role: string) {
    if (role === u.role) return;
    if ((RANK[role] ?? 0) < (RANK[u.role] ?? 9)) {
      setConfirmRole({ userId: u.user_id, role }); // reduces access → confirm (select reverts)
    } else {
      applyRole(u, role);
    }
  }

  function handleFinanceToggle(userId: string, next: boolean) {
    startTransition(async () => {
      try {
        await updateFinanceAccess(userId, next);
        flash(next ? 'Finance access granted' : 'Finance access removed', 'success');
      } catch (e) { flash((e as Error).message, 'error'); }
    });
  }

  function doRemove(u: TeamUser) {
    startTransition(async () => {
      try { await removeUser(u.user_id); flash('Member removed', 'success'); }
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

  const roleOptionsFor = (current: string) => {
    const base = ROLE_OPTIONS;
    if (current === 'owner' || base.some((r) => r.value === current)) return base;
    return [{ value: current, label: ROLE_LABEL[current] ?? current, desc: '' }, ...base];
  };

  const q = search.trim().toLowerCase();
  const match = (u: TeamUser) => !q || (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  const team = users.filter((u) => !isClientRole(u.role) && match(u));
  const clients = users.filter((u) => isClientRole(u.role) && match(u));

  // ── One member row (shared by the Team + Clients sections) ─────────────────
  const renderRow = (u: TeamUser) => {
    const isSelf = u.user_id === currentUserId;
    const isOwner = u.role === 'owner';
    const financeOn = u.can_view_finance !== false;
    const access = u.brand_access ?? [];
    const scoped = needsBrandScope(u.role);
    const noAccess = scoped && access.length === 0;
    const expanded = expandedUser === u.user_id;
    const accessBrands = access.map((id) => brands.find((b) => b.id === id)).filter(Boolean) as Brand[];

    return (
      <div key={u.user_id} className="px-5 py-3.5 hover:bg-muted/50 transition-colors">
        {/* Top line: identity · role · actions */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--pulse-accent-2)] flex items-center justify-center text-white text-xs font-bold shrink-0">
            {(u.name || u.email)[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold text-[var(--foreground)] truncate">{u.name || u.email.split('@')[0]}</p>
              {isSelf && <span className="text-[10px] font-medium text-muted-foreground">(you)</span>}
              {u.pending && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/25">
                  Pending
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
          </div>

          {/* Role */}
          {isOwner ? (
            <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border', ROLE_STYLE.owner)}>
              <Shield className="h-3 w-3" /> Owner
            </span>
          ) : (
            <div className="relative shrink-0">
              <select
                value={u.role}
                disabled={isPending || isSelf}
                onChange={(e) => onRoleSelect(u, e.target.value)}
                className={cn(
                  'appearance-none text-xs font-semibold pl-2.5 pr-6 py-1 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 disabled:opacity-60 disabled:cursor-default',
                  ROLE_STYLE[u.role] ?? 'bg-muted text-muted-foreground border-border',
                )}
              >
                {roleOptionsFor(u.role).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none opacity-50" />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0 min-w-[52px] justify-end">
            {!isOwner && !isSelf && confirmRemove === u.user_id ? (
              <span className="flex items-center gap-1 text-xs">
                <button onClick={() => { doRemove(u); setConfirmRemove(null); }} className="font-semibold text-red-600 px-1.5 py-0.5 rounded hover:bg-red-500/10">Remove</button>
                <button onClick={() => setConfirmRemove(null)} className="text-muted-foreground px-1.5 py-0.5 rounded hover:bg-muted">Cancel</button>
              </span>
            ) : !isOwner && !isSelf ? (
              <>
                <button
                  onClick={() => handleResend(u.user_id, u.email)}
                  disabled={isPending || resendingId === u.user_id}
                  title="Resend sign-in link"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-[var(--foreground)] hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {resendingId === u.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => setConfirmRemove(u.user_id)}
                  disabled={isPending}
                  title="Remove member"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Meta line: brand access + finance (wraps on any width) */}
        <div className="flex flex-wrap items-center gap-2 mt-2 pl-12">
          {FULL_TENANT.has(u.role) ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3" /> All brands
            </span>
          ) : needsBrandScope(u.role) ? (
            <button
              onClick={() => setExpandedUser(expanded ? null : u.user_id)}
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg border transition-colors',
                noAccess ? 'border-amber-500/25 bg-amber-500/10 text-amber-500'
                  : expanded ? 'border-[var(--primary)]/40 bg-[var(--primary)]/5 text-[var(--primary)]'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {noAccess ? (
                <><AlertTriangle className="h-3 w-3" /> No brands — no access</>
              ) : (
                <>
                  <span className="flex items-center -space-x-1">
                    {accessBrands.slice(0, 4).map((b) => (
                      <span key={b.id} className="h-2.5 w-2.5 rounded-full ring-1 ring-card" style={{ backgroundColor: b.color || 'var(--muted-foreground)' }} />
                    ))}
                  </span>
                  {access.length} brand{access.length === 1 ? '' : 's'}
                </>
              )}
            </button>
          ) : null}

          {FULL_TENANT.has(u.role) ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><DollarSign className="h-3 w-3" /> Finance: full</span>
          ) : isManager(u.role) ? (
            <button
              onClick={() => handleFinanceToggle(u.user_id, !financeOn)}
              disabled={isPending}
              title={financeOn ? 'Remove Finance access' : 'Grant Finance access'}
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border transition-colors',
                financeOn ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15'
                          : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              <DollarSign className="h-3 w-3" /> {financeOn ? 'Finance: on' : 'Finance: off'}
            </button>
          ) : null}
        </div>

        {/* Role-change confirmation (access-reducing) */}
        {confirmRole?.userId === u.user_id && (
          <div className="flex items-center gap-2 mt-2 ml-12 text-xs bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-amber-500 flex-1">
              Change to <b>{ROLE_LABEL[confirmRole.role]}</b>? This reduces their access.
            </span>
            <button
              onClick={() => { applyRole(u, confirmRole.role); setConfirmRole(null); }}
              className="font-semibold text-amber-500 px-2 py-0.5 rounded hover:bg-amber-500/15"
            >
              Confirm
            </button>
            <button onClick={() => setConfirmRole(null)} className="text-muted-foreground px-2 py-0.5 rounded hover:bg-card">Cancel</button>
          </div>
        )}

        {/* Brand-access editor */}
        {expanded && (
          <div className="mt-3 ml-12 p-3 rounded-xl bg-muted border border-border">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Brand access</p>
            <div className="flex flex-wrap gap-2">
              {brands.length === 0 ? (
                <p className="text-xs text-muted-foreground">No brands set up yet.</p>
              ) : brands.map((b) => {
                const on = access.includes(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() => handleBrandAccess(u.user_id, b.id, access)}
                    disabled={isPending}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                      on ? 'bg-[var(--primary)]/10 border-[var(--primary)]/30 text-[var(--primary)]' : 'bg-card border-border text-muted-foreground hover:border-border',
                    )}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color || 'var(--muted-foreground)' }} />
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
  };

  const section = (label: string, list: TeamUser[], empty: string) => (
    <div>
      <div className="px-5 py-2.5 bg-muted/70 border-y border-border flex items-center gap-2">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{list.length}</span>
      </div>
      {list.length === 0
        ? <p className="px-5 py-6 text-center text-sm text-muted-foreground">{empty}</p>
        : <div className="divide-y divide-border">{list.map(renderRow)}</div>}
    </div>
  );

  return (
    <>
      {(success || error) && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg',
          success ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white',
        )}>
          {success || error}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-8 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">Members</h2>
              <p className="text-xs text-muted-foreground tabular-nums">{users.length} {users.length === 1 ? 'person' : 'people'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full sm:w-48 pl-8 pr-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
              />
            </div>
            <button
              onClick={() => setShowInvite(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[#e63d7d] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 focus-visible:ring-offset-1 shrink-0"
            >
              <UserPlus className="h-4 w-4" /> Invite
            </button>
          </div>
        </div>

        {/* Sections */}
        {section('Team', team, q ? 'No team members match your search.' : 'No team members yet.')}
        {(clients.length > 0 || q) && section('Clients', clients, q ? 'No clients match your search.' : 'No client contacts yet.')}
      </div>

      {/* Invite modal */}
      {showInvite && <InviteModal
        brands={brands}
        role={inviteRole} setRole={setInviteRole}
        email={inviteEmail} setEmail={setInviteEmail}
        brandIds={inviteBrandIds} toggleBrand={toggleInviteBrand}
        finance={inviteFinance} setFinance={setInviteFinance}
        pending={isPending}
        onClose={() => setShowInvite(false)}
        onSend={handleInvite}
      />}
    </>
  );
}

// ── Invite modal (Escape to close, backdrop click, focus on email) ───────────
function InviteModal(props: {
  brands: Brand[];
  role: string; setRole: (r: string) => void;
  email: string; setEmail: (e: string) => void;
  brandIds: string[]; toggleBrand: (id: string) => void;
  finance: boolean; setFinance: (b: boolean) => void;
  pending: boolean;
  onClose: () => void; onSend: () => void;
}) {
  const { brands, role, setRole, email, setEmail, brandIds, toggleBrand, finance, setFinance, pending, onClose, onSend } = props;
  const client = isClientRole(role);
  const disabled = pending || !email.trim() || (client && brandIds.length === 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-labelledby="invite-title"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center"><UserPlus className="h-4 w-4" /></span>
            <h2 id="invite-title" className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">
              {client ? 'Invite a client' : 'Invite a team member'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Email</label>
            <input
              type="email" autoFocus placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !disabled && onSend()}
              className="w-full px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Role</label>
            <div className="grid grid-cols-1 gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r.value} type="button" onClick={() => setRole(r.value)}
                  className={cn(
                    'flex items-center gap-3 text-left px-3 py-2 rounded-xl border transition-colors',
                    role === r.value ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-border hover:border-border',
                  )}
                >
                  <span className={cn('h-4 w-4 rounded-full border-2 shrink-0', role === r.value ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-border')} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[var(--foreground)]">{r.label}</span>
                    <span className="block text-[10px] text-muted-foreground leading-tight">{r.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {needsBrandScope(role) && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Brand access {client && brandIds.length === 0 && <span className="text-red-500 normal-case font-normal">(required)</span>}
              </label>
              {brands.length === 0 ? (
                <p className="text-xs text-muted-foreground">No brands set up yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {brands.map((b) => {
                    const on = brandIds.includes(b.id);
                    return (
                      <button
                        key={b.id} type="button" onClick={() => toggleBrand(b.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                          on ? 'bg-[var(--primary)]/10 border-[var(--primary)]/30 text-[var(--primary)]' : 'bg-card border-border text-muted-foreground hover:border-border',
                        )}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color || 'var(--muted-foreground)' }} />
                        {on && <Check className="h-3 w-3" />}
                        {b.display_name || b.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isManager(role) && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-border cursor-pointer select-none hover:border-border transition-colors">
              <input
                type="checkbox" checked={finance} onChange={(e) => setFinance(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border text-[var(--primary)] focus:ring-[var(--primary)]/40"
              />
              <span>
                <span className="block text-xs font-semibold text-[var(--foreground)]">Can see Finance</span>
                <span className="block text-[10px] text-muted-foreground">Earnings, Invoicing, Payments. Off by default.</span>
              </span>
            </label>
          )}

          <p className="text-[11px] text-muted-foreground">
            {client ? "They'll get an email magic link to their brand portal." : "They'll get an email to set up their account."}
          </p>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
          <button
            onClick={onSend} disabled={disabled}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[#e63d7d] disabled:opacity-50 transition-colors"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Send invite
          </button>
        </div>
      </div>
    </div>
  );
}
