'use client';

/**
 * Schedules tab for the Reporting page: the automated-delivery list plus the
 * create/edit modal and a ModalOverlay-based delete confirm (the house removed
 * native confirm() popups deliberately).
 *
 * All fetches are res.ok-guarded: a failed list load shows an error state (not
 * the "No schedules yet" empty state), and failed toggle/delete mutations
 * surface inline instead of silently reverting.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Calendar, Clock, Pencil, Trash2, Loader2, AlertCircle, RotateCw, MessageSquare, Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { FREQUENCIES } from '@/lib/data/schedule-frequency';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Button } from '@/components/ui/button';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { TableCard, Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { TableSkeleton } from '@/components/ui/page-skeletons';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented';
import { useBrandSelect, BrandListWarning } from './use-report-brands';

interface ScheduleRow {
  id: string;
  report_type: string;
  source: string;
  brand: string;
  period: string;
  cron_label: string;
  destination_kind: string;
  webhook_url: string;
  channel_label: string | null;
  active: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  next_run_at: string | null;
  created_at: string;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  // discord-posts source
  'daily-drop':           'Daily Drop',
  'whats-cooking':        "What's Cooking?",
  'whos-cooking':         "Who's Cooking?",
  // reporting source
  'performance-summary':  'Performance Summary',
  'creator-activity':     'Creator Activity',
  'brand-report':         'Brand Report',
};

function relativeTimeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'Soon';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function relativeTimeUntil(iso: string | null): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 'Pending';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `in ${hr}h`;
  const d = Math.floor(hr / 24);
  return `in ${d}d`;
}

const HEADERS = [
  'Report', 'Brand', 'Frequency', 'Destination', 'Last Sent', 'Next Run', 'Status',
] as const;

export function SchedulesTab() {
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [refetching, setRefetching] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ScheduleRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const brandMeta = useBrandMeta();
  const showBar = useDelayedFlag(refetching);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/schedules');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSchedules(data.schedules ?? []);
      setLoadError(false);
    } catch {
      // Keep any last-good rows; the render distinguishes "failed with no
      // data" (error card) from "failed refresh" (inline warning).
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const refetch = useCallback(async () => {
    setRefetching(true);
    try {
      await fetchSchedules();
    } finally {
      setRefetching(false);
    }
  }, [fetchSchedules]);

  const toggleActive = async (s: ScheduleRow) => {
    setMutationError(null);
    try {
      const res = await fetch(`/api/schedules/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !s.active }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setMutationError(
        `Couldn't ${s.active ? 'pause' : 'resume'} that schedule: ${err instanceof Error ? err.message : 'request failed'}`,
      );
    } finally {
      refetch();
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setMutationError(null);
    try {
      const res = await fetch(`/api/schedules/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setMutationError(
        `Couldn't delete that schedule: ${err instanceof Error ? err.message : 'request failed'}`,
      );
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
      refetch();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Automated report delivery to Discord and Slack channels.</p>
        <Button size="md" onClick={() => { setEditing(null); setShowModal(true); }}>
          <Calendar />
          New Schedule
        </Button>
      </div>

      {mutationError && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--pulse-neg-bg)] px-3 py-2 text-xs text-[var(--pulse-neg)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{mutationError}</span>
        </div>
      )}

      {loadError && schedules.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--pulse-warn-bg)] px-3 py-2 text-xs text-[var(--pulse-warn)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Couldn&apos;t refresh the schedule list. Showing the last loaded state.</span>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={5} cols={7} title={false} />
      ) : loadError && schedules.length === 0 ? (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8 text-[var(--pulse-neg)]" />}
          title="Couldn't load schedules"
          description="The schedule list didn't load. This is a fetch error, not an empty list."
          action={
            <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchSchedules(); }}>
              <RotateCw />
              Try again
            </Button>
          }
        />
      ) : schedules.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-8 w-8" />}
          title="No schedules yet"
          description="Set up an automated schedule to deliver any report or post on a recurring basis to a Discord or Slack channel."
        />
      ) : (
        <TableCard className="relative">
          <TableLoadBar active={showBar} />
          <div className={showBar ? 'opacity-60 transition-opacity duration-200' : ''}>
            <Table className="text-sm">
              <THead>
                <TR>
                  {HEADERS.map(h => <TH key={h} className="text-left">{h}</TH>)}
                  <TH aria-label="Actions" className="text-left" />
                </TR>
              </THead>
              <TBody>
                {schedules.map(s => (
                  <TR key={s.id} className="hover:bg-muted/60">
                    <TD className="text-left font-medium text-foreground">{REPORT_TYPE_LABELS[s.report_type] ?? s.report_type}</TD>
                    <TD className="text-left">{brandMeta.label(s.brand)}</TD>
                    <TD className="text-left text-xs">{s.cron_label}</TD>
                    <TD className="text-left">
                      <Badge variant="neutral" size="sm">
                        {s.destination_kind === 'discord'
                          ? <MessageSquare className="h-3 w-3" />
                          : <Hash className="h-3 w-3" />}
                        {s.channel_label || s.destination_kind}
                      </Badge>
                    </TD>
                    <TD className="text-left text-xs">
                      <div>{relativeTimeAgo(s.last_run_at)}</div>
                      {s.last_run_status === 'failed' && (
                        <div className="text-[10px] text-[var(--pulse-neg)]" title={s.last_run_error ?? ''}>last run failed</div>
                      )}
                    </TD>
                    <TD className="text-left text-xs">{s.active ? relativeTimeUntil(s.next_run_at) : 'Paused'}</TD>
                    <TD className="text-left">
                      <button
                        type="button"
                        onClick={() => toggleActive(s)}
                        title={s.active ? 'Click to pause' : 'Click to resume'}
                        className={cn(
                          badgeVariants({ variant: s.active ? 'positive' : 'neutral', size: 'sm' }),
                          'cursor-pointer transition-opacity hover:opacity-75',
                        )}
                      >
                        {s.active ? 'Active' : 'Paused'}
                      </button>
                    </TD>
                    <TD className="text-left">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => { setEditing(s); setShowModal(true); }}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(s)}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-[var(--pulse-neg-bg)] hover:text-[var(--pulse-neg)]"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </TableCard>
      )}

      {showModal && (
        <ScheduleModal
          editing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={() => { setShowModal(false); setEditing(null); refetch(); }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          schedule={confirmDelete}
          deleting={deleting}
          onCancel={() => { if (!deleting) setConfirmDelete(null); }}
          onConfirm={handleDeleteConfirmed}
        />
      )}
    </div>
  );
}

// ── Delete confirm — ModalOverlay-based (no native confirm() popups) ─
function ConfirmDeleteModal({
  schedule, deleting, onCancel, onConfirm,
}: { schedule: ScheduleRow; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  const label = REPORT_TYPE_LABELS[schedule.report_type] ?? schedule.report_type;
  return (
    <ModalOverlay onClose={onCancel}>
      <div className="absolute inset-0 flex items-center justify-center p-4" onClick={onCancel}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
        <div
          className="relative w-full max-w-sm space-y-4 rounded-xl bg-card p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-base font-bold text-foreground">Delete schedule</h3>
          <p className="text-sm text-muted-foreground">
            This stops future <strong className="text-foreground">{label}</strong> deliveries to{' '}
            {schedule.channel_label || schedule.destination_kind}. This can&apos;t be undone.
          </p>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={onConfirm} disabled={deleting}>
              {deleting && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ── Schedule Modal — create or edit a schedule ──────────────────────
function ScheduleModal({
  editing, onClose, onSaved,
}: { editing: ScheduleRow | null; onClose: () => void; onSaved: () => void }) {
  const [source, setSource] = useState<'discord-posts' | 'reporting'>(
    (editing?.source as 'discord-posts' | 'reporting') ?? 'discord-posts',
  );
  // Discord-post schedules aggregate the LeeFar umbrella; text-report schedules
  // are per-store. Collapse the umbrella only for the former.
  const { brand, setBrand, options: brandOptions, error: brandsError } = useBrandSelect({
    collapseUmbrella: source === 'discord-posts',
    initial: editing?.brand,
  });
  const [reportType, setReportType] = useState<string>(editing?.report_type ?? 'daily-drop');
  const [period, setPeriod] = useState(editing?.period ?? '7d');
  const [cronLabel, setCronLabel] = useState(editing?.cron_label ?? FREQUENCIES[0].label);
  const [webhookUrl, setWebhookUrl] = useState(editing?.webhook_url ?? '');
  const [channelLabel, setChannelLabel] = useState(editing?.channel_label ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportOptions = source === 'discord-posts'
    ? [
        { value: 'daily-drop',          label: 'Daily Drop' },
        { value: 'whats-cooking',       label: "What's Cooking?" },
        { value: 'whos-cooking',        label: "Who's Cooking?" },
      ]
    : [
        { value: 'performance-summary', label: 'Performance Summary' },
        { value: 'creator-activity',    label: 'Creator Activity' },
        { value: 'brand-report',        label: 'Brand Report' },
      ];

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        source, report_type: reportType, brand, period,
        cron_label: cronLabel,
        webhook_url: webhookUrl,
        channel_label: channelLabel || null,
      };
      const res = editing
        ? await fetch(`/api/schedules/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="absolute inset-0 flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
        <div
          className="relative w-full max-w-md space-y-4 rounded-xl bg-card p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-base font-bold text-foreground">{editing ? 'Edit Schedule' : 'New Schedule'}</h3>

          <div className="space-y-3">
            {/* Source */}
            <div>
              <Label>Type</Label>
              <SegmentedControl<'discord-posts' | 'reporting'>
                ariaLabel="Schedule type"
                options={[
                  { value: 'discord-posts', label: 'Quick Post' },
                  { value: 'reporting',     label: 'Long Report' },
                ]}
                value={source}
                onValueChange={(v) => {
                  setSource(v);
                  setReportType(v === 'discord-posts' ? 'daily-drop' : 'performance-summary');
                }}
              />
            </div>

            {/* Report */}
            <div>
              <Label htmlFor="schedule-report">Report</Label>
              <Select id="schedule-report" value={reportType} onChange={e => setReportType(e.target.value)}>
                {reportOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>

            {/* Brand */}
            <div>
              <Label htmlFor="schedule-brand">Brand</Label>
              <Select id="schedule-brand" value={brand} onChange={e => setBrand(e.target.value)}>
                {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </Select>
              <BrandListWarning show={brandsError} />
            </div>

            {/* Period (only for periodic reports) */}
            {(source === 'reporting' || ['whats-cooking', 'whos-cooking'].includes(reportType)) && (
              <div>
                <Label>Lookback Period</Label>
                <SegmentedControl
                  ariaLabel="Lookback period"
                  options={[{ value: '7d', label: '7 Days' }, { value: '30d', label: '30 Days' }]}
                  value={period}
                  onValueChange={setPeriod}
                />
              </div>
            )}

            {/* Frequency */}
            <div>
              <Label htmlFor="schedule-cron">Send</Label>
              <Select id="schedule-cron" value={cronLabel} onChange={e => setCronLabel(e.target.value)}>
                {FREQUENCIES.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}
              </Select>
            </div>

            {/* Webhook URL */}
            <div>
              <Label htmlFor="schedule-webhook">
                Webhook URL <span className="ml-1 font-normal normal-case text-muted-foreground">(Discord or Slack incoming webhook)</span>
              </Label>
              <Input
                id="schedule-webhook"
                type="url"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…  or  https://hooks.slack.com/services/…"
                className="font-mono"
              />
            </div>

            {/* Channel label (display) */}
            <div>
              <Label htmlFor="schedule-label">
                Label <span className="ml-1 font-normal normal-case text-muted-foreground">(display only, e.g. #daily-updates)</span>
              </Label>
              <Input
                id="schedule-label"
                type="text"
                value={channelLabel}
                onChange={e => setChannelLabel(e.target.value)}
                placeholder="#channel-name"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-[var(--pulse-neg-bg)] px-3 py-2 text-xs text-[var(--pulse-neg)]">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving || !webhookUrl}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? 'Save Changes' : 'Create Schedule'}
            </Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
