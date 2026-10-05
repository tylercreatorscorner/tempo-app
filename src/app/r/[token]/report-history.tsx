'use client';

import { useEffect, useState } from 'react';
import { Popover } from 'radix-ui';
import { Check, ChevronDown, History, Loader2 } from 'lucide-react';
import styles from './report-history.module.css';

type Entry = { token: string; period_label: string; period_start: string; period_end: string; created_at: string };
export function ReportHistory({ token, cadence, periodLabel, preview }: { token: string; cadence: 'weekly' | 'monthly'; periodLabel: string; preview: boolean }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [page, setPage] = useState(0);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch(`/api/report-history/${encodeURIComponent(token)}?page=${page}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error('History unavailable'); return response.json(); })
      .then((result: { reports: Entry[]; nextPage: number | null }) => {
        if (controller.signal.aborted) return;
        setEntries(previous => page === 0 ? result.reports : [...previous.filter(item => !result.reports.some(incoming => incoming.token === item.token)), ...result.reports]);
        setNextPage(result.nextPage); setLoaded(true);
      }).catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, token, page, retry]);
  const date = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return <div className={styles.bar}>
    <div className={styles.inner}>
      <span className={styles.current}>{cadence === 'weekly' ? 'Weekly' : 'Monthly'} report <span>{periodLabel}</span></span>
      <Popover.Root open={open} onOpenChange={value => { setOpen(value); if (value) { setLoading(true); setError(false); setPage(0); setLoaded(false); setEntries([]); } }}>
        <Popover.Trigger className={styles.trigger}><History size={15} />Report history<ChevronDown size={14} /></Popover.Trigger>
        <Popover.Portal><Popover.Content align="end" sideOffset={8} collisionPadding={12} className={styles.menu} aria-label={`${cadence === 'weekly' ? 'Weekly' : 'Monthly'} report history`}>
          <div className={styles.heading}>Previous {cadence === 'weekly' ? 'weeks' : 'months'}</div>
          <div className={styles.list} aria-busy={loading}>
            {entries.map(item => <a key={item.token} href={`/r/${encodeURIComponent(item.token)}${preview ? '?preview=1' : ''}`} aria-current={item.token === token ? 'page' : undefined} className={styles.item}>
              <span>{cadence === 'monthly' ? new Date(`${item.period_start}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : item.period_label || `${date(item.period_start)} to ${date(item.period_end)}`}</span>{item.token === token && <Check size={15} />}
            </a>)}
            {loaded && !entries.length && !error && <p className={styles.notice}>No other saved reports are available yet.</p>}
            {loading && <p className={styles.notice} role="status"><Loader2 size={14} className={styles.spin} />Loading reports</p>}
            {error && <div className={styles.notice} role="alert">History couldn’t load. Your current report is still available.<button onClick={() => { setLoading(true); setError(false); setRetry(value => value + 1); }}>Try again</button></div>}
          </div>
          {!loading && !error && nextPage !== null && <button className={styles.more} onClick={() => { setLoading(true); setError(false); setPage(nextPage); }}>Load older reports</button>}
        </Popover.Content></Popover.Portal>
      </Popover.Root>
    </div>
  </div>;
}
