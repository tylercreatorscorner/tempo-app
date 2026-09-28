import { isCreatorOnboardingGuild } from './creator-onboarding-guild';

const API = 'https://discord.com/api/v10';
const VIEW_CHANNEL = BigInt(1) << BigInt(10);
const SEND_MESSAGES = BigInt(1) << BigInt(11);
const READ_MESSAGE_HISTORY = BigInt(1) << BigInt(16);
const MANAGE_CHANNELS = BigInt(1) << BigInt(4);
const MANAGE_ROLES = BigInt(1) << BigInt(28);
const ADMINISTRATOR = BigInt(1) << BigInt(3);

export interface CreatorDiscordDestination {
  tenantId: string;
  brandId: string;
  guildId: string;
  creatorRoleId: string;
  coachingCategoryId: string;
  staffRoleIds: string[];
}

export interface CreatorDiscordSetup extends CreatorDiscordDestination {
  startHereChannelId: string;
}

export interface CreatorDiscordSubject {
  enrollmentId: string;
  discordUserId: string;
  displayName: string;
}

export type DiscordFetch = typeof fetch;

type GuildMember = { roles: string[] };
type GuildRole = { id: string; position: number; permissions: string };
type GuildChannel = {
  id: string;
  parent_id?: string | null;
  topic?: string | null;
  type: number;
  permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>;
};

function everyoneCanView(channel: GuildChannel, basePermissions: bigint, guildId: string): boolean {
  let permissions = basePermissions;
  // Discord copies synchronized category overwrites onto the child. A
  // desynchronized child's own overwrites are authoritative.
  const overwrite = channel.permission_overwrites?.find((entry) => entry.id === guildId && entry.type === 0);
  if (overwrite) permissions = (permissions & ~BigInt(overwrite.deny)) | BigInt(overwrite.allow);
  return (permissions & VIEW_CHANNEL) !== BigInt(0);
}

