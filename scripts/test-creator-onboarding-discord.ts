import assert from 'node:assert/strict';
import {
  ensurePrivateCoachingChannel,
  grantCreatorRole,
  preflightCreatorDiscordAccess,
  validateCreatorHubDestination,
  type CreatorDiscordDestination,
  type CreatorDiscordSubject,
} from '../src/lib/discord/creator-onboarding';

const destination: CreatorDiscordDestination = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  brandId: 'b0000000-0000-0000-0000-000000000003',
  guildId: '1339335585776533708',
  creatorRoleId: '1339335585776533710',
  coachingCategoryId: '1339335585776533711',
  staffRoleIds: ['1339335585776533712'],
};
const startHereChannelId = '1339335585776533717';
const subject: CreatorDiscordSubject = {
  enrollmentId: 'c95293f1-ad85-476d-ac51-0e94bc4a821b',
  discordUserId: '1339335585776533713',
  displayName: 'Creator Name',
};
const botId = '1339335585776533714';
const marker = `tempo:onboarding:${subject.enrollmentId}`;
let channels: Array<{ id: string; type: number; parent_id: string | null; topic: string | null;
  permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }> }> = [
  { id: destination.coachingCategoryId, type: 4, parent_id: null, topic: null },
  { id: startHereChannelId, type: 0, parent_id: null, topic: null,
    permission_overwrites: [{ id: destination.guildId, type: 0, allow: '1024', deny: '0' }] },
];
const writes: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
let guildEveryonePermissions = '0';

const fakeFetch: typeof fetch = async (url, init) => {
  const path = String(url).replace('https://discord.com/api/v10', '');
  const method = init?.method ?? 'GET';
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
  if (method !== 'GET') writes.push({ path, method, body });
  let data: unknown;
  if (path === '/users/@me') data = { id: botId };
  else if (path.endsWith(`/members/${botId}`)) data = { roles: ['1339335585776533715'] };
  else if (path.endsWith(`/members/${subject.discordUserId}`)) data = { roles: [] };
  else if (path.endsWith('/roles')) data = [
    { id: destination.guildId, position: 0, permissions: guildEveryonePermissions },
    { id: '1339335585776533715', position: 5, permissions: String((BigInt(1) << BigInt(28)) | (BigInt(1) << BigInt(4)) | BigInt(1)) },
    { id: destination.creatorRoleId, position: 2, permissions: '0' },
    { id: destination.staffRoleIds[0], position: 1, permissions: '0' },
  ];
  else if (path.endsWith('/channels') && method === 'GET') data = channels;
  else if (path.endsWith('/channels') && method === 'POST') {
    data = { id: '1339335585776533716' };
    channels = [...channels, { id: '1339335585776533716', type: 0, parent_id: destination.coachingCategoryId,
      topic: marker, permission_overwrites: body?.permission_overwrites as Array<{ id: string; type: number; allow: string; deny: string }> }];
  } else if (path.includes('/roles/') && method === 'PUT') return new Response(null, { status: 204 });
  else throw new Error(`Unexpected request: ${method} ${path}`);
  return Response.json(data);
};

async function main() {
const preflight = await preflightCreatorDiscordAccess(destination, subject, 'test-token', fakeFetch);
assert.equal(preflight.botUserId, botId);
await validateCreatorHubDestination({ ...destination, startHereChannelId }, 'test-token', fakeFetch);
channels.push({ id: '1339335585776533718', type: 0, parent_id: null, topic: null,
  permission_overwrites: [{ id: destination.guildId, type: 0, allow: '1024', deny: '0' }] });
await assert.rejects(validateCreatorHubDestination({ ...destination, startHereChannelId }, 'test-token', fakeFetch),
  /another server channel/);
channels.pop();
// Category permissions are copied only while synchronized. An unsynchronized
// child with no deny is public when @everyone can view at guild level.
channels.push({ id: '1339335585776533719', type: 4, parent_id: null, topic: null,
  permission_overwrites: [{ id: destination.guildId, type: 0, allow: '0', deny: '1024' }] });
channels.push({ id: '1339335585776533720', type: 0, parent_id: '1339335585776533719', topic: null });
guildEveryonePermissions = '1024';
await assert.rejects(validateCreatorHubDestination({ ...destination, startHereChannelId }, 'test-token', fakeFetch),
  /another server channel/);
guildEveryonePermissions = '0';
channels.splice(-2);
const first = await ensurePrivateCoachingChannel(destination, subject, botId, 'test-token', fakeFetch);
const second = await ensurePrivateCoachingChannel(destination, subject, botId, 'test-token', fakeFetch);
assert.equal(first, second);
assert.equal(writes.filter((write) => write.method === 'POST').length, 1);
const created = writes.find((write) => write.method === 'POST')?.body;
assert.equal(created?.topic, marker);
const overwrites = created?.permission_overwrites as Array<{ id: string; deny: string }>;
assert.equal(overwrites.find((entry) => entry.id === destination.guildId)?.deny, '1024');
assert.ok(overwrites.some((entry) => entry.id === subject.discordUserId));
await grantCreatorRole(destination, subject, 'test-token', fakeFetch);
assert.equal(writes.filter((write) => write.method === 'PUT').length, 1);
await assert.rejects(
  preflightCreatorDiscordAccess({ ...destination, tenantId: '00000000-0000-0000-0000-000000000002' }, subject, 'test-token', fakeFetch),
  /not mapped/,
);
await assert.rejects(
  preflightCreatorDiscordAccess({ ...destination, brandId: 'b0000000-0000-0000-0000-000000000004' }, subject, 'test-token', fakeFetch),
  /not mapped/,
);
console.log('Creator onboarding Discord preflight, private chat, and retry checks passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
