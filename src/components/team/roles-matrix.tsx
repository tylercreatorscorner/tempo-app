'use client';

/**
 * Roles rail + access matrix.
 *
 * Screens down, levels across, saving straight to role_permissions. The rail
 * lists roles with their headcount; defaults carry a lock and are read-only,
 * because a default is the thing every custom role was copied FROM and editing
 * one in place silently rewrites what "Manager" means for everyone holding it.
 *
 * ⚠️ THE MATRIX IS THE CAPABILITY AXIS ONLY. Which brands a person can reach is
 * the separate control on their member row. Putting reach in here would mean a
 * row per screen per brand, which is unusable at 16 clients.
 *
 * ⚠️ A dash, not an unticked box, where a level does not apply. An empty
 * checkbox invites you to tick it; a dash says the question is not asked. Only
 * screens that have something to configure offer configure.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, Copy, Trash2, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SCREEN_GROUPS, SCREEN_LABELS, type Screen, type Level } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';

const LEVELS: Level[] = ['read', 'write', 'configure'];

/**
 * Which levels each screen actually has.
 *
 * ⚠️ Not every screen has three meaningful powers, and offering a checkbox that
 * does nothing is worse than offering none: it implies an enforcement point
 * that does not exist. Dashboard is a view; Retention and Affiliates are
 * analyses. Configure exists only where there is genuinely something to set up.
 */
const LEVELS_FOR: Partial<Record<Screen, Level[]>> = {
  dashboard: ['read'],
  retention: ['read'],
  affiliates: ['read'],
  drops: ['read', 'write'],
  posts: ['read'],
  products: ['read', 'write'],
  earnings: ['read'],
  payments: ['read', 'write'],
  upload: ['read', 'write'],
};
const levelsFor = (s: Screen): Level[] => LEVELS_FOR[s] ?? LEVELS;

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  members: number;
  permissions: string[];
}

