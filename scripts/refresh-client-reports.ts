/**
 * Rebuild already-issued client report snapshots IN PLACE.
 *
 * Same semantics as POST /api/client-reports/[id]/refresh, which cannot be
 * called from a script because it authenticates a browser session:
 *
 *   - the TOKEN is kept, so links already sent keep working
 *   - the PERIOD comes from the stored row, never from an argument. Refresh
 *     means "the same window, recomputed"; letting a caller pass a period
 *     would silently change what an already-sent link reports
 *   - NOTES are preserved (hand-written commentary, not derived data)
 *   - viewed_at is NOT reset: whether the client opened the link is a fact
 *     about the link, not about the numbers on it
 *   - revoked links are skipped, not rebuilt
 *
 * Usage:
 *   npx tsx scripts/refresh-client-reports.ts --created-on 2026-08-26
 *   npx tsx scripts/refresh-client-reports.ts --id <uuid> [--id <uuid> ...]
 *   npx tsx scripts/refresh-client-reports.ts --created-on 2026-08-26 --dry-run
 *
 * --dry-run rebuilds and prints the before/after diff WITHOUT writing.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { buildClientReportSnapshot } from '@/lib/data/client-reports';

const TZ = 'America/Chicago';

type Row = {
  id: string;
  token: string;
  brand_slug: string;
  brand_name: string;
  period_start: string;
  period_end: string;
  period_label: string;
  notes: string | null;
  revoked_at: string | null;
  snapshot: { report?: Record<string, unknown> } | null;
  created_at: string;
};

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
function args(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
}
const DRY = process.argv.includes('--dry-run');

function money(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n ?? NaN);
  return Number.isFinite(v) ? '$' + Math.round(v).toLocaleString('en-US') : '—';
}
function int(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n ?? NaN);
  return Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—';
}

async function main() {
  const supabase = await createAdminClient();

  const ids = args('id');
  const createdOn = arg('created-on');
  if (ids.length === 0 && !createdOn) {
    console.error('Pass --created-on YYYY-MM-DD or one or more --id <uuid>.');
    process.exit(1);
  }

  let q = supabase
    .from('client_reports')
    .select('id, token, brand_slug, brand_name, period_start, period_end, period_label, notes, revoked_at, snapshot, created_at')
    .order('created_at', { ascending: true });
  if (ids.length > 0) q = q.in('id', ids);

  const { data, error } = await q;
  if (error) throw new Error(`fetch failed: ${error.message}`);

  let rows = (data ?? []) as Row[];
  if (createdOn) {
    // Filter on the LOCAL calendar day, not the UTC one. "Today" to an
    // operator in Chicago is not the same 24 hours as today in UTC: a report
    // created at 8pm CT is stamped the NEXT day in UTC, so a naive
    // created_at::date filter would miss it.
    rows = rows.filter((r) => {
      const created = r.created_at;
      if (!created) return false;
      const local = new Date(created).toLocaleDateString('en-CA', { timeZone: TZ });
      return local === createdOn;
    });
  }

  if (rows.length === 0) {
    console.log('Nothing matched.');
    return;
  }

  console.log(`${DRY ? '[DRY RUN] ' : ''}Refreshing ${rows.length} report(s)\n`);

  let ok = 0;
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const r of rows) {
    const label = `${r.brand_name} ${r.period_label}`;
    if (r.revoked_at) {
      skipped.push(`${label} — revoked`);
      console.log(`SKIP  ${label}: link is revoked`);
      continue;
    }

    const before = (r.snapshot?.report ?? {}) as Record<string, unknown>;
    const beforeCC = (before.creatorsCorner ?? {}) as Record<string, unknown>;

    try {
      const t0 = Date.now();
      const build = await buildClientReportSnapshot(
        r.brand_slug,
        { start: r.period_start, end: r.period_end },
        supabase,
      );
      const secs = ((Date.now() - t0) / 1000).toFixed(1);

      const after = build.snapshot.report as unknown as Record<string, unknown>;
      const afterCC = (after.creatorsCorner ?? {}) as Record<string, unknown>;
      const act = after.activity as Record<string, unknown> | undefined;

      /**
       * ⚠️ Refuse to write a DEGRADED snapshot.
       *
       * getBrandClientReportData treats a failing granular/split RPC as
       * non-fatal on purpose — a client opening a link must never get a 500 —
       * so a transient "TypeError: fetch failed" silently produces a report
       * with no channels and no per-creator list. That is the right behaviour
       * for a live render and the wrong behaviour for a backfill, where the
       * result is frozen and nobody will notice the missing sections.
       *
       * Seen for real during the dry run of this very batch, on Lemme.
       */
      const missing: string[] = [];
      if (!after.granular) missing.push('granular');
      if (!after.channels) missing.push('channels');
      if (!after.activity) missing.push('activity');
      if (missing.length > 0) {
        throw new Error(
          `rebuild came back degraded (missing: ${missing.join(', ')}) — an RPC failed. ` +
            `NOT written; re-run this id.`,
        );
      }

      // The report window is fixed, so store GMV should NOT move. If it does,
      // the underlying data changed since the report was issued and that is
      // worth seeing rather than silently overwriting.
      const gmvMoved =
        Math.abs(Number(before.totalGmv ?? 0) - Number(after.totalGmv ?? 0)) >= 1;

      console.log(
        `OK    ${label}  (${secs}s)\n` +
          `        store GMV   ${money(before.totalGmv)} -> ${money(after.totalGmv)}` +
          `${gmvMoved ? '   <-- MOVED' : ''}\n` +
          `        roster GMV  ${money(beforeCC.gmv)} -> ${money(afterCC.gmv)}\n` +
          `        "creators"  ${int(before.activeCreators)} -> ${int(after.activeCreators)}` +
          `${act ? `   (posted ${int(act.rosterPosted)}, sold ${int(act.rosterSold)})` : ''}`,
      );

      if (!DRY) {
        const { error: upErr } = await supabase
          .from('client_reports')
          .update({
            snapshot: build.snapshot,
            // period_label is regenerated from the same stored dates; keep it
            // in sync in case the formatter changed.
            period_label: build.periodLabel,
            refreshed_at: new Date().toISOString(),
          })
          .eq('id', r.id);
        if (upErr) throw new Error(upErr.message);
      }
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push(`${label} — ${msg}`);
      console.error(`FAIL  ${label}: ${msg}`);
    }
  }

  console.log(
    `\n${DRY ? '[DRY RUN] ' : ''}${ok} refreshed, ${skipped.length} skipped, ${failed.length} failed`,
  );
  if (failed.length > 0) {
    failed.forEach((f) => console.error('  failed: ' + f));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
