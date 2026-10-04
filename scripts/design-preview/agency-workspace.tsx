import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { AgencyWorkspaceView, ClientEditor, type AgencyBusinessResponse, type AgencyView } from '../../src/app/(admin)/agency/workspace';
import type { ClientRecord } from '../../src/lib/agency/model';
import './agency-workspace.css';

const clients: ClientRecord[] = [
  { id: 'client-1', revision: 1, name: 'Northstar Beauty', brandIds: ['brand-1'], serviceStart: '2026-08-01', serviceEnd: null, exitReason: null, terms: [{ effectiveMonth: '2026-08', monthlyRetainer: 3000, revSharePercent: 5, feeModel: 'additive' }], updatedAt: null },
  { id: 'client-2', revision: 1, name: 'Everyday Wellness', brandIds: ['brand-2'], serviceStart: '2026-05-01', serviceEnd: null, exitReason: null, terms: [{ effectiveMonth: '2026-05', monthlyRetainer: 6000, revSharePercent: 3, feeModel: 'minimum' }], updatedAt: null },
  { id: 'client-3', revision: 1, name: 'Form & Function', brandIds: ['brand-3'], serviceStart: '2026-02-01', serviceEnd: null, exitReason: null, terms: [{ effectiveMonth: '2026-02', monthlyRetainer: 5000, revSharePercent: 4, feeModel: 'additive' }], updatedAt: null },
  { id: 'client-4', revision: 1, name: 'Silverline Essentials', brandIds: ['brand-4'], serviceStart: '2025-03-01', serviceEnd: null, exitReason: null, terms: [{ effectiveMonth: '2025-03', monthlyRetainer: 4000, revSharePercent: 7, feeModel: 'share' }], updatedAt: null },
  { id: 'client-5', revision: 1, name: 'New Client', brandIds: ['brand-5'], serviceStart: null, serviceEnd: null, exitReason: null, terms: [], updatedAt: null },
];
const fixture: AgencyBusinessResponse = {
  month: '2026-09', periodStart: '2026-09-01', periodEnd: '2026-09-30', priorPeriodStart: '2026-08-01', priorPeriodEnd: '2026-08-31', clients,
  brands: [...clients.map((client, i) => ({ id: `brand-${i + 1}`, slug: `fixture-${i + 1}`, name: client.name, logoUrl: null, archived: false })), { id: 'brand-6', slug: 'fixture-unlinked', name: 'Unlinked brand', logoUrl: null, archived: false }],
  performance: [82500, 135900, 234500, 988400, null].map((gmv, i) => ({ brandId: `brand-${i + 1}`, managedGmv: gmv, priorManagedGmv: gmv === null ? null : gmv * 0.89, complete: gmv !== null, priorComplete: gmv !== null, recordedThrough: '2026-09-30' })), storageReady: true, canEdit: true,
};
function App() {
  const [view, setView] = useState<AgencyView>('overview');
  const [data, setData] = useState(fixture);
  const [editing, setEditing] = useState<{ client: ClientRecord | null; brandId?: string; focus: HTMLElement | null } | null>(null);
  const [dark, setDark] = useState(false);
  const [saveMode, setSaveMode] = useState('error');
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (!String(input).startsWith('/api/agency/business')) return original(input, init);
      if (init?.method === 'POST') {
        const payload = JSON.parse(String(init.body));
        if (saveMode === 'error') return Response.json({ error: 'Fixture network failure. Your draft is preserved.' }, { status: 503 });
        if (saveMode === 'conflict' && payload.expectedRevision < 2) return Response.json({ error: 'Fixture conflict' }, { status: 409 });
        return Response.json({ ...payload, id: payload.id ?? 'fixture-created', revision: payload.expectedRevision + 1, updatedAt: new Date().toISOString() });
      }
      return Response.json({ ...data, clients: data.clients.map(client => ({ ...client, revision: 2, name: client.name === 'Northstar Beauty' ? 'Northstar Beauty latest' : client.name, terms: [...client.terms, { effectiveMonth: '2027-01', monthlyRetainer: 7000, revSharePercent: 4, feeModel: 'fixed' }] })) });
    };
    return () => { window.fetch = original; };
  }, [saveMode, data]);
  return <><div className="fixtureToolbar"><strong>LOCAL FIXTURE</strong>{(['overview', 'clients', 'revenue'] as const).map(value => <button key={value} onClick={() => setView(value)}>{value}</button>)}<button onClick={() => { setDark(!dark); document.documentElement.classList.toggle('dark', !dark); }}>{dark ? 'Light' : 'Dark'}</button><button onClick={() => setData(previous => ({ ...previous, clients: previous.clients.length ? [] : clients }))}>Toggle empty</button><button onClick={() => setData(previous => ({ ...previous, performance: previous.performance.map(row => ({ ...row, managedGmv: row.managedGmv === null ? null : 987654321.98 })) }))}>Large amounts</button><label>Save response <select value={saveMode} onChange={event => setSaveMode(event.target.value)}><option value="error">Network failure</option><option value="conflict">Conflict then save</option><option value="success">Success</option></select></label></div><main className="fixtureMain"><AgencyWorkspaceView view={view} data={data} month={data.month} notice={notice} onMonthChange={month => setData(previous => ({ ...previous, month }))} onEdit={client => setEditing({ client, focus: document.activeElement as HTMLElement })} onAdd={brandId => setEditing({ client: null, brandId, focus: document.activeElement as HTMLElement })} /></main>{editing && <ClientEditor client={editing.client} defaultBrandId={editing.brandId} data={data} month={data.month} returnFocus={editing.focus} onClose={() => setEditing(null)} onSaved={saved => { setData(previous => ({ ...previous, clients: [...previous.clients.filter(client => client.id !== saved.id), saved] })); setNotice(`${saved.name} saved in local fixture.`); setEditing(null); }} />}</>;
}
createRoot(document.getElementById('root')!).render(<App />);