export function RolesMatrix() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async (keep?: string) => {
    try {
      const res = await fetch('/api/roles');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const list = data.roles as Role[];
      setRoles(list);
      setSelected((cur) => keep ?? cur ?? list[0]?.id ?? null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const role = useMemo(() => roles.find((r) => r.id === selected) ?? null, [roles, selected]);

  // Draft resets whenever the selected role changes, so unsaved edits to one
  // role can never be written onto another.
  useEffect(() => {
    setDraft(role ? new Set(role.permissions) : null);
    setSaved(false);
  }, [role]);

  const dirty = useMemo(() => {
    if (!role || !draft) return false;
    const orig = new Set(role.permissions);
    if (orig.size !== draft.size) return true;
    for (const k of draft) if (!orig.has(k)) return true;
    return false;
  }, [role, draft]);

  function toggle(screen: Screen, level: Level) {
    if (!draft || role?.isDefault) return;
    const key = `${screen}:${level}`;
    const next = new Set(draft);
    if (next.has(key)) {
      next.delete(key);
      // Removing read removes everything: a role that can write but not open
      // the screen is not a state anyone means to create.
      if (level === 'read') for (const l of LEVELS) next.delete(`${screen}:${l}`);
    } else {
      next.add(key);
      // Granting anything grants read, for the same reason.
      next.add(`${screen}:read`);
    }
    setDraft(next);
    setSaved(false);
  }

  async function save() {
    if (!role || !draft) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/roles?id=${role.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: [...draft] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await load(role.id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(from: Role) {
    const name = window.prompt('Name for the new role', `${from.name} copy`);
    if (!name?.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from.id, name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await load(data.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: Role) {
    if (!window.confirm(`Delete the ${r.name} role?`)) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/roles?id=${r.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSelected(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-[13.5px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading roles…
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
      {/* ── Roles rail ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[13.5px] font-bold tracking-tight text-foreground">Roles</h2>
          {role && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => duplicate(role)}>
              <Copy className="h-3.5 w-3.5" />
              New role
            </Button>
          )}
        </div>
        <div className="p-1.5">
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelected(r.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                r.id === selected ? 'bg-secondary' : 'hover:bg-secondary/60',
              )}
            >
              {r.isDefault && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
              <span className={cn(
                'min-w-0 flex-1 truncate text-[13.5px]',
                r.id === selected ? 'font-semibold text-foreground' : 'text-foreground',
              )}>
                {r.name}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{r.members}</span>
            </button>
          ))}
        </div>
        <p className="border-t border-border px-4 py-2.5 text-[11.5px] leading-[1.5] text-muted-foreground">
          Defaults are read-only. Duplicate one to make it editable.
        </p>
      </div>

      {/* ── Matrix ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-[13.5px] font-bold tracking-tight text-foreground">
            Access {role ? `— ${role.name}` : ''}
          </h2>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-[12.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}
            {role?.isDefault ? (
              <>
                <span title="A default role is the template other roles copy. Editing it in place would change what it means for everyone who already has it.">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => duplicate(role)}>
                  Duplicate to edit
                </Button>
              </>
            ) : role ? (
              <>
                {role.members === 0 && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(role)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button size="sm" disabled={busy || !dirty} onClick={save}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {dirty ? 'Save changes' : 'Saved'}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {error && (
          <p className="border-b border-border bg-red-500/10 px-4 py-2 text-[12.5px] text-red-600">{error}</p>
        )}

        {!role ? (
          <p className="px-4 py-8 text-center text-[13.5px] text-muted-foreground">Pick a role.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-border bg-secondary px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                    Screen
                  </th>
                  {LEVELS.map((l) => (
                    <th key={l} className="w-[110px] border-b border-border bg-secondary px-4 py-2.5 text-center text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCREEN_GROUPS.map((g) => (
                  // ⚠️ A group emits a header row AND its screen rows, so the
                  // key belongs on the Fragment returned to .map(), not on
                  // the first <tr> inside it.
                  <Fragment key={g.label}>
                    {/* Group headers are the nav's own sections, so the matrix
                        reads in the same order as the app it governs. */}
                    <tr>
                      <td colSpan={4} className="border-b border-border bg-secondary/50 px-4 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                        {g.label}
                      </td>
                    </tr>
                    {g.screens.map((s) => {
                      const allowed = levelsFor(s);
                      return (
                        <tr key={s} className="hover:bg-secondary/40">
                          <td className="border-b border-border px-4 py-2 text-[13.5px] text-foreground">
                            {SCREEN_LABELS[s]}
                          </td>
                          {LEVELS.map((l) => {
                            const applies = allowed.includes(l);
                            const on = draft?.has(`${s}:${l}`) ?? false;
                            return (
                              <td key={l} className="border-b border-border px-4 py-2 text-center">
                                {!applies ? (
                                  <span className="text-muted-foreground" aria-label="not applicable">&mdash;</span>
                                ) : (
                                  <label
                                    className={cn(
                                      'inline-flex items-center justify-center',
                                      role.isDefault || busy ? 'cursor-not-allowed' : 'cursor-pointer',
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      className="peer sr-only"
                                      checked={on}
                                      disabled={role.isDefault || busy}
                                      onChange={() => toggle(s, l)}
                                      aria-label={`${SCREEN_LABELS[s]} ${l}`}
                                    />
                                    {/* ⚠️ DRAWN, NOT NATIVE. A disabled native
                                        checkbox is nearly invisible at this size,
                                        so every locked default role looked as
                                        though it had no permissions at all — the
                                        opposite of the truth, on the screen whose
                                        whole job is showing what a role can do. */}
                                    <span
                                      className={cn(
                                        'grid h-[17px] w-[17px] place-items-center rounded-[4px] border transition-colors',
                                        on ? 'border-primary bg-primary text-white' : 'border-input bg-card',
                                        (role.isDefault || busy) && 'opacity-90',
                                        'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-1',
                                      )}
                                    >
                                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                                    </span>
                                  </label>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 🚨 The one thing a matrix must not let anyone believe. */}
        <p className="border-t border-border px-4 py-2.5 text-[11.5px] leading-[1.5] text-muted-foreground">
          Which brands a member can reach is set on their row above, not here. Finance also honours
          each person&rsquo;s own finance access, and coaches never see it whatever this says.
        </p>
      </div>
    </div>
  );
}
