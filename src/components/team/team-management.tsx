'use client';

/**
 * Team + client access, rebuilt as a dense table.
 *
 * ── What was wrong with the card list ────────────────────────────────────────
 *
 * 🚨 THE PAGE HID THE ONLY FACT THAT MATTERS ON IT. Of 22 accounts, nearly all
 * were Admin with All brands and Finance: full, and because every row rendered
 * identically there was nothing on screen that said so. An access page whose
 * layout cannot show a concentration of access is not doing its job. The
 * summary strip now states it in a line, and rows sort by access so the
 * elevated accounts are the ones you read first.
 *
 * ⚠️ SEVEN ROLE COLOURS, four chip treatments. Owner purple, admin blue,
 * manager emerald, coach cyan, viewer slate, analyst amber, brand pink, plus
 * amber Pending, emerald Finance and a bordered brand-count button. None of it
 * encoded severity: the rainbow was decoration, and it made a page where four
 * accounts genuinely need attention look uniformly busy. Colour is now
 * semantic only: amber means someone is locked out or has not accepted,
 * emerald means finance is on, primary means selected or interactive.
 *
 * ⚠️ THE ROLE CONTROL LOOKED LIKE A BADGE. It was a <select> styled as a
 * coloured pill, so the one genuinely destructive control on each row read as
 * a status label. It is a select that looks like a select now.
 *
 * ⚠️ "All brands / Finance: full" repeated verbatim on 19 of 22 rows. Facts
 * that are identical everywhere carry no information per row; they belong in
 * the summary and in a column you can scan down.
 *
 * ⚠️ Brand access opened a wall of 18 pills. Replaced with a checkbox grid
 * plus select-all / clear, which is scannable at any brand count and does not
 * reflow as you click. Pills are for filters you toggle occasionally, not for
 * a permission matrix.
 *
 * ── What is deliberately unchanged ───────────────────────────────────────────
 *
 * Every access rule and server action. 'analyst' stays out of ROLE_OPTIONS
 * because getWorkspaceScope has no case for it and offering it mints dead
 * accounts; coaches still have no finance toggle at all; client roles still
 * cannot be invited without a brand; an access-REDUCING role change still asks
 * first; owner and self rows are still not editable.
 */

import { Fragment, useState, useTransition } from 'react';
import {
  UserPlus, Shield, Mail, Trash2, Loader2, X, Users, Search, AlertTriangle, Check,
} from 'lucide-react';
import {
  inviteUser,
  updateUserRole,
  updateFinanceAccess,
  removeUser,
  updateBrandAccess,
  resendMagicLink,
} from '@/app/actions/users';
import { TableCard, Table, THead, TBody, TR, TH, TD, DataAvatar } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

// Assignable roles. 'analyst' is intentionally NOT here — getWorkspaceScope has no
// case for it (it resolves to null = no access), so offering it would mint dead
// accounts. Re-add once a real scoped read-only role is wired up.
const ROLE_OPTIONS = [
  { value: 'admin',   label: 'Admin',         desc: 'Full access, all brands' },
  { value: 'manager', label: 'Manager',       desc: 'Manage creators, scoped to brands' },
  { value: 'coach',   label: 'Coach',         desc: 'Works creators for assigned brands, no finance' },
  { value: 'brand',   label: 'Brand Contact', desc: 'External client, brand portal only' },
];
const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', manager: 'Manager', coach: 'Coach', viewer: 'Viewer',
  analyst: 'Analyst', brand: 'Brand Contact', brand_contact: 'Brand Contact',
};
// Higher = more access. A change to a lower rank asks for confirmation, and
// this is also the table's sort key: the accounts that can do the most are the
// ones worth reading first.
const RANK: Record<string, number> = {
  owner: 4, admin: 3, viewer: 3, manager: 2, coach: 2, analyst: 2, brand: 1, brand_contact: 1,
};

