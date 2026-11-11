import { createRoot } from 'react-dom/client';
import { CreatorInvitesSection } from '../../src/components/settings/creator-invites-section';
import JoinPage from '../../src/app/join/[code]/page';
import { ChatThread } from '../../src/components/messages/chat-thread';
import LegacyHub from '../../src/app/(admin)/messages/legacy-hub';
import { CoachingRecords } from '../../src/app/(admin)/reporting/coaching/records';
import { EliteView } from '../../src/app/(admin)/reporting/coaching/elite/view';
import { blankDraft } from '../../src/lib/coaching/model';
import { usePathname, useSearchParams } from './workspace-system-navigation';
import { brands } from './operations-hooks';
import { StandaloneFinanceFixture, financeFixtureResponse } from './standalone-finance';
import './operations-controls.css';
import workspaceTheme from '../../src/components/layout/workspace-theme.module.css';
import studioTheme from '../../src/components/layout/dashboard-studio-shell.module.css';

let threadFailed = false;
let inviteCount = 0;
const longMessages = Array.from({ length: 80 }, (_, i) => ({
  id: `message-${i + 1}`, direction: i % 2 ? 'outbound' : 'inbound', channel: 'dm', status: 'delivered', sent_by: null,
  sent_at: new Date(Date.UTC(2026, 10, 10, 10, i)).toISOString(),
  content: i === 79 ? `Latest fictional message 80. This tests a long source URL: https://example.invalid/${'very-long-path-segment-'.repeat(12)}\nPlease review these three videos and share detailed feedback before our next call.` : `Fictional message ${i + 1}. ${i % 2 ? 'Thanks for the update; here are the next steps.' : 'I uploaded the new videos and would appreciate feedback on the hook.'}`,
}));
const conversations = ['one', 'two'].map((key, index) => ({ creator_id: 0, creator_name: `Example Creator ${index ? 'Two' : 'One With A Longer Display Name'}`, discord_user_id: `discord-${key}`, tiktok_handle: null, brand: 'northstar', brands: ['northstar'], retainer_amount: null, last_message: 'Fictional incoming message', last_message_at: '2026-11-10T11:19:00Z', direction: 'inbound', unread_count: 1, message_count: 80, total_videos_7d: 5, total_gmv_7d: 500, status: 'active', discord_avatar: null, latest_topic: null }));
const coaching = { userId: 'coach', admin: true, canWrite: true, canConfigure: true, assignments: [{ id: 'assignment', brand_id: 'brand-one', coach_id: 'coach', reviewer_id: 'reviewer', active: true }], reports: [{ id: 'report', assignment_id: 'assignment', status: 'draft', version: 1, draft: blankDraft() }], people: [{ user_id: 'coach', name: 'Jordan Example Coach', email: 'coach@example.invalid' }, { user_id: 'reviewer', name: 'Riley Example Reviewer', email: 'reviewer@example.invalid' }], brands: [{ id: 'brand-one', name: brands[0].name }], submissions: [], reviews: [] };
// Every fetch is intercepted. Unknown routes fail closed; this fixture never calls a live API.
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
  const scenario = new URLSearchParams(window.location.search).get('scenario');
  const method = init?.method ?? 'GET';
  await new Promise(resolve => setTimeout(resolve, 180));
  const financeResponse = financeFixtureResponse(url, init, scenario);
  if (financeResponse) return financeResponse;
  if (url.pathname === '/api/invites/generate') return scenario === 'generate-error'
    ? Response.json({ error: 'Fixture: could not generate the link. Please retry.' }, { status: 503 })
    : Response.json({ invite: { id: `invite-${++inviteCount}`, code: '0123456789abcdef0123456789abcdef', brand: JSON.parse(String(init?.body)).brand, expires_at: '2026-11-17', max_uses: 100, current_uses: 0, active: true } });
  if (url.pathname.startsWith('/api/invites/')) return scenario === 'invalid'
    ? Response.json({ error: 'This invite has expired' }, { status: 410 })
    : Response.json({ brand: 'northstar', brand_display_name: 'Northstar Example Brand' });
  if (url.pathname === '/api/join') return scenario === 'join-error'
    ? Response.json({ error: 'This information needs to be verified by your brand manager. No existing creator account was changed.' }, { status: 409 })
    : Response.json({ success: true, creator_id: 'fictional-creator', verified: false });
  if (url.pathname === '/api/messages/conversations') return Response.json({ conversations });
  if (/\/api\/messages\/[^/]+\/mark-read$/.test(url.pathname)) return Response.json({ ok: true });
  if (/\/api\/messages\/[^/]+\/send$/.test(url.pathname)) return Response.json({ error: 'Fixture: delivery is disabled. Draft should remain available.' }, { status: 503 });
  if (/\/api\/messages\/[^/]+$/.test(url.pathname)) {
    if (scenario === 'thread-error' && !threadFailed) { threadFailed = true; return Response.json({ error: 'Fixture: first request failed.' }, { status: 403 }); }
    const page = Number(url.searchParams.get('page') || 1);
    return Response.json({ messages: longMessages.slice(Math.max(0, 80 - page * 50), 80 - (page - 1) * 50), hasMore: page === 1 });
  }
  if (url.pathname === '/api/comms/health') return Response.json({ botOnline: true, botLastSeenAt: new Date().toISOString(), inboundLast7d: 8 });
  if (url.pathname === '/api/broadcasts/preview') return Response.json({ eligible: 2, skipped: [], estSeconds: 2 });
  if (url.pathname === '/api/broadcasts' && method === 'GET') return Response.json({ broadcasts: [] });
  if (url.pathname === '/api/segments') return Response.json({ segments: [] });
  if (url.pathname === '/api/coaching' && method === 'GET') return Response.json(coaching);
  if (url.pathname === '/api/coaching/elite') return Response.json({ rows: [], brands: [{ id: 'brand-one', slug: 'northstar', name: brands[0].name }], week: '2026-11-01', previousStart: '2026-10-25', end: '2026-11-07', unmatched: 0 });
  return Response.json({ error: `Fixture: ${method} ${url.pathname} is disabled.` }, { status: 503 });
};
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {
  await new Promise(resolve => setTimeout(resolve, 200));
  if (new URLSearchParams(window.location.search).get('scenario') === 'copy-failure') throw new Error('Fixture clipboard denied');
} } });
function App() {
  const path = usePathname();
  const params = useSearchParams();
  let content;
  if (path === '/invoicing-fixture' || params.get('fixture') === 'invoice') content = <StandaloneFinanceFixture mode="invoice" readOnly={params.get('readonly') === 'yes'} />;
  else if (path === '/finance-settings' || params.get('fixture') === 'settings') content = <StandaloneFinanceFixture mode="settings" readOnly={params.get('readonly') === 'yes'} />;
  else if (path === '/onboarding' || path === '/roster/invitations') content = <CreatorInvitesSection tenantId="fixture" initialBrand={params.get('brand') ?? undefined} brands={params.get('scenario') === 'empty' ? [] : [...brands, { slug: 'other', name: 'Another Example Brand With A Long Name', display_name: null }]} />;
  else if (path.startsWith('/join/')) content = <JoinPage />;
  else if (path === '/chat') content = <div className="fixtureChat"><ChatThread creatorId={1} creatorName="Example Creator With A Long Display Name" discordUserId="discord-one" brandName={brands[0].name} /></div>;
  else if (path === '/coaching' || path === '/reporting/coaching') content = <CoachingRecords />;
  else if (path === '/reporting/coaching/elite') content = <EliteView canManageGroups={params.get('groups') === 'yes'} />;
  else if (path === '/messages' && ['templates', 'inbox', 'broadcasts'].includes(params.get('tab') ?? '')) content = <LegacyHub />;
  else content = <div className="fixtureLanding">Operations landing fixture. Use an explicit Broadcasts, Inbox, or Templates tab to open Communications.</div>;
  return <div className={`fixtureWorkspace ${workspaceTheme.workspace} ${studioTheme.workspace}`} data-workspace="tempo" data-dashboard-studio><nav className="fixtureNav"><strong>Local fixture · fictional data · sends disabled</strong><a href="/onboarding?scenario=copy-failure">Copy failure</a><a href="/chat?scenario=thread-error">Chat error + retry</a><a href="/chat?scenario=long-thread">Long thread</a><a href="/messages?tab=inbox&scenario=thread-error">Inbox</a><a href="/messages?tab=templates&brand=northstar">Templates</a><a href="/coaching">Coaching</a><a href="/reporting/coaching/elite">Elite read-only</a></nav><main className="fixtureMain">{content}</main></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
