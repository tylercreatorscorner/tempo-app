'use client';

/**
 * Automations page — list + builder + run history.
 *
 * Three views:
 *   1. Default: list of saved automations with last-run status, enable toggle,
 *      run-now button, click-to-expand for run history
 *   2. Drawer (when "New" clicked): builder form — trigger + integration +
 *      action + params
 *   3. Drawer (when row clicked): edit + history
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Zap, Plus, Play, Loader2, X, AlertCircle, CheckCircle2, Clock,
  Trash2, Pencil, Calendar, Hand, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModalOverlay } from '@/components/ui/modal-overlay';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Step {
  integration_id: string;
  action: string;
  params: Record<string, unknown>;
}

interface Automation {
  id: string;
  name: string;
  description: string | null;
  brand_id: string | null;
  trigger_type: 'cron' | 'event' | 'manual';
  trigger_config: Record<string, unknown> | null;
  steps: Step[];
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

interface IntegrationSummary {
  id: string;
  type: string;
  displayName: string;
  brandName: string | null;
  status: string;
}

interface ActionParam {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'channel-picker' | 'number';
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  rows?: number;
  defaultValue?: string | number;
}

interface ActionDef {
  integrationType: string;
  action: string;
  label: string;
  description: string;
  params: ActionParam[];
}

interface ChannelOption {
  id: string;
  name: string;
  parentName: string | null;
  isAnnouncement: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function AutomationsClient() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Automation | 'new' | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/automations');
      const j = await res.json() as { automations?: Automation[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Failed to load automations');
      setAutomations(j.automations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function runNow(id: string) {
    setRunningId(id);
    try {
      const res = await fetch(`/api/automations/${id}/run`, { method: 'POST' });
      const j = await res.json() as { ok: boolean; status?: string; error?: string | null };
      if (j.ok) {
        setToast({ kind: 'success', message: 'Automation fired successfully' });
      } else {
        setToast({ kind: 'error', message: j.error ?? `Run ${j.status ?? 'failed'}` });
      }
      await refresh();
    } catch (e) {
      setToast({ kind: 'error', message: e instanceof Error ? e.message : 'Run failed' });
    } finally {
      setRunningId(null);
    }
  }

  async function toggleEnabled(a: Automation) {
    try {
      const res = await fetch(`/api/automations/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !a.enabled }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Toggle failed');
      }
      await refresh();
    } catch (e) {
      setToast({ kind: 'error', message: e instanceof Error ? e.message : 'Toggle failed' });
    }
  }

  async function remove(a: Automation) {
    if (!confirm(`Delete "${a.name}"? This also removes its run history.`)) return;
    try {
      const res = await fetch(`/api/automations/${a.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Delete failed');
      }
      setToast({ kind: 'success', message: 'Deleted' });
      await refresh();
    } catch (e) {
      setToast({ kind: 'error', message: e instanceof Error ? e.message : 'Delete failed' });
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Automations</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Scheduled or manual workflows that use your Integrations to do work.
            Each automation has a trigger (when to fire) and one or more action steps (what to do).
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary)] transition-colors"
        >
          <Plus className="h-4 w-4" />
          New automation
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
          <Loader2 className="h-6 w-6 text-muted-foreground mx-auto mb-2 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : automations.length === 0 ? (
        <EmptyState onNew={() => setEditing('new')} />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-gray-50">
          {automations.map(a => (
            <AutomationRow
              key={a.id}
              automation={a}
              onClick={() => setEditing(a)}
              onRunNow={() => runNow(a.id)}
              onToggle={() => toggleEnabled(a)}
              onDelete={() => remove(a)}
              running={runningId === a.id}
            />
          ))}
        </div>
      )}

      {editing && (
        <BuilderDrawer
          automation={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
            setToast({ kind: 'success', message: editing === 'new' ? 'Automation created' : 'Saved' });
          }}
        />
      )}

      {toast && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 shadow-xl border text-sm font-medium',
          toast.kind === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500',
        )}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ─── Row ───────────────────────────────────────────────────────────────────

function AutomationRow({
  automation, onClick, onRunNow, onToggle, onDelete, running,
}: {
  automation: Automation;
  onClick: () => void;
  onRunNow: () => void;
  onToggle: () => void;
  onDelete: () => void;
  running: boolean;
}) {
  const lastStatus = automation.last_run_status;
  const StatusIcon =
    lastStatus === 'success' ? CheckCircle2 :
    lastStatus === 'failed' || lastStatus === 'partial' ? AlertCircle :
    Clock;
  const statusColor =
    lastStatus === 'success' ? 'text-emerald-600' :
    lastStatus === 'failed' || lastStatus === 'partial' ? 'text-red-600' :
    'text-muted-foreground';

  const TriggerIcon = automation.trigger_type === 'manual' ? Hand : Calendar;
  const triggerLabel =
    automation.trigger_type === 'manual' ? 'Manual' :
    automation.trigger_type === 'cron' ? cronLabel(automation.trigger_config) :
    'Event';

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors">
      <button onClick={onClick} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-[var(--foreground)]">{automation.name}</p>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            <TriggerIcon className="h-2.5 w-2.5" />
            {triggerLabel}
          </span>
          {!automation.enabled && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              Paused
            </span>
          )}
        </div>
        {automation.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{automation.description}</p>
        )}
        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
          <StatusIcon className={cn('h-3 w-3', statusColor)} />
          {automation.last_run_at
            ? `Last ran ${new Date(automation.last_run_at).toLocaleString()} · ${automation.run_count} run${automation.run_count === 1 ? '' : 's'}`
            : 'Never run'}
          {automation.last_run_message && lastStatus !== 'success' && (
            <span className="text-red-600 truncate ml-1">— {automation.last_run_message}</span>
          )}
        </p>
      </button>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onRunNow}
          disabled={running}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted disabled:opacity-50 transition-colors"
          title="Run now"
        >
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          {running ? 'Running…' : 'Run'}
        </button>
        <button
          onClick={onToggle}
          className={cn(
            'px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors',
            automation.enabled
              ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15'
              : 'border border-border bg-muted text-muted-foreground hover:bg-muted',
          )}
          title={automation.enabled ? 'Pause this automation' : 'Enable this automation'}
        >
          {automation.enabled ? 'On' : 'Off'}
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function cronLabel(config: Record<string, unknown> | null): string {
  if (!config) return 'Daily';
  const freq = (config.frequency as string | undefined) ?? 'daily';
  if (freq === 'daily') return 'Daily';
  if (freq === 'weekly') {
    const dow = config.day_of_week as number | undefined;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dow != null ? `Weekly · ${days[dow] ?? '?'}` : 'Weekly';
  }
  if (freq === 'monthly') {
    const dom = config.day_of_month as number | undefined;
    return dom != null ? `Monthly · day ${dom}` : 'Monthly';
  }
  return 'Daily';
}

// ─── Empty state ───────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <div className="h-14 w-14 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
        <Zap className="h-7 w-7 text-amber-500" />
      </div>
      <h2 className="text-base font-bold text-[var(--foreground)] mb-1">No automations yet</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
        Pick a trigger (daily, weekly, or manual), choose an integration, configure the action, and Tempo will run it for you.
      </p>
      <button
        onClick={onNew}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary)] transition-colors"
      >
        <Plus className="h-3 w-3" />
        Create your first automation
      </button>
    </div>
  );
}

// ─── Builder drawer ────────────────────────────────────────────────────────

interface BuilderState {
  name: string;
  description: string;
  trigger_type: 'manual' | 'cron';
  cronFrequency: 'daily' | 'weekly' | 'monthly';
  cronDayOfWeek: number;
  cronDayOfMonth: number;
  integration_id: string;
  action: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

function emptyBuilderState(): BuilderState {
  return {
    name: '',
    description: '',
    trigger_type: 'manual',
    cronFrequency: 'daily',
    cronDayOfWeek: 1, // Monday
    cronDayOfMonth: 1,
    integration_id: '',
    action: '',
    params: {},
    enabled: true,
  };
}

function builderStateFrom(a: Automation): BuilderState {
  const step = a.steps[0] ?? { integration_id: '', action: '', params: {} };
  const tc = a.trigger_config ?? {};
  return {
    name: a.name,
    description: a.description ?? '',
    trigger_type: a.trigger_type === 'cron' ? 'cron' : 'manual',
    cronFrequency: ((tc.frequency as string | undefined) === 'weekly' ? 'weekly' :
                    (tc.frequency as string | undefined) === 'monthly' ? 'monthly' : 'daily'),
    cronDayOfWeek: (tc.day_of_week as number | undefined) ?? 1,
    cronDayOfMonth: (tc.day_of_month as number | undefined) ?? 1,
    integration_id: step.integration_id,
    action: step.action,
    params: step.params,
    enabled: a.enabled,
  };
}

function BuilderDrawer({
  automation, onClose, onSaved,
}: {
  automation: Automation | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [state, setState] = useState<BuilderState>(automation ? builderStateFrom(automation) : emptyBuilderState());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catalogs (loaded once)
  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [actions, setActions] = useState<ActionDef[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [iRes, aRes] = await Promise.all([
          fetch('/api/integrations').then(r => r.json()) as Promise<{ integrations?: IntegrationSummary[] }>,
          fetch('/api/integrations/actions').then(r => r.json()) as Promise<{ actions?: ActionDef[] }>,
        ]);
        setIntegrations(iRes.integrations ?? []);
        setActions(aRes.actions ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load builder data');
      } finally {
        setCatalogsLoading(false);
      }
    }
    load();
  }, []);

  const selectedIntegration = useMemo(
    () => integrations.find(i => i.id === state.integration_id),
    [integrations, state.integration_id],
  );

  const availableActions = useMemo(
    () => selectedIntegration ? actions.filter(a => a.integrationType === selectedIntegration.type) : [],
    [selectedIntegration, actions],
  );

  const selectedAction = useMemo(
    () => availableActions.find(a => a.action === state.action),
    [availableActions, state.action],
  );

  function set<K extends keyof BuilderState>(key: K, value: BuilderState[K]) {
    setState(s => ({ ...s, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (!state.name.trim()) throw new Error('Name is required');
      if (!state.integration_id) throw new Error('Pick an integration');
      if (!state.action) throw new Error('Pick an action');
      if (!selectedAction) throw new Error('Action no longer available');
      for (const p of selectedAction.params) {
        if (p.required && !state.params[p.key]) {
          throw new Error(`${p.label} is required`);
        }
      }

      const trigger_config = state.trigger_type === 'cron' ? buildCronConfig(state) : {};
      const body = {
        name: state.name.trim(),
        description: state.description.trim() || null,
        trigger_type: state.trigger_type,
        trigger_config,
        steps: [{
          integration_id: state.integration_id,
          action: state.action,
          params: state.params,
        }],
        enabled: state.enabled,
      };

      const url = automation ? `/api/automations/${automation.id}` : '/api/automations';
      const method = automation ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Save failed');
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
    <div className="absolute inset-0 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-lg bg-card shadow-2xl h-full overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              {automation ? 'Edit automation' : 'New automation'}
            </p>
            <h2 className="text-base font-bold text-[var(--foreground)]">{state.name || 'Untitled'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {catalogsLoading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="p-6 space-y-6 flex-1">
            {/* Basics */}
            <Section title="Basics">
              <Field label="Name" required>
                <input
                  type="text"
                  value={state.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Daily morning ping"
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
                />
              </Field>
              <Field label="Description">
                <textarea
                  rows={2}
                  value={state.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Posts a daily good-morning message to the team channel."
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] resize-none"
                />
              </Field>
            </Section>

            {/* Trigger */}
            <Section title="Trigger">
              <div className="grid grid-cols-2 gap-2">
                <TriggerOption
                  active={state.trigger_type === 'manual'}
                  onClick={() => set('trigger_type', 'manual')}
                  icon={<Hand className="h-4 w-4" />}
                  label="Manual"
                  description="Only fires when you click Run."
                />
                <TriggerOption
                  active={state.trigger_type === 'cron'}
                  onClick={() => set('trigger_type', 'cron')}
                  icon={<Calendar className="h-4 w-4" />}
                  label="Scheduled"
                  description="Fires on a daily / weekly / monthly cadence."
                />
              </div>
              {state.trigger_type === 'cron' && (
                <div className="mt-4 space-y-3">
                  <Field label="Frequency">
                    <select
                      value={state.cronFrequency}
                      onChange={(e) => set('cronFrequency', e.target.value as BuilderState['cronFrequency'])}
                      className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-card focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </Field>
                  {state.cronFrequency === 'weekly' && (
                    <Field label="Day of week">
                      <select
                        value={state.cronDayOfWeek}
                        onChange={(e) => set('cronDayOfWeek', Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-card focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                      >
                        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                          <option key={i} value={i}>{d}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {state.cronFrequency === 'monthly' && (
                    <Field label="Day of month">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={state.cronDayOfMonth}
                        onChange={(e) => set('cronDayOfMonth', Math.max(1, Math.min(31, Number(e.target.value))))}
                        className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                      />
                    </Field>
                  )}
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Cron fires once a day around 14:00 UTC (server time). For dates not matching the schedule, the automation is skipped.
                  </p>
                </div>
              )}
            </Section>

            {/* Action */}
            <Section title="Action">
              <Field label="Integration" required>
                <select
                  value={state.integration_id}
                  onChange={(e) => {
                    set('integration_id', e.target.value);
                    set('action', ''); // reset action when integration changes
                    set('params', {});
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-card focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                >
                  <option value="">— pick one —</option>
                  {integrations.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.brandName ? `${i.brandName} · ` : ''}{i.displayName} ({i.type})
                    </option>
                  ))}
                </select>
              </Field>
              {selectedIntegration && (
                <Field label="Action" required>
                  <select
                    value={state.action}
                    onChange={(e) => {
                      set('action', e.target.value);
                      set('params', {});
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-card focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  >
                    <option value="">— pick one —</option>
                    {availableActions.map(a => (
                      <option key={a.action} value={a.action}>{a.label}</option>
                    ))}
                  </select>
                  {selectedAction && (
                    <p className="text-[11px] text-muted-foreground mt-1">{selectedAction.description}</p>
                  )}
                </Field>
              )}

              {/* Action params */}
              {selectedAction && selectedAction.params.map(param => (
                <ParamField
                  key={param.key}
                  param={param}
                  value={state.params[param.key]}
                  onChange={(v) => set('params', { ...state.params, [param.key]: v })}
                  integrationId={state.integration_id}
                />
              ))}
            </Section>

            {/* Status (edit only) */}
            {automation && (
              <Section title="Status">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={state.enabled}
                    onChange={(e) => set('enabled', e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Enabled — uncheck to pause without deleting
                </label>
              </Section>
            )}

            {/* History (edit only) */}
            {automation && <HistorySection automationId={automation.id} />}
          </div>
        )}

        {/* Sticky footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-3 flex items-center gap-2 justify-end">
          {error && <p className="text-xs text-red-600 mr-auto">{error}</p>}
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--primary)] text-white hover:bg-[var(--primary)] disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : automation ? 'Save changes' : 'Create automation'}
          </button>
        </div>
      </div>
    </div>
    </ModalOverlay>
  );
}

function buildCronConfig(s: BuilderState): Record<string, unknown> {
  const config: Record<string, unknown> = { frequency: s.cronFrequency };
  if (s.cronFrequency === 'weekly') config.day_of_week = s.cronDayOfWeek;
  if (s.cronFrequency === 'monthly') config.day_of_month = s.cronDayOfMonth;
  return config;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-2">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label} {required && <span className="text-[var(--primary)]">*</span>}
      </label>
      {children}
    </div>
  );
}

function TriggerOption({ active, onClick, icon, label, description }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors',
        active
          ? 'border-[var(--primary)] bg-[var(--primary)]/5'
          : 'border-border bg-card hover:border-border',
      )}
    >
      <div className={cn('flex items-center gap-1.5 text-sm font-semibold', active ? 'text-[var(--primary)]' : 'text-foreground')}>
        {icon}
        {label}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>
    </button>
  );
}

// ─── Param input renderer ──────────────────────────────────────────────────

function ParamField({
  param, value, onChange, integrationId,
}: {
  param: ActionParam;
  value: unknown;
  onChange: (v: unknown) => void;
  integrationId: string;
}) {
  if (param.type === 'channel-picker') {
    return (
      <Field label={param.label} required={param.required}>
        <ChannelPicker
          integrationId={integrationId}
          value={String(value ?? '')}
          onChange={onChange}
        />
        {param.helpText && <p className="text-[11px] text-muted-foreground mt-1">{param.helpText}</p>}
      </Field>
    );
  }
  if (param.type === 'textarea') {
    return (
      <Field label={param.label} required={param.required}>
        <textarea
          rows={param.rows ?? 3}
          value={String(value ?? param.defaultValue ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={param.placeholder}
          className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] resize-none"
        />
        {param.helpText && <p className="text-[11px] text-muted-foreground mt-1">{param.helpText}</p>}
      </Field>
    );
  }
  if (param.type === 'number') {
    return (
      <Field label={param.label} required={param.required}>
        <input
          type="number"
          value={String(value ?? param.defaultValue ?? '')}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder={param.placeholder}
          className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
        />
        {param.helpText && <p className="text-[11px] text-muted-foreground mt-1">{param.helpText}</p>}
      </Field>
    );
  }
  return (
    <Field label={param.label} required={param.required}>
      <input
        type="text"
        value={String(value ?? param.defaultValue ?? '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder={param.placeholder}
        className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
      />
      {param.helpText && <p className="text-[11px] text-muted-foreground mt-1">{param.helpText}</p>}
    </Field>
  );
}

function ChannelPicker({
  integrationId, value, onChange,
}: {
  integrationId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [channels, setChannels] = useState<ChannelOption[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!integrationId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadErr(null);
      try {
        const res = await fetch(`/api/integrations/${encodeURIComponent(integrationId)}/channels`);
        const j = await res.json() as { channels?: ChannelOption[]; error?: string };
        if (cancelled) return;
        if (j.channels) setChannels(j.channels);
        else setLoadErr(j.error ?? 'Failed to load channels');
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [integrationId]);

  const grouped = useMemo(() => {
    if (!channels) return null;
    const map = new Map<string, ChannelOption[]>();
    for (const c of channels) {
      const k = c.parentName ?? 'Uncategorized';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return Array.from(map.entries());
  }, [channels]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading channels…</span>
      </div>
    );
  }
  if (loadErr || !grouped || grouped.length === 0) {
    return (
      <div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="1465474331365736552"
          className="w-full px-3 py-2 rounded-lg border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
        />
        {loadErr && <p className="text-[11px] text-amber-600 mt-1">Couldn&apos;t list channels: {loadErr}. Paste an ID manually.</p>}
      </div>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-card focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
    >
      <option value="">— pick a channel —</option>
      {grouped.map(([category, items]) => (
        <optgroup key={category} label={category}>
          {items.map(c => (
            <option key={c.id} value={c.id}>
              {c.isAnnouncement ? '📢 ' : '#'}{c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ─── History section (edit drawer) ─────────────────────────────────────────

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  triggered_by: string | null;
  step_results: Array<{ action: string; ok: boolean; error?: string; summary?: string }> | null;
  error_message: string | null;
}

function HistorySection({ automationId }: { automationId: string }) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/automations/${automationId}`);
        const j = await res.json() as { runs?: RunRow[] };
        setRuns(j.runs ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [automationId]);

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-2">Recent runs</p>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No runs yet. Click Run to fire it manually.</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-gray-50 max-h-72 overflow-y-auto">
          {runs.slice(0, 20).map(r => {
            const isOpen = expanded.has(r.id);
            const StatusIcon =
              r.status === 'success' ? CheckCircle2 :
              r.status === 'failed' || r.status === 'partial' ? AlertCircle : Clock;
            const color =
              r.status === 'success' ? 'text-emerald-600' :
              r.status === 'failed' ? 'text-red-600' :
              r.status === 'partial' ? 'text-amber-600' : 'text-muted-foreground';
            return (
              <div key={r.id}>
                <button
                  onClick={() => {
                    setExpanded(prev => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    });
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
                >
                  <StatusIcon className={cn('h-3.5 w-3.5 flex-shrink-0', color)} />
                  <span className="text-xs text-foreground flex-1 min-w-0">
                    {new Date(r.started_at).toLocaleString()}
                    <span className="text-muted-foreground"> · {r.triggered_by}</span>
                  </span>
                  <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="px-3 pb-2 text-[11px] text-muted-foreground space-y-1 bg-muted/40">
                    {r.error_message && <p className="text-red-600">{r.error_message}</p>}
                    {r.step_results?.map((sr, i) => (
                      <p key={i} className={sr.ok ? 'text-emerald-500' : 'text-red-500'}>
                        {sr.ok ? '✓' : '✗'} {sr.action}{sr.summary ? ` — ${sr.summary}` : ''}{sr.error ? ` — ${sr.error}` : ''}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