function snowflake(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

function assertDestination(destination: CreatorDiscordDestination): void {
  if (!isCreatorOnboardingGuild(destination.tenantId, destination.brandId, destination.guildId)) {
    throw new Error('Discord server is not mapped to this brand.');
  }
  if (![destination.guildId, destination.creatorRoleId, destination.coachingCategoryId,
    ...destination.staffRoleIds].every(snowflake)) {
    throw new Error('Discord destination contains an invalid ID.');
  }
  if (!destination.staffRoleIds.length) {
    throw new Error('At least one authorized staff role is required for coaching chat.');
  }
  if (destination.staffRoleIds.includes(destination.creatorRoleId)) {
    throw new Error('The Creator role cannot also be a staff role.');
  }
}

function assertSubject(subject: CreatorDiscordSubject): void {
  if (!/^[a-f0-9-]{36}$/i.test(subject.enrollmentId) || !snowflake(subject.discordUserId)) {
    throw new Error('Invalid creator enrollment identity.');
  }
}

async function discordRequest<T>(path: string, token: string, fetcher: DiscordFetch, init?: RequestInit): Promise<T> {
  const response = await fetcher(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const retry = response.headers.get('retry-after');
    throw new Error(`Discord request failed (${response.status})${retry ? `; retry after ${retry}s` : ''}.`);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

/** Require a true #start-here-only view for a new member before enabling invitations. */
export async function validateCreatorHubDestination(
  setup: CreatorDiscordSetup,
  token: string,
  fetcher: DiscordFetch = fetch,
): Promise<void> {
  assertDestination(setup);
  if (!snowflake(setup.startHereChannelId)) throw new Error('Invalid start-here channel ID.');
  const bot = await discordRequest<{ id: string }>('/users/@me', token, fetcher);
  if (!snowflake(bot.id)) throw new Error('Discord returned an invalid bot identity.');
  const guild = setup.guildId;
  const [botMember, roles, channels] = await Promise.all([
    discordRequest<GuildMember>(`/guilds/${guild}/members/${bot.id}`, token, fetcher),
    discordRequest<GuildRole[]>(`/guilds/${guild}/roles`, token, fetcher),
    discordRequest<GuildChannel[]>(`/guilds/${guild}/channels`, token, fetcher),
  ]);
  const everyone = roles.find((role) => role.id === guild);
  const creator = roles.find((role) => role.id === setup.creatorRoleId);
  const botRoles = roles.filter((role) => botMember.roles.includes(role.id));
  if (!everyone || !creator || !botRoles.length ||
      !channels.some((channel) => channel.id === setup.coachingCategoryId && channel.type === 4) ||
      !setup.staffRoleIds.every((id) => roles.some((role) => role.id === id))) {
    throw new Error('The configured Discord roles or coaching category are unavailable.');
  }
  const botPosition = Math.max(...botRoles.map((role) => role.position));
  if (creator.position >= botPosition) {
    throw new Error('Move the Tempo Bot role above the configured Creator role.');
  }
  const botPermissions = botRoles.reduce((value, role) => value | BigInt(role.permissions), BigInt(everyone.permissions));
  if (!(botPermissions & ADMINISTRATOR) &&
      (!(botPermissions & MANAGE_ROLES) || !(botPermissions & MANAGE_CHANNELS) || !(botPermissions & BigInt(1)))) {
    throw new Error('Tempo Bot needs Manage Roles, Manage Channels, and Create Invite permissions.');
  }
  const everyonePermissions = BigInt(everyone.permissions);
  if (everyonePermissions & ADMINISTRATOR) throw new Error('@everyone has Administrator access.');
  const startHere = channels.find((channel) => channel.id === setup.startHereChannelId);
  if (!startHere || ![0, 5].includes(startHere.type) ||
      !everyoneCanView(startHere, everyonePermissions, guild)) {
    throw new Error('New members cannot see the configured #start-here channel.');
  }
  const otherPublic = channels.find((channel) => channel.id !== startHere.id && channel.type !== 4 &&
    everyoneCanView(channel, everyonePermissions, guild));
  if (otherPublic) throw new Error('New members can see another server channel before Hub completion. Restrict @everyone first.');
}

/**
 * Preflight checks the creator's membership and the bot's effective guild
 * permissions/role position. The caller must also verify the Hub completion
 * gate in the database before invoking either mutation below.
 */
export async function preflightCreatorDiscordAccess(
  destination: CreatorDiscordDestination,
  subject: CreatorDiscordSubject,
  token: string,
  fetcher: DiscordFetch = fetch,
): Promise<{ botUserId: string }> {
  assertDestination(destination);
  assertSubject(subject);
  if (!token) throw new Error('Discord bot token is missing.');
  const guild = destination.guildId;
  const bot = await discordRequest<{ id: string }>('/users/@me', token, fetcher);
  if (!snowflake(bot.id)) throw new Error('Discord returned an invalid bot identity.');
  const [botMember, creator, roles, channels] = await Promise.all([
    discordRequest<GuildMember>(`/guilds/${guild}/members/${bot.id}`, token, fetcher),
    discordRequest<GuildMember>(`/guilds/${guild}/members/${subject.discordUserId}`, token, fetcher),
    discordRequest<GuildRole[]>(`/guilds/${guild}/roles`, token, fetcher),
    discordRequest<GuildChannel[]>(`/guilds/${guild}/channels`, token, fetcher),
  ]);
  if (!creator || !Array.isArray(botMember.roles)) {
    throw new Error('Bot or creator is not a member of the brand server.');
  }
  const creatorRole = roles.find((role) => role.id === destination.creatorRoleId);
  if (!creatorRole) throw new Error('Configured Creator role does not exist.');
  if (!channels.some((channel) => channel.id === destination.coachingCategoryId && channel.type === 4)) {
    throw new Error('Configured coaching category does not exist.');
  }
  const botRoles = roles.filter((role) => botMember.roles.includes(role.id));
  const highestBotPosition = Math.max(...botRoles.map((role) => role.position), 0);
  for (const roleId of destination.staffRoleIds) {
    const role = roles.find((entry) => entry.id === roleId);
    if (!role || role.position >= highestBotPosition) {
      throw new Error('Tempo Bot must be above the configured coaching staff role.');
    }
  }
  if (creatorRole.position >= highestBotPosition) {
    throw new Error('Move the Tempo Bot role above the Creator role before enabling onboarding.');
  }
  const permissions = botRoles.reduce((value, role) => value | BigInt(role.permissions), BigInt(0));
  const everyone = roles.find((role) => role.id === guild);
  const effective = permissions | BigInt(everyone?.permissions ?? '0');
  if (!(effective & ADMINISTRATOR) && (!(effective & MANAGE_ROLES) || !(effective & MANAGE_CHANNELS))) {
    throw new Error('Tempo Bot needs Manage Roles and Manage Channels in this server.');
  }
  return { botUserId: bot.id };
}

function channelName(displayName: string, discordUserId: string): string {
  const slug = displayName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `coach-${slug || discordUserId}`;
}

/** Recover a previously created chat by its immutable enrollment marker on retry. */
export async function ensurePrivateCoachingChannel(
  destination: CreatorDiscordDestination,
  subject: CreatorDiscordSubject,
  botUserId: string,
  token: string,
  fetcher: DiscordFetch = fetch,
): Promise<string> {
  assertDestination(destination);
  assertSubject(subject);
  if (!snowflake(botUserId)) throw new Error('Invalid bot identity.');
  const marker = `tempo:onboarding:${subject.enrollmentId}`;
  const channels = await discordRequest<GuildChannel[]>(`/guilds/${destination.guildId}/channels`, token, fetcher);
  const existing = channels.find((channel) => channel.topic === marker);
  if (existing) {
    if (existing.type !== 0 || existing.parent_id !== destination.coachingCategoryId) {
      throw new Error('Existing coaching chat has the wrong type or category.');
    }
    const overwrites = existing.permission_overwrites ?? [];
    const everyone = overwrites.find((entry) => entry.id === destination.guildId && entry.type === 0);
    const creator = overwrites.find((entry) => entry.id === subject.discordUserId && entry.type === 1);
    const staffReady = destination.staffRoleIds.every((id) => overwrites.some((entry) =>
      entry.id === id && entry.type === 0 && (BigInt(entry.allow) & VIEW_CHANNEL) !== BigInt(0)));
    if (!everyone || (BigInt(everyone.deny) & VIEW_CHANNEL) === BigInt(0) ||
        !creator || (BigInt(creator.allow) & VIEW_CHANNEL) === BigInt(0) || !staffReady) {
      throw new Error('Existing coaching chat permissions have changed. Review them before retrying.');
    }
    return existing.id;
  }
  const access = (VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY).toString();
  const channel = await discordRequest<{ id: string }>(`/guilds/${destination.guildId}/channels`, token, fetcher, {
    method: 'POST',
    body: JSON.stringify({
      name: channelName(subject.displayName, subject.discordUserId),
      type: 0,
      parent_id: destination.coachingCategoryId,
      topic: marker,
      permission_overwrites: [
        { id: destination.guildId, type: 0, allow: '0', deny: VIEW_CHANNEL.toString() },
        { id: subject.discordUserId, type: 1, allow: access, deny: '0' },
        { id: botUserId, type: 1, allow: access, deny: '0' },
        ...destination.staffRoleIds.map((id) => ({ id, type: 0, allow: access, deny: '0' })),
      ],
    }),
  });
  if (!snowflake(channel.id)) throw new Error('Discord did not return a coaching channel ID.');
  return channel.id;
}

/** Call only after the database's required-item gate has passed. */
export async function grantCreatorRole(
  destination: CreatorDiscordDestination,
  subject: CreatorDiscordSubject,
  token: string,
  fetcher: DiscordFetch = fetch,
): Promise<void> {
  assertDestination(destination);
  assertSubject(subject);
  await discordRequest<void>(
    `/guilds/${destination.guildId}/members/${subject.discordUserId}/roles/${destination.creatorRoleId}`,
    token,
    fetcher,
    { method: 'PUT' },
  );
}

/** One-use, seven-day invitation into the configured #start-here channel. */
export async function createStartHereInvite(
  tenantId: string,
  brandId: string,
  guildId: string,
  startHereChannelId: string,
  token: string,
  fetcher: DiscordFetch = fetch,
): Promise<string> {
  if (!isCreatorOnboardingGuild(tenantId, brandId, guildId) ||
      !snowflake(startHereChannelId)) {
    throw new Error('The start-here channel is not configured for this brand.');
  }
  const channel = await discordRequest<{ guild_id?: string; type?: number }>(
    `/channels/${startHereChannelId}`, token, fetcher,
  );
  if (channel.guild_id !== guildId || ![0, 5].includes(channel.type ?? -1)) {
    throw new Error('The start-here channel is not in the brand server.');
  }
  const invite = await discordRequest<{ code?: string }>(`/channels/${startHereChannelId}/invites`, token, fetcher, {
    method: 'POST',
    body: JSON.stringify({ max_age: 7 * 24 * 60 * 60, max_uses: 1, unique: true, temporary: false }),
  });
  if (!invite.code || !/^[A-Za-z0-9-]{2,40}$/.test(invite.code)) {
    throw new Error('Discord did not return a valid invitation.');
  }
  return `https://discord.gg/${invite.code}`;
}
