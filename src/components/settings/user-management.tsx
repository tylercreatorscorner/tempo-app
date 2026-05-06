'use client';

import { useState, useTransition } from 'react';
import { Users, Plus, Trash2, ChevronDown, Shield, Check } from 'lucide-react';
import { inviteUser, updateUserRole, removeUser, updateBrandAccess } from '@/app/actions/users';
import { cn } from '@/lib/utils';

// Note: 'brand_contact' is the legacy value for the same thing as 'brand'
// (the brand portal role). Existing rows are silently treated as 'brand'
// in the brand-portal middleware/loader. The dropdown now only offers
// 'brand' (labeled "Brand Contact") so new invites land in one place.
const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', description: 'Full access to everything' },
  { value: 'manager', label: 'Manager', description: 'Manage creators, scoped to brands' },
  { value: 'analyst', label: 'Analyst', description: 'Read-only, scoped to brands' },
  { value: 'brand', label: 'Brand Contact', description: 'External client viewing their brand portal' },
];

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  manager: 'bg-emerald-100 text-emerald-700',
  analyst: 'bg-amber-100 text-amber-700',
  brand_contact: 'bg-pink-100 text-pink-700', // legacy — same color as brand
  brand: 'bg-pink-100 text-pink-700',
};

interface TeamUser {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  brand_access?: string[];
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

export function UserManagement({ users, brands, tenantId, currentUserId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('manager');
  const [inviteBrandIds, setInviteBrandIds] = useState<string[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function flash(msg: string, type: 'success' | 'error') {
    if (type === 'success') { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }
    else { setError(msg); setTimeout(() => setError(null), 4000); }
  }

  function handleInvite() {
    if (!inviteEmail.trim()) return;
    // Clients MUST have at least one brand assigned at invite time, otherwise
    // they'll log in and hit the no-access state.
    if (inviteRole === 'brand' && inviteBrandIds.length === 0) {
      flash('Select at least one brand for this client.', 'error');
      return;
    }
    startTransition(async () => {
      try {
        const result = await inviteUser(inviteEmail.trim(), inviteRole);
        // Server action returns the new user's ID — wire up brand access for client invites.
        if (inviteRole === 'brand' && inviteBrandIds.length > 0 && result?.userId) {
          await updateBrandAccess(result.userId, inviteBrandIds, tenantId);
        }
        setInviteEmail('');
        setInviteBrandIds([]);
        setShowInvite(false);
        flash('Invite sent!', 'success');
      } catch (e) {
        flash((e as Error).message, 'error');
      }
    });
  }

  function toggleInviteBrand(brandId: string) {
    setInviteBrandIds((prev) =>
      prev.includes(brandId) ? prev.filter((id) => id !== brandId) : [...prev, brandId],
    );
  }

  function handleRoleChange(userId: string, role: string) {
    startTransition(async () => {
      try {
        await updateUserRole(userId, role);
        flash('Role updated', 'success');
      } catch (e) {
        flash((e as Error).message, 'error');
      }
    });
  }

  function handleRemove(userId: string) {
    if (!confirm('Remove this user from the team?')) return;
    startTransition(async () => {
      try {
        await removeUser(userId);
        flash('User removed', 'success');
      } catch (e) {
        flash((e as Error).message, 'error');
      }
    });
  }

  function handleBrandAccess(userId: string, brandId: string, currentAccess: string[]) {
    const next = currentAccess.includes(brandId)
      ? currentAccess.filter(id => id !== brandId)
      : [...currentAccess, brandId];
    startTransition(async () => {
      try {
        await updateBrandAccess(userId, next, tenantId);
      } catch (e) {
        flash((e as Error).message, 'error');
      }
    });
  }

  const needsBrandScope = (role: string) => ['manager', 'analyst', 'brand_contact', 'brand'].includes(role);
  // Both legacy and canonical brand-contact roles require brand assignment at invite time
  const isClientRole = (role: string) => role === 'brand' || role === 'brand_contact';

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">Team Members</h2>
            <p className="text-sm text-muted-foreground">Manage access and roles</p>
          </div>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Invite
        </button>
      </div>

      {/* Feedback */}
      {(success || error) && (
        <div className={cn('mx-6 mt-4 px-4 py-2.5 rounded-lg text-sm', success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
          {success || error}
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div className="p-6 border-b border-border bg-muted/30 space-y-3">
          <p className="text-sm font-medium">
            {isClientRole(inviteRole) ? 'Invite a client' : 'Invite a team member'}
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none"
            >
              {ROLE_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <button
              onClick={handleInvite}
              disabled={isPending || !inviteEmail.trim() || (isClientRole(inviteRole) && inviteBrandIds.length === 0)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Send
            </button>
          </div>

          {/* Brand picker when inviting a client */}
          {isClientRole(inviteRole) && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">
                Brand access {inviteBrandIds.length === 0 && <span className="text-red-500">(required)</span>}
              </p>
              {brands.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No brands set up yet — connect a brand before inviting clients.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {brands.map((b) => {
                    const checked = inviteBrandIds.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleInviteBrand(b.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                          checked
                            ? 'bg-primary/10 border-primary/30 text-primary'
                            : 'bg-white border-border text-gray-500 hover:border-gray-300',
                        )}
                      >
                        {checked && <Check className="h-3 w-3" />}
                        {b.display_name || b.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {isClientRole(inviteRole)
              ? "They'll receive an email magic link to log in to their brand portal."
              : "They'll receive an email to set up their account."}
          </p>
        </div>
      )}

      {/* User list */}
      <div className="divide-y divide-border">
        {users.map(u => (
          <div key={u.user_id}>
            <div className="p-4 flex items-center justify-between gap-3">
              {/* Avatar + info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {(u.name || u.email)[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{u.name || '—'}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Role badge / selector */}
                {u.role === 'owner' ? (
                  <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1', ROLE_COLORS.owner)}>
                    <Shield className="h-3 w-3" /> Owner
                  </span>
                ) : (
                  <div className="relative">
                    <select
                      defaultValue={u.role}
                      disabled={isPending || u.user_id === currentUserId}
                      onChange={e => handleRoleChange(u.user_id, e.target.value)}
                      className={cn(
                        'text-xs pl-2.5 pr-6 py-1 rounded-full font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none',
                        ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none opacity-50" />
                  </div>
                )}

                {/* Brand access toggle for scoped roles */}
                {needsBrandScope(u.role) && brands.length > 0 && (
                  <button
                    onClick={() => setExpandedUser(expandedUser === u.user_id ? null : u.user_id)}
                    className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-muted/50 transition-colors text-gray-500"
                  >
                    Brands
                  </button>
                )}

                {/* Remove */}
                {u.role !== 'owner' && u.user_id !== currentUserId && (
                  <button
                    onClick={() => handleRemove(u.user_id)}
                    disabled={isPending}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Brand access panel */}
            {expandedUser === u.user_id && (
              <div className="px-4 pb-4 ml-12">
                <p className="text-xs font-medium text-gray-500 mb-2">Brand access</p>
                <div className="flex flex-wrap gap-2">
                  {brands.map(b => {
                    const hasAccess = (u.brand_access ?? []).includes(b.id);
                    return (
                      <button
                        key={b.id}
                        onClick={() => handleBrandAccess(u.user_id, b.id, u.brand_access ?? [])}
                        disabled={isPending}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                          hasAccess
                            ? 'bg-primary/10 border-primary/30 text-primary'
                            : 'bg-white border-border text-gray-500 hover:border-gray-300'
                        )}
                      >
                        {hasAccess && <Check className="h-3 w-3" />}
                        {b.display_name || b.name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Select which brands this user can access.</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
