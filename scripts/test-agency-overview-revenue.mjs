import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Render the actual lifecycle pages with a fixture whose legacy fee calculation
// differs from Revenue's known components. No live records or requests.
const result = await build({
  stdin: { resolveDir: resolve('.'), loader: 'tsx', contents: String.raw`
    import assert from 'node:assert/strict';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AgencyWorkspaceView } from './src/app/(admin)/agency/workspace';
    import { calculateServiceRevenue } from './src/lib/agency/model';
    import { calculateRevenueTrueUp, sumRevenueTrueUps } from './src/lib/agency/revenue-model';
    const client = { id: '00000000-0000-4000-8000-000000000001', revision: 1, name: 'Fictional pending share', brandIds: [], serviceStart: '2026-01-01', serviceEnd: null, exitReason: null, updatedAt: null, terms: [{ effectiveMonth: '2026-01', monthlyRetainer: 7000, revSharePercent: 7, feeModel: 'additive' }] };
    const finance = { client_id: client.id, revision: 1, settings: { termsReviewRequired: true, managerTerms: [{ effectiveMonth: '2026-01', managerId: '00000000-0000-4000-8000-000000000020', fixedMonthly: 3000, gmvPercent: 3, payoutDays: 7 }] } };
    const legacyFee = calculateServiceRevenue({ client, month: '2026-10', periodStart: '2026-10-01', periodEnd: '2026-10-31', gmvCents: null, gmvComplete: false });
    const revenue = calculateRevenueTrueUp({ client, finance, month: '2026-10', throughDate: '2026-10-31', gmv: { amountCents: null, complete: false, recordedThrough: null } });
    assert.equal(legacyFee.revenueCents, null);
    assert.equal(sumRevenueTrueUps([revenue]).knownFeeCents, 700000, 'Revenue includes supported fixed components while the legacy calculation has no amount');
    const data = { month: '2026-10', periodStart: '2026-10-01', periodEnd: '2026-10-31', priorPeriodStart: '2026-09-01', priorPeriodEnd: '2026-09-30', clients: [client], brands: [], performance: [], storageReady: true, canEdit: false };
    for (const view of ['overview', 'clients']) {
      const html = renderToStaticMarkup(<AgencyWorkspaceView view={view} data={data} month="2026-10" onMonthChange={() => {}} onEdit={() => {}} onAdd={() => {}} />);
      const metrics = html.slice(html.indexOf('aria-label="Agency metrics"'), html.indexOf('</section>'));
      assert.match(metrics, /Financial review/);
      assert.match(metrics, /href="\/agency\/revenue\?month=2026-10"[^>]*>Open revenue/, 'financial review retains the selected month');
      assert.doesNotMatch(metrics, /Calculated service fees|Not calculated|\$/, 'lifecycle cards cannot display a competing fee total');
      assert.doesNotMatch(html, /Revenue ready|eligible clients calculated/, 'financial inclusion readiness belongs to Revenue');
      assert.match(metrics, /Active clients/);
      assert.match(metrics, /Client retention/);
      assert.match(metrics, /Managed GMV/);
    }
    console.log('PASS Overview financial handoff: differing model fixture, same-month Revenue links, no competing fee subtotal or inclusion count, lifecycle metrics retained');
  ` },
  bundle: true, write: false, outdir: resolve('.design-preview/agency-overview-revenue-test'), format: 'cjs', platform: 'node', jsx: 'automatic',
  loader: { '.css': 'empty' }, external: ['react', 'react-dom/server', 'react/jsx-runtime', 'radix-ui', 'lucide-react'],
  alias: { 'next/link': resolve('scripts/design-preview/agency-link.tsx') },
});
const compiledModule = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), compiledModule, compiledModule.exports);
