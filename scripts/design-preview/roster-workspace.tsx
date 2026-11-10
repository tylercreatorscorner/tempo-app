import { createRoot } from 'react-dom/client';
import RosterPage from '../../src/app/(admin)/roster/page';
import { useSearchParams } from './workspace-system-navigation';
import './roster-workspace.css';

const requests: string[] = [];
Object.assign(window, { rosterFixtureRequests: requests });
let failed = false;
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
  requests.push(url.pathname + url.search);
  const scenario = new URLSearchParams(window.location.search).get('scenario');
  if ((init?.method ?? 'GET') !== 'GET') return Response.json({ error: 'Local fixture: writes are disabled.' }, { status: 403 });
  await new Promise(resolve => setTimeout(resolve, 250));
  if (url.pathname === '/api/roster') {
    if (scenario === 'failure' && !failed) { failed = true; return Response.json({ error: 'Fictional retryable failure' }, { status: 503 }); }
    const brand = url.searchParams.get('brand') ?? 'all';
    const factor = url.searchParams.get('range') === 'last30' ? 3 : 1;
    const budget = brand === 'northstar' ? 9000 : brand === 'evergreen' ? 3500 : 12500;
    const gmv = (brand === 'northstar' ? 64000 : brand === 'evergreen' ? 20000 : 84000) * factor;
    const videos = (brand === 'northstar' ? 169 : brand === 'evergreen' ? 72 : 241) * factor;
    const value = (number: number) => scenario === 'unavailable' ? null : scenario === 'zero' ? 0 : number;
    const period = { start: factor === 3 ? '2026-10-11' : '2026-11-03', end: '2026-11-09' };
    const creators = [{ id: '101', real_name: 'Jordan Example', account_1: 'jordan.example', handles: ['jordan.example'], brand: 'northstar', retainer: 1500, monthly_post_requirement: 20 }, { id: '102', real_name: 'Riley Example', account_1: 'riley.example', handles: ['riley.example'], brand: 'evergreen', retainer: 1000, monthly_post_requirement: 15 }].filter(row => brand === 'all' || row.brand === brand).map(row => ({ ...row, is_managed: true, gmv_period: 1300, posts_period: 8, last_post_date: '2026-11-08', joined: '2026-10-01', creator_tags: [], product_tags: [], status: 'active', health: 'healthy', roi_period: null }));
    return Response.json({ data: scenario === 'zero' ? [] : creators, total: scenario === 'zero' ? 0 : creators.length, period, healthy_count: creators.length, ...(url.searchParams.get('summary') === '0' ? {} : { total_gmv_period: value(gmv), summary: { retainer_complete: scenario !== 'partial', retainer_missing_count: scenario === 'partial' ? 2 : 0, total_retainer: scenario === 'restricted' ? null : value(budget), affiliate_gmv: value(gmv * 3), videos_published: value(videos), gmv_complete: scenario !== 'partial', videos_complete: scenario !== 'partial', period_start: period.start, period_end: period.end } }) });
  }
  if (url.pathname === '/api/roster/studio') return Response.json({ rows: [] });
  if (url.pathname === '/api/roster/tags') return Response.json({ tags: ['elite'], canWrite: false });
  if (url.pathname === '/api/segments') return Response.json({ segments: [] });
  return Response.json({ error: `Local fixture: ${url.pathname} disabled.` }, { status: 503 });
};

function Fixture() {
  const params = useSearchParams();
  return <main className="rosterFixture"><aside className="fixtureNotice">Fictional local roster · {params.get('scenario') ?? 'complete data'} · all writes disabled</aside><RosterPage /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
