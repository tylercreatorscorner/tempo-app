'use client';

import { useState } from 'react';
import { DollarSign, Target, Pencil, Save, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface RetainerData {
  creatorId: number | string;
  retainer: number | null;
  monthlyPostRequirement: number | null;
  retainerStartDate: string | null;
  postsThisMonth: number;
}

export function RetainerTracker({ data }: { data: RetainerData }) {
  const { retainer, monthlyPostRequirement, retainerStartDate, postsThisMonth } = data;
  const [editing, setEditing] = useState(false);

  // If no retainer info at all, show a minimal card
  if (!retainer && !monthlyPostRequirement) {
    return (
      <div className="rounded-2xl bg-card border border-border shadow-sm p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-[var(--foreground)]">Retainer & Post Tracking</h3>
          <EditButton creatorId={data.creatorId} retainer={retainer} requirement={monthlyPostRequirement} startDate={retainerStartDate} />
        </div>
        <p className="text-sm text-muted-foreground">No retainer configured for this creator.</p>
      </div>
    );
  }

  const requirement = monthlyPostRequirement ?? 0;
  const progress = requirement > 0 ? Math.min(postsThisMonth / requirement, 1) : 0;

  // Calculate if on track
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const expectedProgress = dayOfMonth / daysInMonth;
  const actualProgress = requirement > 0 ? postsThisMonth / requirement : 0;
  const ratio = expectedProgress > 0 ? actualProgress / expectedProgress : 1;

  let barColor = 'bg-green-500';
  let statusText = 'On track';
  let statusColor = 'text-green-600';
  if (ratio < 0.5) {
    barColor = 'bg-red-500';
    statusText = 'Behind schedule';
    statusColor = 'text-red-600';
  } else if (ratio < 0.85) {
    barColor = 'bg-yellow-500';
    statusText = 'Slightly behind';
    statusColor = 'text-yellow-600';
  }

  if (postsThisMonth >= requirement && requirement > 0) {
    barColor = 'bg-green-500';
    statusText = 'Goal reached!';
    statusColor = 'text-green-600';
  }

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-[var(--foreground)]">Retainer & Post Tracking</h3>
        <EditButton creatorId={data.creatorId} retainer={retainer} requirement={monthlyPostRequirement} startDate={retainerStartDate} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
        {retainer != null && retainer > 0 && (
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-green-500/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monthly Retainer</p>
              <p className="text-sm font-bold text-[var(--foreground)]">${retainer.toLocaleString()}</p>
            </div>
          </div>
        )}
        {requirement > 0 && (
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Target className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monthly Requirement</p>
              <p className="text-sm font-bold text-[var(--foreground)]">{requirement} posts</p>
            </div>
          </div>
        )}
        {retainerStartDate && (
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Retainer Since</p>
              <p className="text-sm font-bold text-[var(--foreground)]">
                {new Date(retainerStartDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        )}
      </div>

      {requirement > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              {postsThisMonth} / {requirement} posts this month
            </span>
            <span className={`text-xs font-medium ${statusColor}`}>{statusText}</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Day {dayOfMonth} of {daysInMonth} - Expected: {Math.round(expectedProgress * requirement)} posts by now
          </p>
        </div>
      )}

      {editing && (
        <RetainerEditForm
          creatorId={data.creatorId}
          retainer={retainer}
          requirement={monthlyPostRequirement}
          startDate={retainerStartDate}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function EditButton({
  creatorId,
  retainer,
  requirement,
  startDate,
}: {
  creatorId: number | string;
  retainer: number | null;
  requirement: number | null;
  startDate: string | null;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <button
        onClick={() => setEditing(true)}
        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
        title="Edit Retainer"
      >
        <Pencil className="h-4 w-4 text-muted-foreground" />
      </button>
      {editing && (
        <RetainerEditForm
          creatorId={creatorId}
          retainer={retainer}
          requirement={requirement}
          startDate={startDate}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

function RetainerEditForm({
  creatorId,
  retainer,
  requirement,
  startDate,
  onClose,
}: {
  creatorId: number | string;
  retainer: number | null;
  requirement: number | null;
  startDate: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    retainer: retainer ?? 0,
    monthly_post_requirement: requirement ?? 0,
    retainer_start_date: startDate ?? '',
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/creators/${creatorId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        router.refresh();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 p-4 bg-muted rounded-xl border border-border space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-[var(--foreground)]">Edit Retainer</h4>
        <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Monthly Retainer ($)</label>
          <input
            type="number"
            value={form.retainer}
            onChange={(e) => setForm({ ...form, retainer: Number(e.target.value) })}
            className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Posts Required</label>
          <input
            type="number"
            value={form.monthly_post_requirement}
            onChange={(e) => setForm({ ...form, monthly_post_requirement: Number(e.target.value) })}
            className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Start Date</label>
        <input
          type="date"
          value={form.retainer_start_date}
          onChange={(e) => setForm({ ...form, retainer_start_date: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--primary)] rounded-xl hover:bg-[#E91E8C] transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save
      </button>
    </div>
  );
}
