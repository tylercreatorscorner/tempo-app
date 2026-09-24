'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ReportingStartDate({ managedId, startDate, brand }: {
  managedId: number; startDate: string | null; brand: string;
}) {
  const id = useId();
  const router = useRouter();
  const [date, setDate] = useState(startDate ?? '');
  const [saved, setSaved] = useState(startDate ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`/api/roster/${managedId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reporting_start_date: date || null }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Could not save reporting start date.');
      }
      setSaved(date);
      setMessage('Saved. New reports will use this date. Existing saved reports stay unchanged.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save. Please try again.');
    } finally { setSaving(false); }
  }
  return <div className="mt-4 space-y-2 border-t border-border pt-4">
    <Label htmlFor={id}>Count as managed from</Label>
    <Input id={id} type="date" value={date} disabled={saving} onChange={event => setDate(event.target.value)} />
    <p className="text-xs text-muted-foreground">For {brand} reporting, sales before this date remain in store totals but do not count as managed. Leave blank to include all history. Contract dates are separate.</p>
    <Button size="sm" disabled={saving || date === saved} onClick={save}>{saving ? 'Saving…' : 'Save reporting date'}</Button>
    {message && <p role="status" className="text-xs">{message}</p>}
  </div>;
}