const FULL_TENANT = new Set(['owner', 'admin', 'viewer']);
const isManager = (r: string) => r === 'manager';
// Coaches NEVER see Finance — no toggle, no column read; hardcoded off everywhere.
const isCoach = (r: string) => r === 'coach';
const isClientRole = (r: string) => r === 'brand' || r === 'brand_contact';
const needsBrandScope = (r: string) => ['manager', 'coach', 'brand', 'brand_contact'].includes(r);
/** Whether this account can reach Finance, by the same rule the server uses. */
const seesFinance = (u: TeamUser) =>
  FULL_TENANT.has(u.role) ? true : isCoach(u.role) ? false : isManager(u.role) ? u.can_view_finance !== false : false;

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
  is_archived?: boolean;
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
        // Coach is a hard finance no (the server re-enforces this); managers use
        // the checkbox; full-tenant roles always see finance.
        const canFin = isCoach(inviteRole) ? false : isManager(inviteRole) ? inviteFinance : true;
        const result = await inviteUser(inviteEmail.trim(), inviteRole, canFin);
        if (needsBrandScope(inviteRole) && inviteBrandIds.length > 0 && result?.userId) {
          await updateBrandAccess(result.userId, inviteBrandIds, tenantId);
        }
        resetInvite();
        setShowInvite(false);
        flash('Invite sent', 'success');
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

  function setAllBrands(userId: string, ids: string[]) {
    startTransition(async () => {
      try { await updateBrandAccess(userId, ids, tenantId); }
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
  // Most access first, then alphabetical. The rows you most need to audit are
  // the ones you cannot avoid reading.
  const byAccess = (a: TeamUser, b: TeamUser) =>
    (RANK[b.role] ?? 0) - (RANK[a.role] ?? 0) ||
    (a.name || a.email).localeCompare(b.name || b.email);
  const team = users.filter((u) => !isClientRole(u.role) && match(u)).sort(byAccess);
  const clients = users.filter((u) => isClientRole(u.role) && match(u)).sort(byAccess);

  /**
   * What this page is actually for.
   *
   * 🚨 The card list could not tell you that 19 of 22 accounts held the whole
   * tenant. Four counts, over the UNFILTERED list so a search cannot make a
   * risk disappear, and only the two that can represent a problem take colour.
   */
  const stats = {
    fullTenant: users.filter((u) => FULL_TENANT.has(u.role)).length,
    finance: users.filter(seesFinance).length,
    pending: users.filter((u) => u.pending).length,
    lockedOut: users.filter((u) => needsBrandScope(u.role) && (u.brand_access ?? []).length === 0).length,
  };

  // ── One member row ─────────────────────────────────────────────────────────
  const renderRow = (u: TeamUser) => {
    const isSelf = u.user_id === currentUserId;
    const isOwner = u.role === 'owner';
    const access = u.brand_access ?? [];
    const scoped = needsBrandScope(u.role);
    const noAccess = scoped && access.length === 0;
    const expanded = expandedUser === u.user_id;
    const accessBrands = access.map((id) => brands.find((b) => b.id === id)).filter(Boolean) as Brand[];
    const locked = isOwner || isSelf;

    // ⚠️ A member can emit up to THREE rows (the row itself, a role-change
    // confirmation, a brand editor), so the key goes on the Fragment returned
    // to .map() and not on the first <TR> inside it.
    return (
      <Fragment key={u.user_id}>
        <TR className={cn('hover:bg-secondary/60', expanded && 'bg-secondary/60')}>
          {/* Identity */}
          <TD className="py-2.5">
            <div className="flex items-center gap-2.5">
              <DataAvatar>{(u.name || u.email)[0]?.toUpperCase()}</DataAvatar>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-semibold text-foreground">
                    {u.name || u.email.split('@')[0]}
                  </span>
                  {isSelf && <span className="text-[11px] text-muted-foreground">you</span>}
                </div>
                <div className="truncate text-[12px] text-muted-foreground">{u.email}</div>
              </div>
            </div>
          </TD>

          {/* Role. A select that looks like a select. */}
          <TD className="text-left">
            {isOwner ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" /> Owner
              </span>
            ) : (
              <Select
                value={u.role}
                disabled={isPending || isSelf}
                onChange={(e) => onRoleSelect(u, e.target.value)}
                aria-label={`Role for ${u.email}`}
                className="py-[7px] text-[13px]"
              >
                {roleOptionsFor(u.role).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            )}
          </TD>

          {/* Brand access */}
          <TD className="text-left">
            {FULL_TENANT.has(u.role) ? (
              <span className="text-[13px] text-muted-foreground">All brands</span>
            ) : scoped ? (
              <button
                type="button"
                onClick={() => setExpandedUser(expanded ? null : u.user_id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors',
                  noAccess
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : expanded
                      ? 'border-primary/40 bg-primary/5 text-primary'
                      : 'border-border text-foreground hover:bg-secondary',
                )}
              >
                {noAccess ? (
                  <><AlertTriangle className="h-3.5 w-3.5" /> No brands, no access</>
                ) : (
                  <>
                    <span className="flex items-center -space-x-1">
                      {accessBrands.slice(0, 4).map((b) => (
                        <span
                          key={b.id}
                          className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-card"
                          style={{ backgroundColor: b.color || 'var(--muted-foreground)' }}
                        />
                      ))}
                    </span>
                    {access.length} brand{access.length === 1 ? '' : 's'}
                  </>
                )}
              </button>
            ) : (
              <span className="text-[13px] text-muted-foreground">&mdash;</span>
            )}
          </TD>

          {/* Finance. A switch only where there is a real choice. */}
          <TD className="text-left">
            {isManager(u.role) ? (
              <div className="flex items-center gap-2">
                <Switch
                  checked={u.can_view_finance !== false}
                  onCheckedChange={(next) => handleFinanceToggle(u.user_id, next)}
                  disabled={isPending}
                  aria-label={`Finance access for ${u.email}`}
                />
                <span className="text-[12.5px] text-muted-foreground">
                  {u.can_view_finance !== false ? 'On' : 'Off'}
                </span>
              </div>
            ) : (
              <span className="text-[13px] text-muted-foreground">
                {FULL_TENANT.has(u.role) ? 'Full' : 'None'}
              </span>
            )}
          </TD>

          {/* Invite state. Its own column so it cannot shove the name around. */}
          <TD className="text-left">
            {u.pending ? (
              <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">
                Not accepted
              </span>
            ) : (
              <span className="text-[13px] text-muted-foreground">Active</span>
            )}
          </TD>

          {/* Actions */}
          <TD>
            <div className="flex items-center justify-end gap-1">
              {locked ? null : confirmRemove === u.user_id ? (
                <span className="flex items-center gap-1">
                  <button
                    onClick={() => { doRemove(u); setConfirmRemove(null); }}
                    className="rounded-md px-2 py-1 text-[12.5px] font-semibold text-red-600 hover:bg-red-500/10"
                  >
                    Remove
                  </button>
                  <button
                    onClick={() => setConfirmRemove(null)}
                    className="rounded-md px-2 py-1 text-[12.5px] text-muted-foreground hover:bg-secondary"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <>
                  <button
                    onClick={() => handleResend(u.user_id, u.email)}
                    disabled={isPending || resendingId === u.user_id}
                    title="Resend sign-in link"
                    aria-label={`Resend sign-in link to ${u.email}`}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                  >
                    {resendingId === u.user_id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Mail className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => setConfirmRemove(u.user_id)}
                    disabled={isPending}
                    title="Remove member"
                    aria-label={`Remove ${u.email}`}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </TD>
        </TR>

        {/* Access-reducing role change. Sits in the flow rather than as a modal
            so the row it is about stays visible. */}
        {confirmRole?.userId === u.user_id && (
          <TR>
            <TD colSpan={6} className="bg-amber-500/5 py-2.5 text-left">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="text-foreground">
                  Change <b>{u.name || u.email}</b> to <b>{ROLE_LABEL[confirmRole.role]}</b>? This reduces their access.
                </span>
                <button
                  onClick={() => { applyRole(u, confirmRole.role); setConfirmRole(null); }}
                  className="rounded-md bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-600 hover:bg-amber-500/25 dark:text-amber-400"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmRole(null)}
                  className="rounded-md px-2.5 py-1 text-muted-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
              </div>
            </TD>
          </TR>
        )}

        {/* Brand-access editor. A checkbox grid, not a pill wall: it stays
            scannable at any brand count and does not reflow as you click. */}
        {expanded && (
          <TR>
            <TD colSpan={6} className="bg-secondary/40 py-3 text-left">
              <BrandPicker
                brands={brands}
                selected={access}
                disabled={isPending}
                onToggle={(id) => handleBrandAccess(u.user_id, id, access)}
                onSelectAll={(ids) => setAllBrands(u.user_id, ids)}
                onClear={() => setAllBrands(u.user_id, [])}
                onDone={() => setExpandedUser(null)}
              />
            </TD>
          </TR>
        )}
      </Fragment>
    );
  };

  const sectionHead = (label: string, count: number) => (
    <TR>
      <TD colSpan={6} className="border-b border-border bg-secondary px-4 py-2 text-left">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
          {label}
        </span>
        <span className="ml-2 text-[10.5px] font-bold tabular-nums text-muted-foreground">{count}</span>
      </TD>
    </TR>
  );

  return (
    <div className="space-y-4">
      {(success || error) && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg',
          success ? 'bg-emerald-600' : 'bg-red-500',
        )}>
          {success || error}
        </div>
      )}

      {/* What the table adds up to. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Full tenant access" value={stats.fullTenant} of={users.length}
              note="Owner, Admin and Viewer see every brand" />
        <Stat label="Can see finance" value={stats.finance} of={users.length}
              note="Earnings, Invoicing and Payments" />
        <Stat label="Invite not accepted" value={stats.pending} of={users.length}
              note="Never signed in" tone={stats.pending > 0 ? 'warn' : undefined} />
        <Stat label="Locked out" value={stats.lockedOut} of={users.length}
              note="Scoped role with no brand" tone={stats.lockedOut > 0 ? 'warn' : undefined} />
      </div>

      <TableCard>
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[13.5px] font-bold tracking-tight text-foreground">Members</h2>
              <p className="text-[12px] tabular-nums text-muted-foreground">
                {users.length} {users.length === 1 ? 'person' : 'people'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email"
                aria-label="Search members"
                className="w-full rounded-md border border-input bg-card py-2 pl-8 pr-3 text-[13.5px] text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 sm:w-56"
              />
            </div>
            <button
              onClick={() => setShowInvite(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1"
            >
              <UserPlus className="h-4 w-4" /> Invite
            </button>
          </div>
        </div>

        {/* ⚠️ The table scrolls inside its own container. Six columns of
            controls do not compress below roughly 900px, and letting the page
            body scroll sideways instead would move the whole layout. */}
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <THead>
              <TR>
                <TH className="w-[30%]">Member</TH>
                <TH className="text-left">Role</TH>
                <TH className="text-left">Brand access</TH>
                <TH className="text-left">Finance</TH>
                <TH className="text-left">Invite</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {sectionHead('Team', team.length)}
              {team.length === 0 ? (
                <TR><TD colSpan={6} className="py-8 text-center text-[13.5px] text-muted-foreground">
                  {q ? 'No team members match your search.' : 'No team members yet.'}
                </TD></TR>
              ) : team.map(renderRow)}

              {(clients.length > 0 || q) && (
                <>
                  {sectionHead('Clients', clients.length)}
                  {clients.length === 0 ? (
                    <TR><TD colSpan={6} className="py-8 text-center text-[13.5px] text-muted-foreground">
                      {q ? 'No clients match your search.' : 'No client contacts yet.'}
                    </TD></TR>
                  ) : clients.map(renderRow)}
                </>
              )}
            </TBody>
          </Table>
        </div>
      </TableCard>

      {showInvite && <InviteModal
        brands={brands}
        role={inviteRole} setRole={setInviteRole}
        email={inviteEmail} setEmail={setInviteEmail}
        brandIds={inviteBrandIds} toggleBrand={toggleInviteBrand}
        setBrandIds={setInviteBrandIds}
        finance={inviteFinance} setFinance={setInviteFinance}
        pending={isPending}
        onClose={() => setShowInvite(false)}
        onSend={handleInvite}
      />}
    </div>
  );
}

