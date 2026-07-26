'use client';

/**
 * Data Pipeline — the client shell.
 *
 * Owns the single coverage read (the ledger and the health strip both derive
 * from it, so they can never disagree), the selected cell, and the refresh
 * signal that fires when an upload lands.
 *
 * Page order is the argument this page makes:
 *   1. health      — what is current, what needs attention, what is not expected
 *   2. the ledger  — every brand x day x report, the centrepiece
 *   3. the queue   — one lane, demoted; it is a way to fill gaps, not the page
 *   4. history     — the audit trail
 */
import { useCallback, useEffect, useState } from 'react';
import { PipelineHealth } from './pipeline-health';
import { CoverageLedger, type LedgerSelection } from './coverage-ledger';
import { CellDetailDrawer } from './cell-detail-drawer';
import { UploadHistory } from './upload-history';
import { UploadClient } from '@/app/(admin)/upload/upload-client';
import type { CoverageResponse } from './coverage-types';

interface ActiveBrand {
  slug: string;
  name: string;
}

export function DataPipelineClient({ activeBrands }: { activeBrands: ActiveBrand[] }) {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [selection, setSelection] = useState<LedgerSelection | null>(null);
  // Bumped whenever an upload lands so coverage and history re-read and the
  // operator sees the gap they just filled close.
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/upload/coverage?days=${days}`, { cache: 'no-store' });
      // Read as TEXT first, then parse. res.json() on a non-JSON body (an auth
      // redirect to the login HTML, a platform 413/502 page) throws a raw
      // SyntaxError quoting "<!DOCTYPE", which is noise to an operator. And
      // res.ok is checked BEFORE the body is trusted: an error body has no
      // `brands`, and an empty ledger reads as "nothing is expected anywhere" —
      // the confident lie this page exists to end.
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(
          res.ok ? `Server returned a non-JSON response (HTTP ${res.status}).` : `HTTP ${res.status}`,
        );
      }
      if (!res.ok) {
        throw new Error((parsed as { error?: string })?.error || `HTTP ${res.status}`);
      }
      const body = parsed as CoverageResponse;
      if (!Array.isArray(body?.brands) || !Array.isArray(body?.days)) {
        throw new Error('unexpected response shape');
      }
      setData(body);
      setHasLoadedOnce(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load coverage.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const onUploaded = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="space-y-6">
      <PipelineHealth data={hasLoadedOnce ? data : null} coverageError={hasLoadedOnce ? null : error} />

      <CoverageLedger
        data={data}
        loading={loading}
        error={error}
        hasLoadedOnce={hasLoadedOnce}
        days={days}
        onDaysChange={setDays}
        selection={selection}
        onSelect={setSelection}
        onRetry={load}
      />

      {/* The upload queue, demoted to one lane. Everything it shipped in the
          last two days still runs here unchanged: content-sniff auto-switch
          chips, duplicate-target warnings, overwrite chips, per-row error logs
          and the 3-wide parallel pool. */}
      <UploadClient activeBrands={activeBrands} onUploaded={onUploaded} />

      <UploadHistory refreshKey={refreshKey} />

      {selection && (
        <CellDetailDrawer selection={selection} onClose={() => setSelection(null)} />
      )}
    </div>
  );
}