/** One summary figure. `warn` is reserved for counts that represent a problem. */
function Stat({
  label, value, of, note, tone,
}: { label: string; value: number; of: number; note: string; tone?: 'warn' }) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card px-3.5 py-3',
        tone === 'warn' ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-border',
      )}
    >
      <div className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className={cn(
          'text-[20px] font-extrabold tabular-nums',
          tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
        )}>
          {value}
        </span>
        <span className="text-[12px] tabular-nums text-muted-foreground">of {of}</span>
      </div>
      <div className="mt-0.5 text-[11.5px] leading-tight text-muted-foreground">{note}</div>
    </div>
  );
}

/**
 * Brand permission matrix.
 *
 * ⚠️ An ARCHIVED brand is hidden unless this user already has it, in which case
 * it is shown and labelled. Offering archived brands invites granting access to
 * something nobody can reach; hiding one that is already granted would make an
 * existing permission invisible, which is worse.
 */
function BrandPicker({
  brands, selected, disabled, onToggle, onSelectAll, onClear, onDone, columns = 'wide',
}: {
  brands: Brand[];
  selected: string[];
  disabled?: boolean;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClear: () => void;
  onDone?: () => void;
  /**
   * 🚨 TAILWIND BREAKPOINTS MEASURE THE VIEWPORT, NOT THE CONTAINER. The
   * responsive grid below resolved to FOUR columns inside a 512px modal on a
   * wide screen, clipping every label: "LeeFar Nutrition Co.", "LeeFar
   * Nutrition US" and "LeeFar Supplements" all rendered as "Lee...", which
   * makes a permission list impossible to use correctly. The modal asks for
   * 'narrow' explicitly rather than trusting the screen width.
   */
  columns?: 'wide' | 'narrow';
}) {
  const visible = brands.filter((b) => !b.is_archived || selected.includes(b.id));
  const allIds = visible.filter((b) => !b.is_archived).map((b) => b.id);

  if (visible.length === 0) {
    return <p className="text-[13px] text-muted-foreground">No brands set up yet.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
          Brand access
        </span>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {selected.length} of {visible.length} selected
        </span>
        <span className="flex-1" />
        <button
          type="button" disabled={disabled} onClick={() => onSelectAll(allIds)}
          className="rounded-md px-2 py-0.5 text-[12px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          Select all
        </button>
        <button
          type="button" disabled={disabled} onClick={onClear}
          className="rounded-md px-2 py-0.5 text-[12px] text-muted-foreground hover:bg-secondary disabled:opacity-50"
        >
          Clear
        </button>
        {onDone && (
          <button
            type="button" onClick={onDone}
            className="rounded-md px-2 py-0.5 text-[12px] text-muted-foreground hover:bg-secondary"
          >
            Done
          </button>
        )}
      </div>
      <div className={cn(
        'grid gap-x-4 gap-y-1',
        columns === 'narrow' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4',
      )}>
        {visible.map((b) => {
          const on = selected.includes(b.id);
          return (
            <label
              key={b.id}
              className={cn(
                'flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-card',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <span
                className={cn(
                  'grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border transition-colors',
                  on ? 'border-primary bg-primary text-white' : 'border-input bg-card',
                )}
              >
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <input
                type="checkbox" className="sr-only" checked={on} disabled={disabled}
                onChange={() => onToggle(b.id)}
              />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: b.color || 'var(--muted-foreground)' }}
              />
              <span className="truncate text-[13px] text-foreground">{b.display_name || b.name}</span>
              {b.is_archived && (
                <span className="shrink-0 text-[11px] text-muted-foreground">archived</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Invite modal (Escape to close, backdrop click, focus on email) ───────────
function InviteModal(props: {
  brands: Brand[];
  role: string; setRole: (r: string) => void;
  email: string; setEmail: (e: string) => void;
  brandIds: string[]; toggleBrand: (id: string) => void; setBrandIds: (ids: string[]) => void;
  finance: boolean; setFinance: (b: boolean) => void;
  pending: boolean;
  onClose: () => void; onSend: () => void;
}) {
  const {
    brands, role, setRole, email, setEmail, brandIds, toggleBrand, setBrandIds,
    finance, setFinance, pending, onClose, onSend,
  } = props;
  const client = isClientRole(role);
  const disabled = pending || !email.trim() || (client && brandIds.length === 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-labelledby="invite-title"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      {/* Capped and scrollable: the brand picker grows with the brand list, and
          a modal that outgrows the viewport strands its own Send button. */}
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-primary/10 text-primary">
              <UserPlus className="h-4 w-4" />
            </span>
            <h2 id="invite-title" className="text-[13.5px] font-bold tracking-tight text-foreground">
              {client ? 'Invite a client' : 'Invite a team member'}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 transition-colors hover:bg-secondary">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          <div>
            <label htmlFor="invite-email" className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
              Email
            </label>
            <input
              id="invite-email" type="email" autoFocus placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !disabled && onSend()}
              className="w-full rounded-md border border-input bg-card px-3 py-2.5 text-[13.5px] text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
              Role
            </span>
            <div className="grid gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r.value} type="button" onClick={() => setRole(r.value)}
                  aria-pressed={role === r.value}
                  className={cn(
                    'flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
                    role === r.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary',
                  )}
                >
                  <span className={cn(
                    'h-4 w-4 shrink-0 rounded-full border-2',
                    role === r.value ? 'border-primary bg-primary' : 'border-input',
                  )} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-foreground">{r.label}</span>
                    <span className="block text-[11.5px] leading-tight text-muted-foreground">{r.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {needsBrandScope(role) && (
            <div className="rounded-md border border-border p-3">
              <BrandPicker
                brands={brands}
                selected={brandIds}
                onToggle={toggleBrand}
                onSelectAll={setBrandIds}
                onClear={() => setBrandIds([])}
                columns="narrow"
              />
              {client && brandIds.length === 0 && (
                <p className="mt-2 text-[12px] text-amber-600 dark:text-amber-400">
                  A client contact needs at least one brand, or they will sign in to nothing.
                </p>
              )}
            </div>
          )}

          {isManager(role) && (
            <label className="flex cursor-pointer select-none items-center gap-3 rounded-md border border-border p-3 transition-colors hover:bg-secondary">
              <Switch checked={finance} onCheckedChange={setFinance} aria-label="Can see Finance" />
              <span>
                <span className="block text-[13px] font-semibold text-foreground">Can see Finance</span>
                <span className="block text-[11.5px] text-muted-foreground">
                  Earnings, Invoicing, Payments. Off by default.
                </span>
              </span>
            </label>
          )}

          {/* Coaches never see Finance. Stated plainly rather than as a disabled
              toggle, which would imply it could be turned on. */}
          {isCoach(role) && (
            <div className="rounded-md border border-border p-3">
              <span className="block text-[13px] font-semibold text-foreground">Finance: none</span>
              <span className="block text-[11.5px] text-muted-foreground">
                Coaches never see Earnings, Invoicing, or Payments.
              </span>
            </div>
          )}

          <p className="text-[11.5px] text-muted-foreground">
            {client
              ? 'They will get an email magic link to their brand portal.'
              : 'They will get an email to set up their account.'}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            onClick={onSend} disabled={disabled}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Send invite
          </button>
        </div>
      </div>
    </div>
  );
}
